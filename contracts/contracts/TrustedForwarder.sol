// SPDX-License-Identifier: MIT
// OpenZeppelin Contracts (last updated v4.7.0) (metatx/MinimalForwarder.sol)

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "hardhat/console.sol";

/**
 * @dev Simple minimal forwarder to be used together with an ERC2771 compatible contract. See {ERC2771Context}.
 *
 * MinimalForwarder is mainly meant for testing, as it is missing features to be a good production-ready forwarder. This
 * contract does not intend to have all the properties that are needed for a sound forwarding system. A fully
 * functioning forwarding system with good properties requires more complexity. We suggest you look at other projects
 * such as the GSN which do have the goal of building a system like that.
 */
contract TrustedForwarder {
    using ECDSA for bytes32;

    string constant SERVICE = "service.invalid";
    string constant STATEMENT = "I accept the ServiceOrg Terms of Service: https://service.invalid/tos";
    string constant URI = "https://service.invalid/login";
    string constant VERSION = "1";

    // cannot have an immutable string
    string public CHAIN_ID;

    struct ForwardRequest {
        address from;
        address to;
        uint256 value;
        uint256 gas;
        bytes32 nonce;
        bytes data;
    }

    constructor() {
      CHAIN_ID = Strings.toString(block.chainid);
    }

    function getNonce() public view returns (bytes32) {
        return keccak256(abi.encodePacked("test"));
    }

    function verify(ForwardRequest calldata req, bytes calldata signature) public view returns (bool) {
        bytes memory stringToSign = abi.encodePacked(
          SERVICE,
          " wants you to sign in with your Ethereum account: ",
          Strings.toHexString(req.from),
          "\n\n",
          STATEMENT,
          "\n\n",
          "URI: ", URI,
          "\n",
          "Version: ", VERSION,
          "\n",
          "Chain Id: ", CHAIN_ID,
          "\n",
          "Nonce: ", Strings.toHexString(uint256(getNonce()))
        );
        bytes32 msgHash = ECDSA.toEthSignedMessageHash(stringToSign);
        console.log('sol string to sign: "', string(stringToSign));
        bool result = ECDSA.recover(msgHash, signature) == req.from;
        if (!result) {
          revert("woops");
        }
        return result;
        // address signer = _hashTypedDataV4(
        //     keccak256(abi.encode(_TYPEHASH, req.from, req.to, req.value, req.gas, req.nonce, keccak256(req.data)))
        // ).recover(signature);
        // return _nonces[req.from] == req.nonce && signer == req.from;
    }

    // function execute(ForwardRequest calldata req, bytes calldata signature)
    //     public
    //     payable
    //     returns (bool, bytes memory)
    // {
    //     require(verify(req, signature), "MinimalForwarder: signature does not match request");
    //     _nonces[req.from] = req.nonce + 1;

    //     (bool success, bytes memory returndata) = req.to.call{gas: req.gas, value: req.value}(
    //         abi.encodePacked(req.data, req.from)
    //     );

    //     // Validate that the relayer has sent enough gas for the call.
    //     // See https://ronan.eth.link/blog/ethereum-gas-dangers/
    //     if (gasleft() <= req.gas / 63) {
    //         // We explicitly trigger invalid opcode to consume all gas and bubble-up the effects, since
    //         // neither revert or assert consume all gas since Solidity 0.8.0
    //         // https://docs.soliditylang.org/en/v0.8.0/control-structures.html#panic-via-assert-and-error-via-require
    //         /// @solidity memory-safe-assembly
    //         assembly {
    //             invalid()
    //         }
    //     }

    //     return (success, returndata);
    // }
}