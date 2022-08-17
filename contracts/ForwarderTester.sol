// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

// Import this file to use console.log
import "hardhat/console.sol";
import "@openzeppelin/contracts/metatx/ERC2771Context.sol";

contract ForwarderTester is ERC2771Context {
    event MessageSent(address indexed sender);

    constructor(address trustedForwarder) ERC2771Context(trustedForwarder) {}

    function testSender() public returns (address) {
        emit MessageSent(_msgSender());
        return _msgSender();
    }
}
