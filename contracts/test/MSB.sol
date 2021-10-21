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

import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../interfaces/IKy0xMain.sol";

contract MSB {
    using Strings for string;
    IKy0xMain public main;

    event MatchInfo(bytes32 _kID, uint8[] _matches, uint256 _paymentAmount, uint256[] _blockNumbers);

    constructor(address _proxy) {
       main = IKy0xMain(_proxy);
    }

    function callKy0x(
        bytes32 _hashWalletSig,
        bytes32[] calldata _nonceSigsKD,
        bytes32[] calldata _rawValues,
        uint256[] calldata _dataTypes,
        address _erc20
    ) public {
        uint256 paymentAmount = main.calculateAmountPayment(_erc20);
        IERC20(_erc20).approve(address(main), paymentAmount);

        uint8[] memory matches;
        bytes32 ky0xID;

        (ky0xID, matches) = main.queryAttributesMatch(
            _hashWalletSig,
            msg.sender,
            _nonceSigsKD,
            _dataTypes,
            _rawValues,
            _erc20
        );
        uint256[] memory blockNumbers = main.getBlockNumbers(_hashWalletSig, msg.sender, _dataTypes);
        emit MatchInfo(ky0xID, matches, paymentAmount, blockNumbers);
    }

    function deposit(bytes32[] calldata _nonceSigsKD, bytes32 _hashWalletSig, address _erc20) public
    {
        uint8[] memory matches;
        bytes32 ky0xID;
        (ky0xID, matches) = _deposit(_nonceSigsKD, _hashWalletSig, _erc20);
        require(matches.length == _nonceSigsKD.length, "length match invalid");
        require(ky0xID != bytes32(0), "ky0xID not found");
        for (uint256 i = 0; i < _nonceSigsKD.length; i++) {
            require(matches[i] == 1, "KYC no match");
        }
    }

    function depositWithEvents(bytes32[] calldata _nonceSigsKD, bytes32 _hashWalletSig, address _erc20) public
    {
        _deposit(_nonceSigsKD, _hashWalletSig, _erc20);
    }

    function _deposit(bytes32[] calldata _nonceSigsKD, bytes32 _hashWalletSig, address _erc20)
        internal
        returns (bytes32, uint8[] memory)
    {
        uint256 paymentAmount = main.calculateAmountPayment(_erc20);
        IERC20(_erc20).approve(address(main), paymentAmount);
        uint8[] memory matches;
        bytes32 ky0xID;
        uint256[] memory dataTypes = new uint256[](_nonceSigsKD.length);
        bytes32[] memory rawValues = new bytes32[](_nonceSigsKD.length);
        rawValues[0] = keccak256("PASS");
        dataTypes[0] = 0;
        if (_nonceSigsKD.length == 2) {
            // AML_STATUS is present
            dataTypes[1] = 1;
            rawValues[1] = keccak256("LOW_RISK");
        }

        (ky0xID, matches) = main.queryAttributesMatch(
            _hashWalletSig,
            msg.sender,
            _nonceSigsKD,
            dataTypes,
            rawValues,
            _erc20
        );
        uint256[] memory blockNumbers = main.getBlockNumbers(_hashWalletSig, msg.sender, dataTypes);
        emit MatchInfo(ky0xID, matches, paymentAmount, blockNumbers);
        return (ky0xID, matches);
    }
}
