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

interface IKy0xMain {
    /**
      * @notice Never attest to any sensitive data
      * @dev Post obfuscated attestations about an individual. This data can only be unlocked by the individual itself.
      * @param _hashWalletSigAndAddrs List[keccak256(Keccak256(WalletSig) | WalletAddress))]
      * @param _attestations list of attestations about an individual
      * @param _nonces list of unique nonces auto-generated during on-boarding
      * @param _kIDs list of identifiers associated to `WalletAddress`
      * @param _dataTypes list of attestation dataTypes (ex: ID_STATUS, AML_STATUS, WALLET_STATUS)
      * @param _nonceCounter incremental counter to obfuscate noncesigKD
      */
    function postAttribute(
        bytes32 _hashWalletSigAndAddrs,
        bytes32 _attestations,
        bytes32 _nonces,
        bytes32 _kIDs,
        uint256 _dataTypes,
        uint256 _nonceCounter
    ) external;


    /**
      * @dev Retrieve a user Nonce necessary to unlock attestations.
      * @param _hashWalletSig Keccak256(WalletSig)
      * @param _dataTypes list of attestation data types
      * @return list of error status (0: OK, 2: NOT_FOUND)
      * @return list of nonces
      */
    function getNonces(
        bytes32 _hashWalletSig,
        uint256[] calldata _dataTypes
    ) external view returns (uint8[] memory, bytes32[] memory, uint256[] memory);


    /**
      * @dev Retrieve the latest blockNumber for specific attestation for a wallet address per data Types.
      * @param _hashWalletSig Keccak256(WalletSig)
      * @param _userAddr individual wallet address
      * @param _dataTypes list of attestation data types
      * @return list of block numbers for when the attestation was mined
      */
    function getBlockNumbers(
        bytes32 _hashWalletSig,
        address _userAddr,
        uint256[] calldata _dataTypes
    ) external view returns (uint256[] memory);


    /**
      * @dev Query specific attributes by providing the data types and the raw values.
      * @param _hashWalletSig keccak256(WalletSig)
      * @param _userAddr individual wallet address
      * @param _nonceSigsKD keccak256(dataTypeIndex | keccak256(nonceSig))
      * @param _dataTypes list of attestation dataTypes (ex: ID_STATUS, AML_STATUS, WALLET_STATUS)
      * @param _rawValues list of values to match against (ex: PASS, FAIL)
      * @return the unique ky0xID associated to `_userAddr` - bytes32(0) if not found
      * @param _tokenPayment ERC20 address used for transaction payment
      * @return list of matches (0: NOT_FOUND, 1: MATCH, 2: NO_MATCH)
      */
    function queryAttributesMatch(
        bytes32 _hashWalletSig,
        address _userAddr,
        bytes32[] calldata _nonceSigsKD,
        uint256[] calldata _dataTypes,
        bytes32[] calldata _rawValues,
        address _tokenPayment
    ) external returns (bytes32, uint8[] memory);


    /**
      * @dev Calculate the amount of tokens that corresponds to `transactionCostUSD`
      * @param _tokenPayment address for the ERC20 token to pay with
      * @return Amount of tokens in the ERC20 decimals
      */
    function calculateAmountPayment(
        address _tokenPayment
    ) external view returns (uint256);
}

