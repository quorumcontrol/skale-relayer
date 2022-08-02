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

    string constant SERVICE = "service.invalid";
    string constant STATEMENT = "I accept the ServiceOrg Terms of Service: https://service.invalid/tos";
    string constant URI = "https://service.invalid/login";
    string constant VERSION = "1";

    Checkpoints.History private _nonces;

    mapping(address => bytes32) public revoked;

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

    constructor(address diceRollerAddress) {
      CHAIN_ID = Strings.toString(block.chainid);
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

    function verify(address from, uint256 issuedAt, bytes calldata signature) public view returns (bool) {
        bytes memory stringToSign = abi.encodePacked(
          SERVICE,
          " wants you to sign in with your Ethereum account: ",
          Strings.toHexString(from),
          "\n\n",
          STATEMENT,
          "\n\n",
          "URI: ", URI,
          "\n",
          "Version: ", VERSION,
          "\n",
          "Chain Id: ", CHAIN_ID,
          "\n",
          "Nonce: ", Strings.toHexString(getNonceAt(issuedAt)),
          "\n",
          "Issued At: ", Strings.toString(issuedAt),
          "\n",
          "Request ID: ", Strings.toHexString(msg.sender)
        );
        bytes32 msgHash = ECDSA.toEthSignedMessageHash(stringToSign);
        // console.log('sol string to sign: "', string(stringToSign));
        bool result = ECDSA.recover(msgHash, signature) == from;
        if (!result) {
          revert("woops");
        }
        return result;
    }

    function execute(ForwardRequest calldata req, bytes calldata signature)
        public
        payable
        returns (bool, bytes memory)
    {
        require(verify(req.from, req.issuedAt, signature), "TrustedForwarder: signature does not match request");

        (bool success, bytes memory returndata) = req.to.call{gas: req.gas, value: req.value}(
            abi.encodePacked(req.data, req.from)
        );

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
}