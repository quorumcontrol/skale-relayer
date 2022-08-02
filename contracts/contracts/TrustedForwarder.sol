// SPDX-License-Identifier: MIT
// OpenZeppelin Contracts (last updated v4.7.0) (metatx/MinimalForwarder.sol)

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "./Noncer.sol";
// import "hardhat/console.sol";

/**
 * @dev Simple minimal forwarder to be used together with an ERC2771 compatible contract. See {ERC2771Context}.
 *
 * MinimalForwarder is mainly meant for testing, as it is missing features to be a good production-ready forwarder. This
 * contract does not intend to have all the properties that are needed for a sound forwarding system. A fully
 * functioning forwarding system with good properties requires more complexity. We suggest you look at other projects
 * such as the GSN which do have the goal of building a system like that.
 */
contract TrustedForwarder {
    // using ECDSA for bytes32;

    string public SERVICE;
    string public STATEMENT;
    string public URI;
    string public VERSION;

    mapping(address => mapping(bytes32 => bool)) public revoked;

    Noncer immutable noncer;

    // cannot have an immutable string
    string public CHAIN_ID;

    struct ForwardRequest {
        address from;
        address to;
        uint256 value;
        uint256 gas;
        uint256 issuedAt;
        bytes data;
    }

    constructor(
        address noncerAddress,
        string memory _service,
        string memory _statement,
        string memory _uri,
        string memory _version
    ) {
        noncer = Noncer(noncerAddress);
        CHAIN_ID = Strings.toString(block.chainid);
        SERVICE = _service;
        STATEMENT = _statement;
        URI = _uri;
        VERSION = _version;
    }

    function getNonceAt(uint256 blockNumber) public view returns (uint256) {
      return noncer.getNonceAt(blockNumber);
    }

    function revoke(
        address from,
        address relayer,
        uint256 issuedAt,
        bytes calldata signature
    ) external returns (bool) {
        require(
            (msg.sender == from || msg.sender == relayer),
            "TrustedForwarder: Must be sender or relayer"
        );
        if (msg.sender == relayer) {
            require(
                verify(from, msg.sender, issuedAt, signature),
                "TrustedForwarder: Invalid revoke"
            );
        }
        revoked[from][_hashForToken(from, relayer, issuedAt)] = true;
        return true;
    }

    function verify(
        address from,
        address relayer,
        uint256 issuedAt,
        bytes calldata signature
    ) public view returns (bool) {
        bytes32 msgHash = _hashForToken(from, relayer, issuedAt);
        require(!revoked[from][msgHash], "TrustedForwarder: Token Revoked");
        // console.log('sol string to sign: "', string(stringToSign));
        bool result = ECDSA.recover(msgHash, signature) == from;
        return result;
    }

    function multiExecute(
        ForwardRequest[] calldata requests,
        bytes calldata signature
    ) public payable returns (bool[] memory, bytes[] memory) {
        uint256 len = requests.length;
        bool[] memory successes = new bool[](len);
        bytes[] memory responses = new bytes[](len);
        for (uint256 i = 0; i < len; i++) {
            (bool success, bytes memory resp) = execute(requests[i], signature);
            successes[i] = success;
            responses[i] = resp;
        }
        return (successes, responses);
    }

    function execute(ForwardRequest calldata req, bytes calldata signature)
        public
        payable
        returns (bool, bytes memory)
    {
        require(
            verify(req.from, msg.sender, req.issuedAt, signature),
            "TrustedForwarder: signature does not match request"
        );

        (bool success, bytes memory returndata) = req.to.call{
            gas: req.gas,
            value: req.value
        }(abi.encodePacked(req.data, req.from));

        // Validate that the relayer has sent enough gas for the call.
        // See https://ronan.eth.link/blog/ethereum-gas-dangers/
        if (gasleft() <= req.gas / 63) {
            // We explicitly trigger invalid opcode to consume all gas and bubble-up the effects, since
            // neither revert or assert consume all gas since Solidity 0.8.0
            // https://docs.soliditylang.org/en/v0.8.0/control-structures.html#panic-via-assert-and-error-via-require
            /// @solidity memory-safe-assembly
            assembly {
                invalid()
            }
        }

        return (success, returndata);
    }

    function _hashForToken(
        address from,
        address relayer,
        uint256 issuedAt
    ) private view returns (bytes32) {
        bytes memory stringToSign = abi.encodePacked(
            SERVICE,
            " wants you to sign in with your Ethereum account: ",
            Strings.toHexString(from),
            "\n\n",
            STATEMENT,
            "\n\nURI: ",
            URI,
            "\nVersion: ",
            VERSION,
            "\nChain Id: ",
            CHAIN_ID,
            "\nNonce: ",
            Strings.toHexString(getNonceAt(issuedAt)),
            "\nIssued At: ",
            Strings.toString(issuedAt),
            "\nRequest ID: ",
            Strings.toHexString(relayer)
        );
        return ECDSA.toEthSignedMessageHash(stringToSign);
    }
}
