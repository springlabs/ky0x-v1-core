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

pragma solidity =0.8.2;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

contract Ky0xStore is Initializable {
    bytes32 internal constant ATTESTOR_ROLE = keccak256("ATTESTOR_ROLE");
    bytes32 internal constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    enum Error { NO_ERROR, NOT_FOUND }
    enum MatchStatus { NOT_FOUND, MATCH, NO_MATCH }

    struct WalletInfo {
        bytes32 attestation;
        bytes32 nonce; // Nonce used to compute the attestation at posting
        bytes32 kID; // ky0xID associated to a wallet address
        uint256 blockNumber; // time at posting
        uint256 nonceCounter; // incremental counter to obfuscate noncesigkd
    }

    // DataType => Enable/Disable
    mapping(uint256 => bool) public dataTypesMap;
    // keccak256(keccak256(WalletSig) | WalletAddr) => DataType => WalletInfo
    mapping(bytes32 => mapping(uint256 => WalletInfo)) internal walletInfoMap;
    // Assets allowed for Payment: (ERC20 address => True/False)
    mapping(address => bool) public tokenAllowedPaymentMap;
    // ERC20 => ChainLINK Price Oracle
    mapping(address => AggregatorV3Interface) internal priceFeedMap;

    // Treasury to receive funds
    address public treasury;
    // Cost for a query transaction in USD (18 decimals)
    uint256 public transactionCostUSD;
    bool public paused;
}

