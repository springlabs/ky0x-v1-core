const { BN, constants, expectEvent, expectRevert } = require('@openzeppelin/test-helpers');
const { expect } = require('chai');

const { ethers, upgrades } = require('hardhat');

const {
  generateData,
  deployMSB,
  callMSB,
  deployChainLinkPriceOracle,
  callMSBAndAssertBalance
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
  DATATYPES,
  ERRORS
} = require('./utils/constant');

describe('Ky0xMain', () => {
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

  describe('signature', function() {
    it('verify signature', async () => {
      const genData = await generateData(userA, "PASS", DATATYPES.KYC);
      let signerAddr = ethers.utils.verifyMessage(genData.hashAddr, genData.walletSig)
      let signerNonceAddr = ethers.utils.verifyMessage(genData.nonce, genData.nonceSig)
      expect(signerAddr).to.be.equal(userA.address);
      expect(signerNonceAddr).to.be.equal(userA.address);
    });
  });

  describe('initialize', function() {
    it('success (parameters correctly initialized)', async () => {
     expect(await main.treasury()).to.be.equal(treasury.address);
     expect(await main.dataTypesMap(0)).to.be.equal(true);
     expect(await main.dataTypesMap(1)).to.be.equal(true);
     expect(await main.dataTypesMap(2)).to.be.equal(false);
     expect(await main.transactionCostUSD()).to.be.equal(ethers.utils.parseEther("1"));
     expect(await main.paused()).to.be.equal(false);
     expect(await main.hasRole(DEFAULT_ADMIN_ROLE, governance.address)).to.be.equal(true);
     expect(await main.hasRole(DEFAULT_ADMIN_ROLE, deployer.address)).to.be.equal(false);
     expect(await main.hasRole(ATTESTOR_ROLE, attestor.address)).to.be.equal(true);
    })

    it('fail (already initialized)', async () => {
      await expect(main.initialize(userA.address, userB.address, deployer.address, pauser.address))
        .to.be.revertedWith("contract is already initialized");
    })
  })

  describe('postAttributes', function() {
    it('success - (Only KYC)', async () => {
      const genData = await generateData(userA, "PASS", DATATYPES.KYC);
      const hashWalletSig = ethers.utils.keccak256(genData.walletSig);
      let tx = await main.connect(userA).getNonces(hashWalletSig, [DATATYPES.KYC]);
      expect(tx.length).to.be.equal(2);
      expect(tx[0].length).to.be.equal(1);
      expect(tx[1].length).to.be.equal(1);
      expect(tx[0][0]).to.be.equal(ERRORS.NOT_FOUND);
      expect(tx[1][0]).to.be.equal(constants.ZERO_BYTES32);
      // Expect no revert
      await main.connect(attestor).postAttributes(
        [genData.walletSigAndAddr],
        [genData.attestation],
        [genData.nonce],
        [genData.ky0xID],
        [DATATYPES.KYC]
      );
      tx = await main.connect(userA).getNonces(hashWalletSig, [DATATYPES.KYC]);
      expect(tx.length).to.be.equal(2);
      expect(tx[0][0]).to.be.equal(ERRORS.NO_ERROR);
      expect(tx[1][0]).to.be.equal(genData.nonce);
    })

    it('success (KYC & AML - same user)', async () => {
      const genData = await generateData(userA, "PASS", DATATYPES.KYC);
      const genDataAML = await generateData(userA, "LOW_RISK", DATATYPES.AML);
      const hashWalletSig = ethers.utils.keccak256(genData.walletSig);
      let tx = await main.connect(userA).getNonces(hashWalletSig, [DATATYPES.KYC, DATATYPES.AML]);
      expect(tx.length).to.be.equal(2);
      expect(tx[0].length).to.be.equal(2);
      expect(tx[1].length).to.be.equal(2);
      expect(tx[0][0]).to.be.equal(ERRORS.NOT_FOUND);
      expect(tx[0][1]).to.be.equal(ERRORS.NOT_FOUND);
      expect(tx[1][0]).to.be.equal(constants.ZERO_BYTES32);
      expect(tx[1][1]).to.be.equal(constants.ZERO_BYTES32);
      await main.connect(attestor).postAttributes(
        [genData.walletSigAndAddr, genDataAML.walletSigAndAddr],
        [genData.attestation, genDataAML.attestation],
        [genData.nonce, genDataAML.nonce],
        [genData.ky0xID, genDataAML.ky0xID],
        [DATATYPES.KYC, DATATYPES.AML]
      );
      tx = await main.connect(userA).getNonces(hashWalletSig, [DATATYPES.KYC, DATATYPES.AML]);
      expect(tx[0][0]).to.be.equal(ERRORS.NO_ERROR);
      expect(tx[0][1]).to.be.equal(ERRORS.NO_ERROR);
      expect(tx[1][0]).to.be.equal(genData.nonce);
      expect(tx[1][1]).to.be.equal(genDataAML.nonce);
    })

    it('success (KYC & AML - batch diff user)', async () => {
      const genData = await generateData(userA, "PASS", DATATYPES.KYC);
      const genDataAML = await generateData(userB, "LOW_RISK", DATATYPES.AML);
      const hashWalletSigA = ethers.utils.keccak256(genData.walletSig);
      const hashWalletSigB = ethers.utils.keccak256(genDataAML.walletSig);
      await main.connect(attestor).postAttributes(
        [genData.walletSigAndAddr, genDataAML.walletSigAndAddr],
        [genData.attestation, genDataAML.attestation],
        [genData.nonce, genDataAML.nonce],
        [genData.ky0xID, genDataAML.ky0xID],
        [DATATYPES.KYC, DATATYPES.AML]
      );
      // Fetch UserA
      tx = await main.connect(userA).getNonces(hashWalletSigA, [DATATYPES.KYC, DATATYPES.AML]);
      expect(tx[0][0]).to.be.equal(ERRORS.NO_ERROR);
      expect(tx[0][1]).to.be.equal(ERRORS.NOT_FOUND);
      expect(tx[1][0]).to.be.equal(genData.nonce);
      expect(tx[1][1]).to.be.equal(constants.ZERO_BYTES32);

      // Fetch UserB
      tx = await main.connect(userB).getNonces(hashWalletSigB, [DATATYPES.KYC, DATATYPES.AML]);
      expect(tx[0][0]).to.be.equal(ERRORS.NOT_FOUND);
      expect(tx[0][1]).to.be.equal(ERRORS.NO_ERROR);
      expect(tx[1][0]).to.be.equal(constants.ZERO_BYTES32);
      expect(tx[1][1]).to.be.equal(genDataAML.nonce);
    })

    it('fail (paused)', async () => {
      await main.connect(pauser).pause();
      const genData = await generateData(userA, "PASS", DATATYPES.KYC);
      const hashWalletSig = ethers.utils.keccak256(genData.walletSig);
      await expect(main.connect(attestor).postAttributes(
        [genData.walletSigAndAddr],
        [genData.attestation],
        [genData.nonce],
        [genData.ky0xID],
        [DATATYPES.KYC]
      )).to.be.revertedWith("paused");
    });

    it('fail (not attestor)', async () => {
      const genData = await generateData(userA, "PASS", DATATYPES.KYC);
      const hashWalletSig = ethers.utils.keccak256(genData.walletSig);
      await expect(main.postAttributes(
        [genData.walletSigAndAddr],
        [genData.attestation],
        [genData.nonce],
        [genData.ky0xID],
        [DATATYPES.KYC]
      )).to.be.revertedWith("attestor only");
    });

    it('fail (nonce bytes(0))', async () => {
      const genData = await generateData(userA, "PASS", DATATYPES.KYC);
      const hashWalletSig = ethers.utils.keccak256(genData.walletSig);
      await expect(main.connect(attestor).postAttributes(
        [genData.walletSigAndAddr],
        [genData.attestation],
        [ethers.constants.HashZero],
        [genData.ky0xID],
        [DATATYPES.KYC]
      )).to.be.revertedWith("cannot be 0");
    });

    it('fail (walletSigAndAddr bytes(0))', async () => {
      const genData = await generateData(userA, "PASS", DATATYPES.KYC);
      const hashWalletSig = ethers.utils.keccak256(genData.walletSig);
      await expect(main.connect(attestor).postAttributes(
        [ethers.constants.HashZero],
        [genData.attestation],
        [genData.nonce],
        [genData.ky0xID],
        [DATATYPES.KYC]
      )).to.be.revertedWith("cannot be 0");
    });

    it('fail (attestation bytes(0))', async () => {
      const genData = await generateData(userA, "PASS", DATATYPES.KYC);
      const hashWalletSig = ethers.utils.keccak256(genData.walletSig);
      await expect(main.connect(attestor).postAttributes(
        [genData.walletSigAndAddr],
        [ethers.constants.HashZero],
        [genData.nonce],
        [genData.ky0xID],
        [DATATYPES.KYC]
      )).to.be.revertedWith("cannot be 0");
    });

    it('fail (ky0xID bytes(0))', async () => {
      const genData = await generateData(userA, "PASS", DATATYPES.KYC);
      const hashWalletSig = ethers.utils.keccak256(genData.walletSig);
      await expect(main.connect(attestor).postAttributes(
        [genData.walletSigAndAddr],
        [genData.attestation],
        [genData.nonce],
        [ethers.constants.HashZero],
        [DATATYPES.KYC]
      )).to.be.revertedWith("cannot be 0");
    });

    it('fail (length 0)', async () => {
      const genData = await generateData(userA, "PASS", DATATYPES.KYC);
      const hashWalletSig = ethers.utils.keccak256(genData.walletSig);
      await expect(main.connect(attestor).postAttributes(
        [genData.walletSigAndAddr],
        [],
        [genData.nonce],
        [genData.ky0xID],
        [DATATYPES.KYC]
      )).to.be.revertedWith("batch size should be between 1 and 9");
    });

    it('fail (length >=10)', async () => {
      const genData = await generateData(userA, "PASS", DATATYPES.KYC);
      const hashWalletSig = ethers.utils.keccak256(genData.walletSig);
      await expect(main.connect(attestor).postAttributes(
        [genData.walletSigAndAddr],
        Array(10).fill(genData.attestation),
        [genData.nonce],
        [genData.ky0xID],
        [DATATYPES.KYC]
      )).to.be.revertedWith("batch size should be between 1 and 9");
    });

    it('fail (bad length attestations)', async () => {
      const genData = await generateData(userA, "PASS", DATATYPES.KYC);
      const hashWalletSig = ethers.utils.keccak256(genData.walletSig);
      await expect(main.connect(attestor).postAttributes(
        [genData.walletSigAndAddr],
        [genData.attestation, genData.attestation],
        [genData.nonce],
        [genData.ky0xID],
        [DATATYPES.KYC]
      )).to.be.revertedWith("length not equal");
    });

    it('fail (bad length nonces)', async () => {
      const genData = await generateData(userA, "PASS", DATATYPES.KYC);
      const hashWalletSig = ethers.utils.keccak256(genData.walletSig);
      await expect(main.connect(attestor).postAttributes(
        [genData.walletSigAndAddr],
        [genData.attestation],
        [genData.nonce, genData.nonce],
        [genData.ky0xID],
        [DATATYPES.KYC]
      )).to.be.revertedWith("length not equal");
    });

    it('fail (bad hashWalletSigAndAddrs length)', async () => {
      const genData = await generateData(userA, "PASS", DATATYPES.KYC);
      const hashWalletSig = ethers.utils.keccak256(genData.walletSig);
      await expect(main.connect(attestor).postAttributes(
        [genData.walletSigAndAddr, genData.attestation],
        [genData.attestation],
        [genData.nonce],
        [genData.ky0xID],
        [DATATYPES.KYC]
      )).to.be.revertedWith("length not equal");
    });

    it('fail (bad kIDs length)', async () => {
      const genData = await generateData(userA, "PASS", DATATYPES.KYC);
      const hashWalletSig = ethers.utils.keccak256(genData.walletSig);
      await expect(main.connect(attestor).postAttributes(
        [genData.walletSigAndAddr],
        [genData.attestation],
        [genData.nonce],
        [genData.ky0xID, genData.ky0xID],
        [DATATYPES.KYC]
      )).to.be.revertedWith("length not equal");
    });

    it('fail (bad dataTypes length)', async () => {
      const genData = await generateData(userA, "PASS", DATATYPES.KYC);
      const hashWalletSig = ethers.utils.keccak256(genData.walletSig);
      await expect(main.connect(attestor).postAttributes(
        [genData.walletSigAndAddr],
        [genData.attestation],
        [genData.nonce],
        [genData.ky0xID],
        [DATATYPES.KYC, DATATYPES.AML]
      )).to.be.revertedWith("length not equal");
    });
  });

  describe('getNonces', function() {
    it('success (KYC only)', async () => {
      const genData = await generateData(userA, "PASS", DATATYPES.KYC);
      const hashWalletSig = ethers.utils.keccak256(genData.walletSig);
      await main.connect(attestor).postAttributes(
        [genData.walletSigAndAddr],
        [genData.attestation],
        [genData.nonce],
        [genData.ky0xID],
        [DATATYPES.KYC]
      );
      const tx = await main.connect(userA).getNonces(hashWalletSig, [DATATYPES.KYC]);
      expect(tx[0][0]).to.be.equal(ERRORS.NO_ERROR);
      expect(tx[1][0]).to.be.equal(genData.nonce);
    });

    it('success (KYC & AML)', async () => {
      const genData = await generateData(userA, "PASS", DATATYPES.KYC);
      const genDataAML = await generateData(userA, "LOW_RISK", DATATYPES.AML);
      const hashWalletSig = ethers.utils.keccak256(genData.walletSig);
      await main.connect(attestor).postAttributes(
        [genData.walletSigAndAddr, genDataAML.walletSigAndAddr],
        [genData.attestation, genDataAML.attestation],
        [genData.nonce, genDataAML.nonce],
        [genData.ky0xID, genDataAML.ky0xID],
        [DATATYPES.KYC, DATATYPES.AML]
      );
      const tx = await main.connect(userA).getNonces(hashWalletSig, [DATATYPES.KYC, DATATYPES.AML]);
      // KYC
      expect(tx[0][0]).to.be.equal(ERRORS.NO_ERROR);
      expect(tx[1][0]).to.be.equal(genData.nonce);

      // AML
      expect(tx[0][1]).to.be.equal(ERRORS.NO_ERROR);
      expect(tx[1][1]).to.be.equal(genDataAML.nonce);
    });

    it('success (KYC  but no AML)', async () => {
      const genData = await generateData(userA, "PASS", DATATYPES.KYC);
      const hashWalletSig = ethers.utils.keccak256(genData.walletSig);
      await main.connect(attestor).postAttributes(
        [genData.walletSigAndAddr],
        [genData.attestation],
        [genData.nonce],
        [genData.ky0xID],
        [DATATYPES.KYC]
      );
      const tx = await main.connect(userA).getNonces(hashWalletSig, [DATATYPES.KYC, DATATYPES.AML]);
      // KYC
      expect(tx[0][0]).to.be.equal(ERRORS.NO_ERROR);
      expect(tx[1][0]).to.be.equal(genData.nonce);

      // AML
      expect(tx[0][1]).to.be.equal(ERRORS.NOT_FOUND);
      expect(tx[1][1]).to.be.equal(constants.ZERO_BYTES32);
    });

    it('fail (wrong owner)', async () => {
      const genData = await generateData(userA, "PASS", DATATYPES.KYC);
      const hashWalletSig = ethers.utils.keccak256(genData.walletSig);
      // Expect no revert
      await main.connect(attestor).postAttributes(
        [genData.walletSigAndAddr],
        [genData.attestation],
        [genData.nonce],
        [genData.ky0xID],
        [DATATYPES.KYC]
      );
      const tx = await main.connect(userB).getNonces(hashWalletSig, [DATATYPES.KYC]);
      expect(tx.length).to.be.equal(2);
      expect(tx[0][0]).to.be.equal(ERRORS.NOT_FOUND);
      expect(tx[1][0]).to.be.equal(constants.ZERO_BYTES32);
    });

    it('fail (wrong hashWalletSig)', async () => {
      const genData = await generateData(userA, "PASS", DATATYPES.KYC);
      const wrongHashWalletSig = ethers.utils.keccak256(genData.nonce);
      // Expect no revert
      await main.connect(attestor).postAttributes(
        [genData.walletSigAndAddr],
        [genData.attestation],
        [genData.nonce],
        [genData.ky0xID],
        [DATATYPES.KYC]
      );
      const tx = await main.connect(userA).getNonces(wrongHashWalletSig, [DATATYPES.KYC]);
      expect(tx.length).to.be.equal(2);
      expect(tx[0][0]).to.be.equal(ERRORS.NOT_FOUND);
      expect(tx[1][0]).to.be.equal(constants.ZERO_BYTES32);
    });
  })


  describe('getBlockNumbers', function() {
    it('success (KYC only)', async () => {
      const genData = await generateData(userA, "PASS", DATATYPES.KYC);
      const hashWalletSig = ethers.utils.keccak256(genData.walletSig);
      const postTx = await main.connect(attestor).postAttributes(
        [genData.walletSigAndAddr],
        [genData.attestation],
        [genData.nonce],
        [genData.ky0xID],
        [DATATYPES.KYC]
      );
      const tx = await main.getBlockNumbers(hashWalletSig, userA.address, [DATATYPES.KYC]);
      expect(tx[0]).to.be.equal(postTx.blockNumber);
    });

    it('success (KYC & AML)', async () => {
      const genData = await generateData(userA, "PASS", DATATYPES.KYC);
      const genDataAML = await generateData(userA, "LOW_RISK", DATATYPES.AML);
      const hashWalletSig = ethers.utils.keccak256(genData.walletSig);
      const postTx = await main.connect(attestor).postAttributes(
        [genData.walletSigAndAddr, genDataAML.walletSigAndAddr],
        [genData.attestation, genDataAML.attestation],
        [genData.nonce, genDataAML.nonce],
        [genData.ky0xID, genDataAML.ky0xID],
        [DATATYPES.KYC, DATATYPES.AML]
      );
      const tx = await main.getBlockNumbers(
        hashWalletSig, userA.address, [DATATYPES.KYC, DATATYPES.AML]
      );
      // KYC
      expect(tx[0]).to.be.equal(postTx.blockNumber);

      // AML
      expect(tx[1]).to.be.equal(postTx.blockNumber);
    });

    it('success (KYC but no AML)', async () => {
      const genData = await generateData(userA, "PASS", DATATYPES.KYC);
      const hashWalletSig = ethers.utils.keccak256(genData.walletSig);
      const postTx = await main.connect(attestor).postAttributes(
        [genData.walletSigAndAddr],
        [genData.attestation],
        [genData.nonce],
        [genData.ky0xID],
        [DATATYPES.KYC]
      );
      const tx = await main.getBlockNumbers(
        hashWalletSig, userA.address, [DATATYPES.KYC, DATATYPES.AML]
      );
      // KYC
      expect(tx[0]).to.be.equal(postTx.blockNumber);

      // AML
      expect(tx[1]).to.be.equal("0");
    });

    it('fail (wrong owner)', async () => {
      const genData = await generateData(userA, "PASS", DATATYPES.KYC);
      const hashWalletSig = ethers.utils.keccak256(genData.walletSig);
      // Expect no revert
      await main.connect(attestor).postAttributes(
        [genData.walletSigAndAddr],
        [genData.attestation],
        [genData.nonce],
        [genData.ky0xID],
        [DATATYPES.KYC]
      );
      const tx = await main.getBlockNumbers(hashWalletSig, userB.address, [DATATYPES.KYC]);
      expect(tx[0]).to.be.equal(0);
    });

    it('fail (wrong hashWalletSig)', async () => {
      const genData = await generateData(userA, "PASS", DATATYPES.KYC);
      const wrongHashWalletSig = ethers.utils.keccak256(genData.nonce);
      // Expect no revert
      await main.connect(attestor).postAttributes(
        [genData.walletSigAndAddr],
        [genData.attestation],
        [genData.nonce],
        [genData.ky0xID],
        [DATATYPES.KYC]
      );
      const tx = await main.getBlockNumbers(wrongHashWalletSig, userA.address, [DATATYPES.KYC]);
      expect(tx[0]).to.be.equal(0);
    });
  })

  describe('calculateAmountPayment', function() {
    it('calculate USDC amount', async () => {
      const tx = await main.calculateAmountPayment(usdc.address);
      expect(tx.toString()).to.be.equal("1000000");
    })

    it('calculate WETH amount', async () => {
      const tx = await main.calculateAmountPayment(weth.address);
      expect(tx.toString()).to.be.equal("500000000000000");
    })

    it('calculate DAI amount', async () => {
      const tx = await main.calculateAmountPayment(dai.address);
      expect(tx.toString()).to.be.equal("1000000000000000000");
    })

    it('success (6 decimals)', async () => {
      const wbtc = await deployERC20({ name: "Wrapped Bitcoin", symbol: "WBTC", decimals: 6 });
      const wbtcOracle = await deployChainLinkPriceOracle({
        decimals: 8,
        description: "WBTC / USD",
        price: 40000,
      })

      await main.connect(governance).allowTokenPayment(wbtc.address, true, wbtcOracle.address)
      expect(await main.connect(userA).calculateAmountPayment(wbtc.address)).to.be.equal(ethers.utils.parseUnits("0.000025", "mwei"));
    })

    it('success (18 decimals)', async () => {
      const wbtc = await deployERC20({ name: "Wrapped Bitcoin", symbol: "WBTC", decimals: 18 });
      const wbtcOracle = await deployChainLinkPriceOracle({
        decimals: 8,
        description: "WBTC / USD",
        price: 40000,
      })

      await main.connect(governance).allowTokenPayment(wbtc.address, true, wbtcOracle.address)
      expect(await main.calculateAmountPayment(wbtc.address)).to.be.equal(ethers.utils.parseUnits("0.000025", "ether"));
    })

    it('success (1 decimals)', async () => {
      const wbtc = await deployERC20({ name: "Wrapped Bitcoin", symbol: "WBTC", decimals: 1 });
      const wbtcOracle = await deployChainLinkPriceOracle({
        decimals: 8,
        description: "WBTC / USD",
        price: 1,
      })

      await main.connect(governance).allowTokenPayment(wbtc.address, true, wbtcOracle.address)
      expect(await main.calculateAmountPayment(wbtc.address)).to.be.equal(ethers.utils.parseUnits("10", "wei"));
    })

    it('success (change transactionCost)', async () => {
      const wbtc = await deployERC20({ name: "Wrapped Bitcoin", symbol: "WBTC", decimals: 18 });
      const wbtcOracle = await deployChainLinkPriceOracle({
        decimals: 8,
        description: "WBTC / USD",
        price: 1,
      })
      await main.connect(governance).allowTokenPayment(wbtc.address, true, wbtcOracle.address)
      expect(await main.calculateAmountPayment(wbtc.address)).to.be.equal(ethers.utils.parseUnits("1", "ether"));
      const newCost = ethers.utils.parseEther("2");
      await main.connect(governance).setTransactionCostUSD(newCost);
      expect(await main.calculateAmountPayment(wbtc.address)).to.be.equal(newCost);
    })

    it('fail (price zero)', async () => {
      const wbtc = await deployERC20({ name: "Wrapped Bitcoin", symbol: "WBTC", decimals: 18 });

      const ChainLinkPriceOracle = await ethers.getContractFactory("ChainLinkPriceOracle");
      const wbtcOracle = await ChainLinkPriceOracle.deploy(8, "WBTC / USD", 1, 0);
      await wbtcOracle.deployed();
      await main.connect(governance).allowTokenPayment(wbtc.address, true, wbtcOracle.address)
      await expect(main.calculateAmountPayment(wbtc.address))
        .to.be.revertedWith("price <= 0");
    })

    it('fail (price negative)', async () => {
      const wbtc = await deployERC20({ name: "Wrapped Bitcoin", symbol: "WBTC", decimals: 18 });
      const wbtcOracle = await deployChainLinkPriceOracle({
        decimals: 8,
        description: "WBTC / USD",
        price: -1,
      })
      await main.connect(governance).allowTokenPayment(wbtc.address, true, wbtcOracle.address)
      await expect(main.calculateAmountPayment(wbtc.address))
        .to.be.revertedWith("price <= 0");
    })

    it('fail (token not suppported)', async () => {
      await expect(main.calculateAmountPayment(userA.address))
        .to.be.revertedWith("token not supported");
    })
  });

  describe('queryAttributesMatch', function() {
    it('success (KYC with USDC)', async () => {
      const genData = await generateData(userA, "PASS", DATATYPES.KYC);
      await main.connect(attestor).postAttributes(
        [genData.walletSigAndAddr],
        [genData.attestation],
        [genData.nonce],
        [genData.ky0xID],
        [DATATYPES.KYC]
      );
      await usdc.approve(main.address, ethers.utils.parseEther("10"));
      const initialBalance = await usdc.balanceOf(deployer.address);
      await main.queryAttributesMatch(
        ethers.utils.keccak256(genData.walletSig),
        userA.address,
        [genData.nonceSigKD],
        [DATATYPES.KYC],
        [ethers.utils.formatBytes32String("PASS")],
        usdc.address
      )
      // Check Balance
      const expectedBalance = initialBalance.sub(ethers.utils.parseUnits("1", "mwei"));
      expect(await usdc.balanceOf(main.address)).to.be.equal("0");
      expect(await usdc.balanceOf(treasury.address)).to.be.equal(ethers.utils.parseUnits("1", "mwei"));
      expect(await usdc.balanceOf(deployer.address)).to.be.equal(expectedBalance);
    })

    it('success (KYC/AML/ with WETH)', async () => {
      const genData = await generateData(userA, "PASS", DATATYPES.KYC);
      const genDataAML = await generateData(userA, "LOW_RISK", DATATYPES.AML);
      await main.connect(attestor).postAttributes(
        [genData.walletSigAndAddr, genDataAML.walletSigAndAddr],
        [genData.attestation, genDataAML.attestation],
        [genData.nonce, genDataAML.nonce],
        [genData.ky0xID, genDataAML.ky0xID],
        [DATATYPES.KYC, DATATYPES.AML]
      );
      await weth.approve(main.address, ethers.utils.parseEther("1"));
      const initialBalance = await weth.balanceOf(deployer.address);
      await main.queryAttributesMatch(
        ethers.utils.keccak256(genData.walletSig),
        userA.address,
        [genData.nonceSigKD, genDataAML.nonceSigKD],
        [DATATYPES.KYC, DATATYPES.AML],
        [ethers.utils.formatBytes32String("PASS"), ethers.utils.formatBytes32String("LOW_RISK")],
        weth.address
      )
      // Check Balance
      const expectedBalance = initialBalance.sub(ethers.utils.parseUnits("0.0005", "ether"));
      expect(await weth.balanceOf(main.address)).to.be.equal("0");
      expect(await weth.balanceOf(treasury.address)).to.be.equal(ethers.utils.parseUnits("0.0005", "ether"));
      expect(await weth.balanceOf(deployer.address)).to.be.equal(expectedBalance);
    })

    it('success (KYC but no AML)', async () => {
      // Test that it should still work if no AML is returned
      const genData = await generateData(userA, "PASS", DATATYPES.KYC);
      const genDataAML = await generateData(userA, "LOW_RISK", DATATYPES.AML);
      await main.connect(attestor).postAttributes(
        [genData.walletSigAndAddr],
        [genData.attestation],
        [genData.nonce],
        [genData.ky0xID],
        [DATATYPES.KYC]
      );
      await weth.approve(main.address, ethers.utils.parseEther("1"));
      const initialBalance = await weth.balanceOf(deployer.address);
      await main.queryAttributesMatch(
        ethers.utils.keccak256(genData.walletSig),
        userA.address,
        [genData.nonceSigKD, genDataAML.nonceSigKD],
        [DATATYPES.KYC, DATATYPES.AML],
        [ethers.utils.formatBytes32String("PASS"), ethers.utils.formatBytes32String("LOW_RISK")],
        weth.address
      )
      // Check Balance
      const expectedBalance = initialBalance.sub(ethers.utils.parseUnits("0.0005", "ether"));
      expect(await weth.balanceOf(main.address)).to.be.equal("0");
      expect(await weth.balanceOf(treasury.address)).to.be.equal(ethers.utils.parseUnits("0.0005", "ether"));
      expect(await weth.balanceOf(deployer.address)).to.be.equal(expectedBalance);
    })

    it('success (wrong dataType)', async () => {
      const genData = await generateData(userA, "PASS", DATATYPES.KYC);
      await main.connect(attestor).postAttributes(
        [genData.walletSigAndAddr],
        [genData.attestation],
        [genData.nonce],
        [genData.ky0xID],
        [DATATYPES.KYC]
      );
      await usdc.approve(main.address, ethers.utils.parseEther("10"));
      const initialBalance = await usdc.balanceOf(deployer.address);
      await main.queryAttributesMatch(
        ethers.utils.keccak256(genData.walletSig),
        userA.address,
        [genData.nonceSigKD],
        [DATATYPES.AML],
        [ethers.utils.formatBytes32String("PASS")],
        usdc.address
      )
    })

    it('success (wrong rawValues)', async () => {
      const genData = await generateData(userA, "PASS", DATATYPES.KYC);
      await main.connect(attestor).postAttributes(
        [genData.walletSigAndAddr],
        [genData.attestation],
        [genData.nonce],
        [genData.ky0xID],
        [DATATYPES.KYC]
      );
      await usdc.approve(main.address, ethers.utils.parseEther("10"));
      const initialBalance = await usdc.balanceOf(deployer.address);
      await main.queryAttributesMatch(
        ethers.utils.keccak256(genData.walletSig),
        userA.address,
        [genData.nonceSigKD],
        [DATATYPES.AML],
        [ethers.utils.formatBytes32String("FAIL")],
        usdc.address
      )
    })

    it('success (wrong userAddr)', async () => {
      const genData = await generateData(userA, "PASS", DATATYPES.KYC);
      const genDataB = await generateData(userB, "PASS", DATATYPES.KYC);
      await main.connect(attestor).postAttributes(
        [genData.walletSigAndAddr],
        [genData.attestation],
        [genData.nonce],
        [genData.ky0xID],
        [DATATYPES.KYC]
      );
      await usdc.approve(main.address, ethers.utils.parseEther("10"));
      const initialBalance = await usdc.balanceOf(deployer.address);
      await main.queryAttributesMatch(
        ethers.utils.keccak256(genDataB.walletSig),
        userB.address,
        [genData.nonceSigKD],
        [DATATYPES.AML],
        [ethers.utils.formatBytes32String("PASS")],
        usdc.address
      )
    })

    it('success (wrong hashWalletSig)', async () => {
      const genData = await generateData(userA, "PASS", DATATYPES.KYC);
      await main.connect(attestor).postAttributes(
        [genData.walletSigAndAddr],
        [genData.attestation],
        [genData.nonce],
        [genData.ky0xID],
        [DATATYPES.KYC]
      );
      await usdc.approve(main.address, ethers.utils.parseEther("10"));
      const initialBalance = await usdc.balanceOf(deployer.address);
      const wrongHashWalletSig = ethers.utils.id("hello")
      await main.queryAttributesMatch(
        wrongHashWalletSig,
        userA.address,
        [genData.nonceSigKD],
        [DATATYPES.AML],
        [ethers.utils.formatBytes32String("FAIL")],
        usdc.address
      )
    })

    it('success (wrong nonceSig)', async () => {
      const genData = await generateData(userA, "PASS", DATATYPES.KYC);
      const wrongGenData = await generateData(userA, "PASS", DATATYPES.AML);
      await main.connect(attestor).postAttributes(
        [genData.walletSigAndAddr],
        [genData.attestation],
        [genData.nonce],
        [genData.ky0xID],
        [DATATYPES.KYC]
      );
      await usdc.approve(main.address, ethers.utils.parseEther("10"));
      const initialBalance = await usdc.balanceOf(deployer.address);
      await main.queryAttributesMatch(
        ethers.utils.keccak256(genData.walletSig),
        userA.address,
        [wrongGenData.nonceSigKD],
        [DATATYPES.KYC],
        [ethers.utils.formatBytes32String("PASS")],
        usdc.address
      )
    })

    it('fail (bad nonceSigsKD length)', async () => {
      const genData = await generateData(userA, "PASS", DATATYPES.KYC);
      await expect(main.queryAttributesMatch(
        ethers.utils.keccak256(genData.walletSig),
        userA.address,
        [genData.nonceSigKD, genData.nonceSigKD],
        [DATATYPES.KYC],
        [ethers.utils.formatBytes32String("PASS")],
        usdc.address
      )).to.be.revertedWith("not same length")
    })

    it('fail (bad dataTypes length)', async () => {
      const genData = await generateData(userA, "PASS", DATATYPES.KYC);
      await expect(main.queryAttributesMatch(
        ethers.utils.keccak256(genData.walletSig),
        userA.address,
        [genData.nonceSigKD],
        [DATATYPES.KYC, DATATYPES.KYC],
        [ethers.utils.formatBytes32String("PASS")],
        usdc.address
      )).to.be.revertedWith("not same length")
    })

    it('fail (bad rawValues length)', async () => {
      const genData = await generateData(userA, "PASS", DATATYPES.KYC);
      await expect(main.queryAttributesMatch(
        ethers.utils.keccak256(genData.walletSig),
        userA.address,
        [genData.nonceSigKD],
        [DATATYPES.KYC],
        [ethers.utils.formatBytes32String("PASS"), ethers.utils.formatBytes32String("PASS")],
        usdc.address
      )).to.be.revertedWith("not same length")
    })

    it('fail (not enough allowance)', async () => {
      const genData = await generateData(userA, "PASS", DATATYPES.KYC);
      await usdc.approve(main.address, ethers.utils.parseUnits("0.999", "mwei"));
      await expect(main.queryAttributesMatch(
        ethers.utils.keccak256(genData.walletSig),
        userA.address,
        [genData.nonceSigKD],
        [DATATYPES.KYC],
        [ethers.utils.formatBytes32String("PASS")],
        usdc.address
      )).to.be.revertedWith("insufficient allowance")
    })

    it('fail (not enough balance)', async () => {
      const genData = await generateData(userA, "PASS", DATATYPES.KYC);
      await usdc.connect(userA).approve(main.address, ethers.utils.parseEther("10"));
      await expect(main.connect(userA).queryAttributesMatch(
        ethers.utils.keccak256(genData.walletSig),
        userA.address,
        [genData.nonceSigKD],
        [DATATYPES.KYC],
        [ethers.utils.formatBytes32String("PASS")],
        usdc.address
      )).to.be.revertedWith("ERC20: transfer amount exceeds balance")
    })

    it('fail (token not allowed)', async () => {
      const uni = await deployERC20({ name: "Uniswap", symbol: "UNI", decimals: 18 });
      const genData = await generateData(userA, "PASS", DATATYPES.KYC);
      await expect(main.queryAttributesMatch(
        ethers.utils.keccak256(genData.walletSig),
        userA.address,
        [genData.nonceSigKD],
        [DATATYPES.KYC],
        [ethers.utils.formatBytes32String("PASS")],
        uni.address
      )).to.be.revertedWith("token not supported")
    })

    it('fail (out of balance)', async () => {
      const genData = await generateData(userA, "PASS", DATATYPES.KYC);
      await usdc.transfer(userA.address, ethers.utils.parseUnits("2", "mwei"));
      await usdc.connect(userA).approve(main.address, ethers.utils.parseEther("1"));
      await main.connect(userA).queryAttributesMatch(
        ethers.utils.keccak256(genData.walletSig),
        userA.address,
        [genData.nonceSigKD],
        [DATATYPES.KYC],
        [ethers.utils.formatBytes32String("PASS")],
        usdc.address
      )
      // Check Balance
      expect(await usdc.balanceOf(treasury.address)).to.be.equal(ethers.utils.parseUnits("1", "mwei"));
      await main.connect(userA).queryAttributesMatch(
        ethers.utils.keccak256(genData.walletSig),
        userA.address,
        [genData.nonceSigKD],
        [DATATYPES.KYC],
        [ethers.utils.formatBytes32String("PASS")],
        usdc.address
      )
      // Check Balance
      expect(await usdc.balanceOf(treasury.address)).to.be.equal(ethers.utils.parseUnits("2", "mwei"));
      await expect(main.connect(userA).queryAttributesMatch(
        ethers.utils.keccak256(genData.walletSig),
        userA.address,
        [genData.nonceSigKD],
        [DATATYPES.KYC],
        [ethers.utils.formatBytes32String("PASS")],
        usdc.address
      )).to.be.revertedWith("ERC20: transfer amount exceeds balance")

    })
  })
})

