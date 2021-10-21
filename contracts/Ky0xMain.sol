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

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "./Ky0xGovernance.sol";
import "hardhat/console.sol";


contract Ky0xMain is AccessControl, UUPSUpgradeable, Ky0xStore, Ky0xGovernance {
    using SafeERC20 for IERC20Metadata;

    /**
      * @notice Override function defined in UUPSUpgradeable
      * @dev Function that should revert when `msg.sender` is not authorized to upgrade the contract. Called by
      * {upgradeTo} and {upgradeToAndCall}.
      */
    function _authorizeUpgrade(address) internal override view {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "admin only");
    }

    /**
      * @notice Called `initialize` because it is a Proxiable contract following EIP-1822 standard
      * @param _governance address for the TimelockController
      * @param _treasury address for the GnosisSafe treasury
      * @param _attestor address for the whitelisted attestor
      * @param _pauser address for the whitelisted pauser
      */
    function initialize(
        address _governance, address _treasury, address _attestor, address _pauser
    ) public initializer
    {
        require(_treasury != address(0), "treasury address zero");
        require(_governance != address(0), "governance address zero");
        require(_attestor != address(0), "attestor address zero");
        require(_pauser != address(0), "pauser address zero");

        treasury = _treasury;
        _setupRole(DEFAULT_ADMIN_ROLE, _governance);
        _setupRole(ATTESTOR_ROLE, _attestor);
        _setupRole(PAUSER_ROLE, _pauser);

        // Enabling ID_STATUS
        dataTypesMap[0] = true;
        // Enabling AML_STATUS
        dataTypesMap[1] = true;

        // Set Initial Transaction Cost to 1$ (2 decimals)
        transactionCostUSD = 1e18;
        // Not Paused
        paused = false;
    }

    /**
      * @notice Never attest to any sensitive data
      * @dev Post obfuscated attestations about an individual. This data can only be unlocked by the individual itself.
      * @param _hashWalletSigAndAddr keccak256(Keccak256(WalletSig) | WalletAddress))
      * @param _attestation attestations about an individual
      * @param _nonce unique nonces auto-generated during on-boarding
      * @param _kID identifiers associated to `WalletAddress`
      * @param _dataType attestation dataTypes (ex: ID_STATUS, AML_STATUS, WALLET_STATUS)
      * @param _nonceCounter incremental counter to obfuscate noncesigKD

      */
    function postAttribute(
        bytes32 _hashWalletSigAndAddr,
        bytes32 _attestation,
        bytes32 _nonce,
        bytes32 _kID,
        uint256 _dataType,
        uint256 _nonceCounter
    )  public virtual
    {
        require(paused == false, "paused");
        require(hasRole(ATTESTOR_ROLE, msg.sender), "attestor only");
        require(dataTypesMap[_dataType], "datatype not enabled");
        require(
            _nonce != bytes32(0)
            && _attestation != bytes32(0)
            && _hashWalletSigAndAddr != bytes32(0)
            && _kID != bytes32(0),
            "cannot be 0"
        );
        require(
            _nonceCounter == walletInfoMap[_hashWalletSigAndAddr][_dataType].nonceCounter + 1,
            "invalid nonceCounter"
        );
        walletInfoMap[_hashWalletSigAndAddr][_dataType] = WalletInfo({
            attestation: _attestation,
            nonce: _nonce,
            kID: _kID,
            blockNumber: block.number,
            nonceCounter: _nonceCounter
        });
    }

    /**
      * @dev Retrieve a user Nonce necessary to unlock attestations.
      * @param _hashWalletSig Keccak256(WalletSig)
      * @param _dataTypes list of attestation data types
      * @return list of error status (0: OK, 1: NOT_FOUND)
      * @return list of nonces
      */
    function getNonces(bytes32 _hashWalletSig, uint256[] calldata _dataTypes)
        public
        view
        virtual
        returns (uint8[] memory, bytes32[] memory, uint256[] memory)
    {
        bytes32[] memory nonces = new bytes32[](_dataTypes.length);
        uint8[] memory errors = new uint8[](_dataTypes.length);
        uint256[] memory nonceCounters = new uint256[](_dataTypes.length);

        bytes32 hashWalletSigAndAddr = keccak256(abi.encode(_hashWalletSig, msg.sender));
        bytes32 nonce;
        uint256 nonceCounter;

        for (uint256 i = 0; i < _dataTypes.length; i++) {
            (,nonce,,,nonceCounter) = _getWalletInfo(hashWalletSigAndAddr, _dataTypes[i]);
            nonces[i] = nonce;
            errors[i] = nonce != bytes32(0) ? uint8(Error.NO_ERROR) : uint8(Error.NOT_FOUND);
            nonceCounters[i] = nonceCounter;
        }
        return (errors, nonces, nonceCounters);
    }

    /**
      * @dev Retrieve the latest blockNumber for specific attestation for a wallet address per data Types.
      * @param _hashWalletSig Keccak256(WalletSig)
      * @param _userAddr individual wallet address
      * @param _dataTypes list of attestation data types
      * @return list of blockNumber when the attestation got mined
      */
    function getBlockNumbers(bytes32 _hashWalletSig, address _userAddr, uint256[] calldata _dataTypes)
        public
        view
        virtual
        returns (uint256[] memory)
    {
        uint256[] memory blockNumbers = new uint256[](_dataTypes.length);
        bytes32 hashWalletSigAndAddr = keccak256(abi.encode(_hashWalletSig, _userAddr));
        uint256 blockNumber;

        for (uint256 i = 0; i < _dataTypes.length; i++) {
            (,,,blockNumber,) = _getWalletInfo(hashWalletSigAndAddr, _dataTypes[i]);
            blockNumbers[i] = blockNumber;
        }
        return (blockNumbers);
    }

    /**
      * @dev Query specific attributes by providing the data types and the raw values.
      * @param _hashWalletSig keccak256(WalletSig)
      * @param _userAddr individual wallet address
      * @param _nonceSigsKD keccak256(dataTypeIndex | keccak256(nonceSig))
      * @param _dataTypes list of attestation dataTypes (ex: ID_STATUS, AML_STATUS, WALLET_STATUS)
      * @param _rawValues list of values to match against (ex: PASS, FAIL)
      * @param _tokenPayment ERC20 address used for transaction payment
      * @return the unique ky0xID associated to `_userAddr` - bytes32(0) if not found
      * @return list of matches (0: NOT_FOUND, 1: MATCH, 2: NO_MATCH)
      */
    function queryAttributesMatch(
        bytes32 _hashWalletSig,
        address _userAddr,
        bytes32[] calldata _nonceSigsKD,
        uint256[] calldata _dataTypes,
        bytes32[] calldata _rawValues,
        address _tokenPayment
    )
        external
        virtual
        returns (bytes32, uint8[] memory)
    {
        require(
            _nonceSigsKD.length == _dataTypes.length
            && _nonceSigsKD.length == _rawValues.length,
            "not same length"
        );
        _sendPayment(_tokenPayment);

        uint8[] memory matches = new uint8[](_rawValues.length);
        bytes32 kID;
        WalletInfo storage w;
        bytes32 hashWalletSigAndAddr = keccak256(abi.encode(_hashWalletSig, _userAddr));
        for (uint256 i = 0; i < _dataTypes.length; i++) {
            require(dataTypesMap[_dataTypes[i]], "datatype not enabled");
            w = walletInfoMap[hashWalletSigAndAddr][_dataTypes[i]];
            if (w.kID == bytes32(0)) {
                matches[i] = uint8(MatchStatus.NOT_FOUND);
                continue;
            }
            bytes32 attestation = keccak256(
                abi.encode(
                    w.kID,
                    _nonceSigsKD[i],
                    hashWalletSigAndAddr,
                    _rawValues[i]
                )
            );
            matches[i] = (w.attestation == attestation) ? uint8(MatchStatus.MATCH) : uint8(MatchStatus.NO_MATCH);
            kID = w.kID;
        }
        return (kID, matches);
    }

    /**
      * @dev Retrieve Wallet Information for an individual for a dataType.
      * @param _hashWalletSigAndAddr keccak256(Keccak256(WalletSig) | WalletAddress))
      * @param _dataType attestation dataType (ex: ID_STATUS, AML_STATUS, WALLET_STATUS)
      * @return (attestation, nonce, ky0xID, blockNumber)
      */
    function _getWalletInfo(bytes32 _hashWalletSigAndAddr, uint256 _dataType)
        internal
        view
        returns (bytes32, bytes32, bytes32, uint256, uint256)
    {
        require(dataTypesMap[_dataType], "datatype not enabled");
        WalletInfo storage w = walletInfoMap[_hashWalletSigAndAddr][_dataType];
        return (w.attestation, w.nonce, w.kID, w.blockNumber, w.nonceCounter);
    }


    /**
      * @dev Verify allowance and execute payment in native token based on `transationCostUSD`.
      * @param _tokenPayment address for the ERC20 token to pay with
      */
    function _sendPayment(address _tokenPayment) internal {
        require(tokenAllowedPaymentMap[_tokenPayment], "token not supported");
        IERC20Metadata erc20 = IERC20Metadata(_tokenPayment);
        uint256 amount = calculateAmountPayment(_tokenPayment);
        require(erc20.allowance(msg.sender, address(this)) >= amount, "insufficient allowance");
        erc20.safeTransferFrom(msg.sender, treasury, amount);
    }

    /**
      * @dev Calculate the amount of tokens that corresponds to `transactionCostUSD`
      * @param _tokenPayment address for the ERC20 token to pay with
      * @return Amount of tokens in the ERC20 decimals
      */
    function calculateAmountPayment(address _tokenPayment)
        public virtual view returns (uint256)
    {
        require(tokenAllowedPaymentMap[_tokenPayment], "token not supported");
        int256 currentPrice  = _getPrice(_tokenPayment);
        IERC20Metadata erc20 = IERC20Metadata(_tokenPayment);

        require(currentPrice > 0, "price <= 0");
        require(_getOracleDecimals(_tokenPayment) <= 18, "oracle decimals > 18");

        uint256 amount = (
            transactionCostUSD * (10 ** erc20.decimals()) / (10 ** (18 - _getOracleDecimals(_tokenPayment)))
            / uint256(currentPrice)
        );
        return amount;
    }

    /**
      * @dev Retrieve the latest price feed from chainLINK Oracle Aggregator
      * @param _erc20 address of the ERC20 token
      * @return Price
      */
    function _getPrice(address _erc20) internal view returns (int256) {
        int256 answer;
        (,answer,,,) = priceFeedMap[_erc20].latestRoundData();
        return answer;
    }

    /**
      * @dev Retrieve the decimal for the price feed from chainLINK Oracle Aggregator
      * @param _erc20 address of the ERC20 token
      * @return decimals for the answer value
      */
    function _getOracleDecimals(address _erc20) internal view returns (uint8) {
        return priceFeedMap[_erc20].decimals();
    }
}
