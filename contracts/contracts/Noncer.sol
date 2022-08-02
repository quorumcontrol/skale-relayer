// SPDX-License-Identifier: MIT
// OpenZeppelin Contracts (last updated v4.7.0) (metatx/MinimalForwarder.sol)

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/Checkpoints.sol";
import "./interfaces/IDiceRoller.sol";

// import "hardhat/console.sol";

contract Noncer {
    using Checkpoints for Checkpoints.History;

    event NonceUpdated(uint256 indexed blockNumber, uint256 indexed nonce);

    Checkpoints.History private _nonces;

    IDiceRoller immutable diceRoller;

    constructor(address _diceRollerAddress) {
        diceRoller = IDiceRoller(_diceRollerAddress);
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
}
