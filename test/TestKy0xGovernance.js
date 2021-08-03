const { BN, constants, expectEvent, expectRevert } = require('@openzeppelin/test-helpers');
const { expect } = require('chai');

const { ethers } = require('hardhat');

const {
  generateData,
  deployMSB,
  callMSB,
  deployChainLinkPriceOracle,
  callMSBAndAssert
} = require('./utils/helpers');


const {
  deployERC20,
  deployMainAndProxy,
  upgradeMain,
  allowTokensForPayment,
} = require("../utils/deployment");

const {
  ATTESTOR_ROLE,
  DEFAULT_ADMIN_ROLE,
  PAUSER_ROLE,
  DATATYPES,

  MATCH_STATUS,
} = require('./utils/constant');

describe('Ky0xGovernance', () => {
  let deployer, attestor, userA, userB, governance, treasury, pauser;
  let main, msb, usdc, weth, dai;
  let usdcOracle;

  beforeEach(async () => {
    [deployer, attestor, treasury, governance, userA, userB, pauser] = await ethers.getSigners();

    // Deploy Any ERC20 (For Testing Purposes)
    usdc = await deployERC20({ name: "USD Coin", symbol: "USDC", decimals: 6 });
    usdcOracle = await deployChainLinkPriceOracle({
      decimals: 8,
      description: "USDC / USD",
      price: 1,
    })
    weth = await deployERC20({ name: "Wrap Ether", symbol: "WETH", decimals: 18 });
    const wethOracle = await deployChainLinkPriceOracle({
      decimals: 8,
      description: "ETH / USD",
      price: 2000,
    })

    dai = await deployERC20({ name: "Dai", symbol: "DAI", decimals: 18 });
    const daiOracle = await deployChainLinkPriceOracle({
      decimals: 18,
      description: "DAI / USD",
      price: 1,
    })

    // Deploy Ky0xMain & Proxy
    main = await deployMainAndProxy([governance.address, treasury.address, attestor.address, pauser.address]);

    // Allow Tokens for Payment
    await allowTokensForPayment({
      governance: governance,
      main: main,
      tokensAndOracles: [{
        token: usdc,
        oracleAddress: usdcOracle.address,
      }, {
        token: weth,
        oracleAddress: wethOracle.address,
      }, {
        token: dai,
        oracleAddress: daiOracle.address,
      }]
    })

    // Deploy MSB
    msb = await deployMSB(main, [usdc, weth, dai]);
  })

  describe('setDataTypeStatus', function() {
    it('success', async () => {
      expect(await main.dataTypesMap(4)).to.be.equal(false);
      await expect(main.connect(governance).setDataTypeStatus(4, true))
        .to.emit(main, 'DataTypeEvent').withArgs(4, true);
      expect(await main.dataTypesMap(4)).to.be.equal(true);
    })

    it('fail (not admin)', async () => {
      await expect(main.setDataTypeStatus(4, true)).to.be.revertedWith("admin only");
    })

    it('fail (already active)', async () => {
      await main.connect(governance).setDataTypeStatus(4, true);
      await expect(main.connect(governance).setDataTypeStatus(4, true)).to.be.revertedWith("dataType already active/inactive");
    })

    it('fail (already inactive)', async () => {
      await expect(main.connect(governance).setDataTypeStatus(4, false)).to.be.revertedWith("dataType already active/inactive");
    })
  })

  describe('setTreasury', function() {
    it('success', async () => {
      expect(await main.treasury()).to.be.equal(treasury.address);
      await expect(main.connect(governance).setTreasury(usdc.address))
        .to.emit(main, 'TreasuryUpdateEvent').withArgs(treasury.address, usdc.address);
      expect(await main.treasury()).to.be.equal(usdc.address);
    })

    it('fail (not admin)', async () => {
      await expect(main.setTreasury(usdc.address)).to.be.revertedWith("admin only");
    })

    it('fail (address zero)', async () => {
      await expect(main.connect(governance).setTreasury(ethers.constants.AddressZero))
        .to.be.revertedWith("address zero");
    })

    it('fail (already set)', async () => {
      await expect(main.connect(governance).setTreasury(usdc.address))
        .to.emit(main, 'TreasuryUpdateEvent').withArgs(treasury.address, usdc.address);
      await expect(main.connect(governance).setTreasury(usdc.address))
        .to.be.revertedWith("treasury already set to this address");
    })
  })

  describe('setTransactionCostUSD', function() {
    it('success', async () => {
      const newCost = ethers.utils.parseEther("2");
      expect(await main.transactionCostUSD()).to.be.equal(ethers.utils.parseEther("1"));
      await expect(main.connect(governance).setTransactionCostUSD(newCost))
        .to.emit(main, 'TransactionCostUpdateEvent')
        .withArgs(ethers.utils.parseEther("1"), newCost);
      expect(await main.transactionCostUSD()).to.be.equal(newCost);
    })

    it('success (2 decimals)', async () => {
      const newCost = ethers.utils.parseEther("1.99");
      await expect(main.connect(governance).setTransactionCostUSD(newCost))
        .to.emit(main, 'TransactionCostUpdateEvent')
        .withArgs(ethers.utils.parseEther("1"), newCost);
      expect(await main.transactionCostUSD()).to.be.equal(newCost);
    })

    it('success (5 decimals)', async () => {
      const newCost = ethers.utils.parseEther("9.99999");
      await expect(main.connect(governance).setTransactionCostUSD(newCost))
        .to.emit(main, 'TransactionCostUpdateEvent')
        .withArgs(ethers.utils.parseEther("1"), newCost);
      expect(await main.transactionCostUSD()).to.be.equal(newCost);
    })

    it('success ($0)', async () => {
      const newCost = ethers.utils.parseEther("0");
      await expect(main.connect(governance).setTransactionCostUSD(newCost))
        .to.emit(main, 'TransactionCostUpdateEvent')
        .withArgs(ethers.utils.parseEther("1"), newCost);
      expect(await main.transactionCostUSD()).to.be.equal(newCost);
    })

    it('fail (not admin)', async () => {
      await expect(main.setTransactionCostUSD(ethers.utils.parseEther("2"))).to.be.revertedWith("admin only");
    })

    it('fail (cost too high)', async () => {
      await expect(main.connect(governance).setTransactionCostUSD(ethers.utils.parseEther("10.1"))).to.be.revertedWith("transaction cost > $10");
    })

    it('fail (negative cost)', async () => {
      await expect(main.connect(governance).setTransactionCostUSD(ethers.utils.parseEther("-1"))).to.be.reverted;
    })

    it('fail (set with same value)', async () => {
      const newCost = ethers.utils.parseEther("2")
      await expect(main.connect(governance).setTransactionCostUSD(newCost))
        .to.emit(main, 'TransactionCostUpdateEvent')
        .withArgs(ethers.utils.parseEther("1"), newCost);
      await expect(main.connect(governance).setTransactionCostUSD(newCost))
        .to.be.revertedWith("transactionCost already set with this value");
    })
  })

  describe('pause', function() {
    it('success', async () => {
      expect(await main.paused()).to.be.equal(false);
      await expect(main.connect(pauser).pause())
        .to.emit(main, 'PausedEvent')
      expect(await main.paused()).to.be.equal(true);
    })

    it('fail (not admin)', async () => {
      await expect(main.pause()).to.be.revertedWith("pauser only");
    })

    it('fail (already paused)', async () => {
      await main.connect(pauser).pause()
      await expect(main.connect(pauser).pause()).to.be.revertedWith("already paused");
    })
  })

  describe('unpause', function() {
    it('success', async () => {
      await main.connect(pauser).pause();
      expect(await main.paused()).to.be.equal(true);
      await expect(main.connect(pauser).unpause())
        .to.emit(main, "UnpausedEvent");
      expect(await main.paused()).to.be.equal(false);
    })

    it('fail (not admin)', async () => {
      await expect(main.unpause()).to.be.revertedWith("pauser only");
    })

    it('fail (already unpaused)', async () => {
      await expect(main.connect(pauser).unpause()).to.be.revertedWith("already unpaused");
    })
  })

  describe('grantRole', function() {
    it('success (ATTESTOR_ROLE)', async () => {
      expect(await main.hasRole(ATTESTOR_ROLE, userA.address)).to.be.equal(false);
      await main.connect(governance).grantRole(ATTESTOR_ROLE, userA.address);
      expect(await main.hasRole(ATTESTOR_ROLE, userA.address)).to.be.equal(true);
    })

    it('success (DEFAULT_ADMIN_ROLE)', async () => {
      expect(await main.hasRole(DEFAULT_ADMIN_ROLE, userA.address)).to.be.equal(false);
      expect(await main.hasRole(ATTESTOR_ROLE, userB.address)).to.be.equal(false);
      await main.connect(governance).grantRole(DEFAULT_ADMIN_ROLE, userA.address);
      expect(await main.hasRole(DEFAULT_ADMIN_ROLE, userA.address)).to.be.equal(true);
      // UserA can now grant AttestorRole
      await main.connect(userA).grantRole(ATTESTOR_ROLE, userB.address);
      expect(await main.hasRole(ATTESTOR_ROLE, userB.address)).to.be.equal(true);
    })

    it('fail (not admin)', async () => {
      await expect(main.grantRole(ATTESTOR_ROLE, userA.address))
        .to.be.reverted;
    })
  })

  describe('revokeRole', function() {
    it('success (ATTESTOR_ROLE)', async () => {
      expect(await main.hasRole(ATTESTOR_ROLE, attestor.address)).to.be.equal(true);
      await main.connect(governance).revokeRole(ATTESTOR_ROLE, attestor.address);
      expect(await main.hasRole(ATTESTOR_ROLE, userA.address)).to.be.equal(false);
    })

    it('success (DEFAULT_ADMIN_ROLE)', async () => {
      expect(await main.hasRole(DEFAULT_ADMIN_ROLE, governance.address)).to.be.equal(true);
      await main.connect(governance).revokeRole(DEFAULT_ADMIN_ROLE, governance.address);
      expect(await main.hasRole(DEFAULT_ADMIN_ROLE, governance.address)).to.be.equal(false);
      // // Governance account cannot grant Role anymore
      await expect(main.connect(governance).grantRole(ATTESTOR_ROLE, userB.address)).to.be.reverted;
    })

    it('fail (not admin)', async () => {
      await expect(main.revokeRole(ATTESTOR_ROLE, attestor.address))
        .to.be.reverted;
    })
  })

  describe('allowTokenPayment', function() {
    it('success', async () => {
      // Deploy Any ERC20 (For Testing Purposes)
      const wbtc = await deployERC20({ name: "Wrapped Bitcoin", symbol: "WBTC", decimals: 6 });
      const wbtcOracle = await deployChainLinkPriceOracle({
        decimals: 8,
        description: "WBTC / USD",
        price: 40000,
      })
      expect(await main.tokenAllowedPaymentMap(wbtc.address)).to.be.equal(false);

      await expect (main.connect(governance).allowTokenPayment(wbtc.address, true, wbtcOracle.address))
        .to.emit(main, 'AllowTokenPaymentEvent').withArgs(wbtc.address, true, wbtcOracle.address);
      expect(await main.calculateAmountPayment(wbtc.address)).to.be.equal(ethers.utils.parseUnits("0.000025", "mwei"));

    })

    it('success (updating Oracle Price)', async () => {
      // Deploy Any ERC20 (For Testing Purposes)
      const wbtc = await deployERC20({ name: "Wrapped Bitcoin", symbol: "WBTC", decimals: 6 });
      const wbtcOracle = await deployChainLinkPriceOracle({
        decimals: 8,
        description: "WBTC / USD",
        price: 40000,
      })

      expect(await main.tokenAllowedPaymentMap(wbtc.address)).to.be.equal(false);

      await expect (main.connect(governance).allowTokenPayment(wbtc.address, true, wbtcOracle.address))
        .to.emit(main, 'AllowTokenPaymentEvent').withArgs(wbtc.address, true, wbtcOracle.address);
      expect(await main.calculateAmountPayment(wbtc.address)).to.be.equal(ethers.utils.parseUnits("0.000025", "mwei"));

      const newWbtcOracle = await deployChainLinkPriceOracle({
        decimals: 8,
        description: "WBTC / USD",
        price: 20000,
      })

      await expect(main.connect(governance).allowTokenPayment(wbtc.address, true, newWbtcOracle.address))
        .to.emit(main, 'AllowTokenPaymentEvent').withArgs(wbtc.address, true, newWbtcOracle.address);
      expect(await main.calculateAmountPayment(wbtc.address)).to.be.equal(ethers.utils.parseUnits("0.000050", "mwei"));
    })

    it('fail (already authorized)', async () => {
      // Deploy Any ERC20 (For Testing Purposes)
      const wbtc = await deployERC20({ name: "Wrapped Bitcoin", symbol: "WBTC", decimals: 6 });
      const wbtcOracle = await deployChainLinkPriceOracle({
        decimals: 8,
        description: "WBTC / USD",
        price: 40000,
      })
      await expect(main.connect(governance).allowTokenPayment(wbtc.address, true, wbtcOracle.address))
        .to.emit(main, 'AllowTokenPaymentEvent').withArgs(wbtc.address, true, wbtcOracle.address);
      await expect(main.connect(governance).allowTokenPayment(wbtc.address, true, wbtcOracle.address))
        .to.be.revertedWith("token already authorized/disabled");
    })

    it('fail (already disabled)', async () => {
      // Deploy Any ERC20 (For Testing Purposes)
      const wbtc = await deployERC20({ name: "Wrapped Bitcoin", symbol: "WBTC", decimals: 6 });
      const wbtcOracle = await deployChainLinkPriceOracle({
        decimals: 8,
        description: "WBTC / USD",
        price: 40000,
      })
      await expect(main.connect(governance).allowTokenPayment(wbtc.address, false, wbtcOracle.address))
        .to.emit(main, 'AllowTokenPaymentEvent').withArgs(wbtc.address, false, wbtcOracle.address);
      await expect(main.connect(governance).allowTokenPayment(wbtc.address, false, wbtcOracle.address))
        .to.be.revertedWith("token already authorized/disabled");
    })

    it('fail (not a real oracle)', async () => {
      // Deploy Any ERC20 (For Testing Purposes)
      const wbtc = await deployERC20({ name: "Wrapped Bitcoin", symbol: "WBTC", decimals: 6 });
      await expect(main.connect(governance).allowTokenPayment(wbtc.address, true, usdc.address))
        .to.be.reverted;
    })

    it('fail (not admin)', async () => {
      // Deploy Any ERC20 (For Testing Purposes)
      const wbtc = await deployERC20({ name: "Wrapped Bitcoin", symbol: "WBTC", decimals: 6 });
      const wbtcOracle = await deployChainLinkPriceOracle({
        decimals: 8,
        description: "WBTC / USD",
        price: 40000,
      })
      await expect(main.allowTokenPayment(wbtc.address, true, wbtcOracle.address))
        .to.be.revertedWith("admin only");
    })

    it('fail (disable ERC20)', async () => {
      // Deploy Any ERC20 (For Testing Purposes)
      const wbtc = await deployERC20({ name: "Wrapped Bitcoin", symbol: "WBTC", decimals: 6 });
      const wbtcOracle = await deployChainLinkPriceOracle({
        decimals: 8,
        description: "WBTC / USD",
        price: 40000,
      })

      await expect(main.connect(governance).allowTokenPayment(wbtc.address, true, wbtcOracle.address))
        .to.emit(main, 'AllowTokenPaymentEvent').withArgs(wbtc.address, true, wbtcOracle.address);
      expect(await main.calculateAmountPayment(wbtc.address)).to.be.equal(ethers.utils.parseUnits("0.000025", "mwei"));

      await expect(main.connect(governance).allowTokenPayment(wbtc.address, false, wbtcOracle.address))
        .to.emit(main, 'AllowTokenPaymentEvent').withArgs(wbtc.address, false, wbtcOracle.address);

      await expect(main.calculateAmountPayment(wbtc.address))
        .to.be.revertedWith("token not supported");
    })

    it('fail (not a real ERC20)', async () => {
      // Deploy Any ERC20 (For Testing Purposes)
      const wbtcOracle = await deployChainLinkPriceOracle({
        decimals: 8,
        description: "WBTC / USD",
        price: 40000,
      })

      await expect(main.connect(governance).allowTokenPayment(treasury.address, true, wbtcOracle.address))
        .to.be.reverted
    })
  })

  describe('upgrade Ky0xMain implementation', function() {
    it('success', async () => {
      // Old Implementation
      const oldMain = await deployMainAndProxy([deployer.address, treasury.address, attestor.address, pauser.address]);
      const msb2 = await deployMSB(oldMain, [usdc]);
      await allowTokensForPayment({
        governance: deployer,
        main: oldMain,
        tokensAndOracles: [{
          token: usdc,
          oracleAddress: usdcOracle.address,
        }]
      })
      const genData = await generateData(userA, "PASS", DATATYPES.KYC);
      const postTx = await oldMain.connect(attestor).postAttributes(
        [genData.walletSigAndAddr],
        [genData.attestation],
        [genData.nonce],
        [genData.ky0xID],
        [DATATYPES.KYC]
      );
      const inputs = {
        token: usdc,
        msb: msb2,
        treasury: treasury,
        main: oldMain,
        genDataList: [genData],
        sender: userA,
      }
      const outputs = {
        matches: [MATCH_STATUS.MATCH],
        blockNumbers: [postTx.blockNumber]
      }
      await callMSBAndAssert(inputs, outputs);
      let tx = await oldMain.calculateAmountPayment(usdc.address);
      expect(tx.toString()).to.be.equal("1000000");

      // Upgrade to V2
      const Ky0xMainV2 = await ethers.getContractFactory('Ky0xMainV2');
      const newMain = await upgradeMain(oldMain, Ky0xMainV2, []);
      expect(oldMain.address).to.be.equal(newMain.address);

      await callMSBAndAssert(inputs, outputs);
      tx = await newMain.calculateAmountPayment(usdc.address);
      expect(tx.toString()).to.be.equal("1337");
    })

    it('fail (not admin)', async () => {
      const Ky0xMainV2 = await ethers.getContractFactory('Ky0xMainV2');
      await expect(upgradeMain(main, Ky0xMainV2, []))
        .to.be.revertedWith("admin only");
    })

  })
})
