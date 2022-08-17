// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IDiceRoller {

  function getRandom() external view returns (bytes32 rnd);

}