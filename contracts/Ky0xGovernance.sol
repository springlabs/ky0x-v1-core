// SPDX-License-Identifier: UNLICENSED
//
// © 2021 Springcoin, Inc.   Any computer software, smart contract, or application (including upgrades and replacements)
// (collectively, “Software”) contained herein are owned by Springcoin, Inc. or its affiliates (“Company”),
// shall remain proprietary to Company, and shall in all events remain the exclusive property of Company.  Nothing
// contained in this Software nor the provision of its source code shall confer the right to use, reproduce,
// copy, modify, create derivative works, or make non-production use of  any of such Software.  This Software is
// not released or otherwise available under an Open Source license, nor is it open source software.
// All use of the Software or its source code is subject to the previously accepted Terms of Use. Any use of the
// Software or its source code inconsistent with the Terms of Use is strictly prohibited.

// Customizations, updates or corrections of Software, if any, are the property of, and all rights thereto, are
// owned by Company. Any viewers of this Software also acknowledge that such Software, updates, or corrections
// are a trade secret of Company, are valuable and confidential to Company.

// Removal or alteration of this copyright notice is strictly prohibited.

pragma solidity =0.8.2;

import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "./Ky0xStore.sol";

contract Ky0xGovernance is AccessControl, Ky0xStore {
    using SafeERC20 for IERC20Metadata;

    event DataTypeEvent(uint256 _dataType, bool _isActive);
    event TreasuryUpdateEvent(address _oldTreasury, address _newTreasury);
    event AllowTokenPaymentEvent(address _erc20, bool _isAllowed, address _oracleFeed);
    event TransactionCostUpdateEvent(uint256 _oldCost, uint256 _newCost);
    event PausedEvent();
    event UnpausedEvent();

    /**
      * @notice This function is restricted to a TimelockController
      * @dev Enable/Disable a data type.
      * @param _dataType attestation data type
      * @param _isActive flag to enable or disable a dataType
      */
    function setDataTypeStatus(uint256 _dataType, bool _isActive) public {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "admin only");
        require(dataTypesMap[_dataType] != _isActive, "dataType already active/inactive");
        dataTypesMap[_dataType] = _isActive;
        emit DataTypeEvent(_dataType, _isActive);
    }

    /**
      * @notice This function is restricted to a TimelockController
      * @dev Authorize or Denied a payment to be received in Token.
      * @param _erc20 address of the ERC20 token for payment
      * @param _isAllowed authorize or deny this token
      */
    function allowTokenPayment(address _erc20, bool _isAllowed, address _oracleFeed) public  {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "admin only");
        require(
            tokenAllowedPaymentMap[_erc20] != _isAllowed || _oracleFeed != address(priceFeedMap[_erc20]),
            "token already authorized/disabled"
        );
        require(_erc20 != address(0), "ERC20 address invalid");
        require(_oracleFeed != address(0), "Oracle address invalid");
        IERC20Metadata erc20 = IERC20Metadata(_erc20);
        AggregatorV3Interface oracleFeed = AggregatorV3Interface(_oracleFeed);
        require(oracleFeed.decimals() <= 18, "Oracle Decimals > 18");
        // SafeCheck call to make sure that _oracleFeed is a valid ChainLink address
        oracleFeed.description();
        // SafeCheck call to make sure that _erc20 is a valid ERC20 address
        erc20.totalSupply();

        tokenAllowedPaymentMap[_erc20] = _isAllowed;
        priceFeedMap[_erc20] = oracleFeed;
        emit AllowTokenPaymentEvent(_erc20, _isAllowed, _oracleFeed);
    }

    /**
      * @notice This function is restricted to a TimelockController
      * @dev Set the address of the treasury.
      * @param _treasury address of the GnosisSafe
      */
    function setTreasury(address _treasury) public {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "admin only");
        require(_treasury != address(0), "treasury address zero");
        require(_treasury != treasury, "treasury already set to this address");
        address oldTreasury = treasury;
        treasury = _treasury;
        emit TreasuryUpdateEvent(oldTreasury, _treasury);
    }

    /**
      * @notice This function is restricted to a TimelockController
      * @dev Set the cost for a query transaction in USD (18 decimals)
      * @param _transactionCostUSD cost in USD with 18 decimals
      */
    function setTransactionCostUSD(uint256 _transactionCostUSD) public {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "admin only");
        // SafeCheck to prevent human errors
        require(transactionCostUSD != _transactionCostUSD, "transactionCost already set with this value");
        require(_transactionCostUSD < (10 * 1e18), "transaction cost > $10");
        require(_transactionCostUSD >= 0, "transaction cost negative");
        uint256 oldCost = transactionCostUSD;
        transactionCostUSD = _transactionCostUSD;
        emit TransactionCostUpdateEvent(oldCost, transactionCostUSD);
    }


    /**
      * @dev Emergency function to immediately pause critical functionalities
      */
    function pause() public {
        require(hasRole(PAUSER_ROLE, msg.sender), "pauser only");
        require(paused == false, "already paused");
        paused = true;
        emit PausedEvent();
    }

    /**
      * @dev Unpause all functionalities that were previous halted
      */
    function unpause() public {
        require(hasRole(PAUSER_ROLE, msg.sender), "pauser only");
        require(paused == true, "already unpaused");
        paused = false;
        emit UnpausedEvent();
    }
}
