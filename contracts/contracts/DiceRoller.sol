//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "./interfaces/IDiceRoller.sol";

contract DiceRoller is IDiceRoller {
    function getRandom() public override view returns (bytes32 rnd) {
        assembly {
            let freemem := mload(0x40)
            let start_addr := add(freemem, 0)
            if iszero(staticcall(gas(), 0x18, 0, 0, start_addr, 32)) {
                invalid()
            }
            rnd := mload(freemem)
        }
    }
}
