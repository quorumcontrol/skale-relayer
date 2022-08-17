//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "./interfaces/IDiceRoller.sol";
contract TestDiceRoller is IDiceRoller {
    function getRandom() public override view returns (bytes32 rnd) {
      // THIS IS NOT FOR PRODUCTION USE
      return blockhash(block.number - 1);
    }
}
