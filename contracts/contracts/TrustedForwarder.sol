// SPDX-License-Identifier: MIT
// OpenZeppelin Contracts (last updated v4.7.0) (metatx/MinimalForwarder.sol)

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/utils/Checkpoints.sol";
import "hardhat/console.sol";
import "./interfaces/IDiceRoller.sol";

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
    using Checkpoints for Checkpoints.History;

    event NonceUpdated(uint256 indexed blockNumber, uint256 indexed nonce);

    string public SERVICE;
    string public STATEMENT;
    string public URI;
    string public VERSION;

    Checkpoints.History private _nonces;

    mapping(address => mapping(bytes32 => bool)) public revoked;

    // cannot have an immutable string
    string public CHAIN_ID;

    IDiceRoller immutable diceRoller;

    struct ForwardRequest {
        address from;
        address to;
        uint256 value;
        uint256 gas;
        uint256 issuedAt;
        bytes data;
    }

    struct MultiResponse {
        bool success;
        bytes returnData;
    }

    constructor(
        address diceRollerAddress,
        string memory _service,
        string memory _statement,
        string memory _uri,
        string memory _version
    ) {
        CHAIN_ID = Strings.toString(block.chainid);
        SERVICE = _service;
        STATEMENT = _statement;
        URI = _uri;
        VERSION = _version;
        diceRoller = IDiceRoller(diceRollerAddress);
        updateNonce();
    }

    // anyone can call this at any time, because randomness comes from the chain
    function updateNonce() public returns (bool) {
        // checkpoints must fit into a uint224 for some reason
        uint256 rnd = uint224(uint256(diceRoller.getRandom()));
        _nonces.push(rnd);

        emit NonceUpdated(block.number, rnd);
        return true;
    }

    function getNonceAt(uint256 blockNumber) public view returns (uint256) {
        return _nonces.getAtBlock(blockNumber);
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
    ) public payable returns (MultiResponse[] memory responses) {
        uint256 len = requests.length;
        responses = new MultiResponse[](len);
        for (uint256 i = 0; i < len; i++) {
            (bool success, bytes memory resp) = execute(requests[i], signature);
            responses[i] = MultiResponse({success: success, returnData: resp});
        }
        return responses;
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
            "\n\n",
            "URI: ",
            URI,
            "\n",
            "Version: ",
            VERSION,
            "\n",
            "Chain Id: ",
            CHAIN_ID,
            "\n",
            "Nonce: ",
            Strings.toHexString(getNonceAt(issuedAt)),
            "\n",
            "Issued At: ",
            Strings.toString(issuedAt),
            "\n",
            "Request ID: ",
            Strings.toHexString(relayer)
        );
        return ECDSA.toEthSignedMessageHash(stringToSign);
    }
}
