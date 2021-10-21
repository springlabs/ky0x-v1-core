// SPDX-License-Identifier: UNLICENSED
//
// © 2021 Springcoin, Inc.   Any computer software, smart contract, or application (including upgrades and replacements)
// (collectively, “Software”) contained herein are owned by Springcoin, Inc. or its affiliates (“Company”), shall remain
// proprietary to Company, and shall in all events remain the exclusive property of Company.  Nothing contained in this
// Software nor the provision of its source code shall confer the right to use, reproduce, copy, modify, create
// derivative works, or make non-production use of  any of such Software.  This Software is not released or otherwise
// available under an Open Source license, nor is it open source software. All use of the Software or its source code is
// subject to the previously accepted Terms of Use. Any use of the Software or its source code inconsistent with the
// Terms of Use is strictly prohibited.
//
// Customizations, updates or corrections of Software, if any, are the property of, and all rights thereto, are owned by
// Company.  Any viewers of this Software also acknowledge that such Software, updates, or corrections are a trade
// secret of Company, are valuable and confidential to Company.
//
// Removal or alteration of this copyright notice is strictly prohibited.

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract KERC20 is ERC20 {
    uint8 _decimals;

    constructor(string memory name_, string memory symbol_, uint8 decimals_) ERC20(name_, symbol_) {
        _mint(msg.sender, 1000000000 * 10 ** decimals_);
        _decimals = decimals_;
    }

    function decimals() public view virtual override returns (uint8) {
        return _decimals;
    }
}
