const { BN, constants, expectEvent, expectRevert } = require('@openzeppelin/test-helpers');
const { expect } = require('chai');

const { ethers, upgrades } = require('hardhat');

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
  DATATYPES,
  MATCH_STATUS,
} = require('./utils/constant');

describe('Scenarios', () => {
  let deployer, attestor, userA, userB, userC, governance, treasury, pauser;
  let main, msb, usdc, weth, dai;
  let usdcOracle;

  beforeEach(async () => {
    [deployer, attestor, treasury, governance, userA, userB, userC, pauser] = await ethers.getSigners();

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

  describe('Query Via MSB (MATCH)', function() {
    it('POST KYC (MATCH) -> QUERY KYC (PAYMENT USDC)', async () => {
      const genData = await generateData(userA, "PASS", DATATYPES.KYC);
      const tx = await main.connect(attestor).postAttribute(
        genData.walletSigAndAddr,
        genData.attestation,
        genData.nonce,
        genData.ky0xID,
        DATATYPES.KYC,
        1
      );
      const inputs = {
        token: usdc,
        msb: msb,
        treasury: treasury,
        main: main,
        genDataList: [genData],
        sender: userA,
      }
      const outputs = {
        matches: [MATCH_STATUS.MATCH],
        blockNumbers: [tx.blockNumber]
      }
      await callMSBAndAssert(inputs, outputs);
    })


    it('POST KYC (MATCH) -> QUERY KYC (PAYMENT DAI)', async () => {
      const genData = await generateData(userA, "PASS", DATATYPES.KYC);
      const tx = await main.connect(attestor).postAttribute(
        genData.walletSigAndAddr,
        genData.attestation,
        genData.nonce,
        genData.ky0xID,
        DATATYPES.KYC,
        1
      );
      const inputs = {
        token: dai,
        msb: msb,
        treasury: treasury,
        main: main,
        genDataList: [genData],
        sender: userA,
      }
      const outputs = {
        matches: [MATCH_STATUS.MATCH],
        blockNumbers: [tx.blockNumber]
      }
      await callMSBAndAssert(inputs, outputs);
    })

    it('POST KYC -> QUERY KYC (PAYMENT WETH)', async () => {
      const genData = await generateData(userA, "PASS", DATATYPES.KYC);
      const tx = await main.connect(attestor).postAttribute(
        genData.walletSigAndAddr,
        genData.attestation,
        genData.nonce,
        genData.ky0xID,
        DATATYPES.KYC,
        1
      );
      const inputs = {
        token: weth,
        msb: msb,
        treasury: treasury,
        main: main,
        genDataList: [genData],
        sender: userA,
      }
      const outputs = {
        matches: [MATCH_STATUS.MATCH],
        blockNumbers: [tx.blockNumber]
      }
      await callMSBAndAssert(inputs, outputs);
    })

    it('POST KYC/AML (MATCH) -> Query KYC/AML', async () => {
      const genData = await generateData(userA, "PASS", DATATYPES.KYC);
      const genDataAML = await generateData(userA, "LOW_RISK", DATATYPES.AML, genData.ky0xID);
      const tx = await main.connect(attestor).postAttribute(
        genData.walletSigAndAddr,
        genData.attestation,
        genData.nonce,
        genData.ky0xID,
        DATATYPES.KYC,
        1
      );
      const tx2 = await main.connect(attestor).postAttribute(
        genDataAML.walletSigAndAddr,
        genDataAML.attestation,
        genDataAML.nonce,
        genDataAML.ky0xID,
        DATATYPES.AML,
        1
      );
      const inputs = {
        token: usdc,
        msb: msb,
        treasury: treasury,
        main: main,
        genDataList: [genData, genDataAML],
        sender: userA,
      }
      const outputs = {
        matches: [MATCH_STATUS.MATCH, MATCH_STATUS.MATCH],
        blockNumbers: [tx.blockNumber, tx2.blockNumber]
      }
      await callMSBAndAssert(inputs, outputs);
    })
  })

  describe('Query Via MSB (NO_MATCH)', function() {
    it('Post KYC (FAIL) -> Query KYC (FAIL)', async () => {
      const genData = await generateData(userA, "FAIL", DATATYPES.KYC);
      const tx = await main.connect(attestor).postAttribute(
        genData.walletSigAndAddr,
        genData.attestation,
        genData.nonce,
        genData.ky0xID,
        DATATYPES.KYC,
        1
      );
      const inputs = {
        token: usdc,
        msb: msb,
        treasury: treasury,
        main: main,
        genDataList: [genData],
        sender: userA,
      }
      const outputs = {
        matches: [MATCH_STATUS.NO_MATCH],
        blockNumbers: [tx.blockNumber]
      }
      await callMSBAndAssert(inputs, outputs);

    })

    it('Post KYC(PASS) & AML(LOW_RISK) -> Query KYC & AML', async () => {
      const genData = await generateData(userA, "PASS", DATATYPES.KYC);
      const genDataAML = await generateData(userA, "REVIEW_REQUIRED", DATATYPES.AML, genData.ky0xID);
      const tx = await main.connect(attestor).postAttribute(
        genData.walletSigAndAddr,
        genData.attestation,
        genData.nonce,
        genData.ky0xID,
        DATATYPES.KYC,
        1
      );
      const tx2 = await main.connect(attestor).postAttribute(
        genDataAML.walletSigAndAddr,
        genDataAML.attestation,
        genDataAML.nonce,
        genDataAML.ky0xID,
        DATATYPES.AML,
        1
      );
      const inputs = {
        token: usdc,
        msb: msb,
        treasury: treasury,
        main: main,
        genDataList: [genData, genDataAML],
        sender: userA,
      }
      const outputs = {
        matches: [MATCH_STATUS.MATCH, MATCH_STATUS.NO_MATCH],
        blockNumbers: [tx.blockNumber, tx2.blockNumber]
      }
      await callMSBAndAssert(inputs, outputs);
    })

    it('KYC NO_MATCH / AML MATCH / NO_MATCH', async () => {
      const genData = await generateData(userA, "PASS", DATATYPES.KYC);
      const genDataAML = await generateData(userA, "LOW_RISK", DATATYPES.AML, genData.ky0xID);
      const tx = await main.connect(attestor).postAttribute(
        genData.walletSigAndAddr,
        genData.attestation,
        genData.nonce,
        genData.ky0xID,
        DATATYPES.KYC,
        1
      );
      const tx2 = await main.connect(attestor).postAttribute(
        genDataAML.walletSigAndAddr,
        genDataAML.attestation,
        genDataAML.nonce,
        genDataAML.ky0xID,
        DATATYPES.AML,
        1
      );
      const inputs = {
        token: usdc,
        msb: msb,
        treasury: treasury,
        main: main,
        genDataList: [genData, genDataAML],
        sender: userA,
      }
      const outputs = {
        matches: [MATCH_STATUS.MATCH, MATCH_STATUS.MATCH],
        blockNumbers: [tx.blockNumber, tx2.blockNumber]
      }
      await callMSBAndAssert(inputs, outputs);
    })
  })

  describe('MSB reverts', function() {
    it('POST KYC (FAIL) -> Query KYC', async () => {
      const genData = await generateData(userA, "FAIL", DATATYPES.KYC);
      await main.connect(attestor).postAttribute(
        genData.walletSigAndAddr,
        genData.attestation,
        genData.nonce,
        genData.ky0xID,
        genData.dataType,
        1
      );
      const hashWalletSig = ethers.utils.keccak256(genData.walletSig);
      await expect(
        msb.connect(userA).deposit(
          [genData.nonceSigKD],
          hashWalletSig,
          usdc.address
        )).to.be.revertedWith("KYC no match");
    })

    it('POST KYC (PASS) / AML (LOW_RISK) -> Query KYC / AML', async () => {
      const genData = await generateData(userA, "PASS", DATATYPES.KYC);
      const genDataAML = await generateData(userA, "REVIEW_REQUIRED", DATATYPES.AML, genData.ky0xID);
      let tx = await main.connect(attestor).postAttribute(
        genData.walletSigAndAddr,
        genData.attestation,
        genData.nonce,
        genData.ky0xID,
        DATATYPES.KYC,
        1
      );
      let tx2 = await main.connect(attestor).postAttribute(
        genDataAML.walletSigAndAddr,
        genDataAML.attestation,
        genDataAML.nonce,
        genDataAML.ky0xID,
        DATATYPES.AML,
        1
      );

      const hashWalletSig = ethers.utils.keccak256(genData.walletSig);
      await expect(
        msb.connect(userA).deposit(
          [genData.nonceSigKD, genDataAML.nonceSigKD],
          hashWalletSig,
          usdc.address
        )).to.be.revertedWith("KYC no match");
    })

    it('Wrong Sender (ky0xID not found)', async () => {
      const genData = await generateData(userA, "PASS", DATATYPES.KYC);
      await main.connect(attestor).postAttribute(
        genData.walletSigAndAddr,
        genData.attestation,
        genData.nonce,
        genData.ky0xID,
        DATATYPES.KYC,
        1
      );
      const hashWalletSig = ethers.utils.keccak256(genData.walletSig);
      await expect(
        msb.connect(userB).deposit(
          [genData.nonceSigKD],
          hashWalletSig,
          usdc.address
        )).to.be.revertedWith("ky0xID not found");
    })

    it('Post AML (LOW_RISK) -> Query KYC' , async () => {
      const genData = await generateData(userA, "LOW_RISK", DATATYPES.AML);
      const tx = await main.connect(attestor).postAttribute(
        genData.walletSigAndAddr,
        genData.attestation,
        genData.nonce,
        genData.ky0xID,
        genData.dataType,
        1
      );

      const hashWalletSig = ethers.utils.keccak256(genData.walletSig);
      await expect(
        msb.connect(userA).deposit(
          [genData.nonceSigKD],
          hashWalletSig,
          usdc.address
        )).to.be.revertedWith("ky0xID not found");
    })
  })

  describe('Missing DataTypes', function() {
    it('Post AML (LOW_RISK) -> Query KYC', async () => {
      const genDataAML = await generateData(userA, "LOW_RISK", DATATYPES.AML);
      const tx = await main.connect(attestor).postAttribute(
        genDataAML.walletSigAndAddr,
        genDataAML.attestation,
        genDataAML.nonce,
        genDataAML.ky0xID,
        genDataAML.dataType,
        1
      );
      const inputs = {
        token: usdc,
        msb: msb,
        treasury: treasury,
        main: main,
        genDataList: [genDataAML],
        sender: userA,
      }
      const outputs = {
        matches: [MATCH_STATUS.NOT_FOUND],
        blockNumbers: [0],
        ky0xId: ethers.constants.HashZero
      }
      await callMSBAndAssert(inputs, outputs);
    })

    it('Post KYC (PASS) -> Query KYC & AML', async () => {
      const genData = await generateData(userA, "PASS", DATATYPES.KYC);
      const genDataAML = await generateData(userA, "LOW_RISK", DATATYPES.AML, genData.ky0xID);
      const tx = await main.connect(attestor).postAttribute(
        genData.walletSigAndAddr,
        genData.attestation,
        genData.nonce,
        genData.ky0xID,
        genData.dataType,
        1
      );
      const inputs = {
        token: usdc,
        msb: msb,
        treasury: treasury,
        main: main,
        genDataList: [genData, genDataAML],
        sender: userA,
      }
      const outputs = {
        matches: [MATCH_STATUS.MATCH, MATCH_STATUS.NOT_FOUND],
        blockNumbers: [tx.blockNumber, 0],
        ky0xId:genData.ky0xID
      }
      await callMSBAndAssert(inputs, outputs);

    })

    it('Post AML (LOW_RISK) -> Query KYC & AML', async () => {
      const genData = await generateData(userA, "PASS", DATATYPES.KYC);
      const genDataAML = await generateData(userA, "LOW_RISK", DATATYPES.AML, genData.ky0xID);
      const tx = await main.connect(attestor).postAttribute(
        genDataAML.walletSigAndAddr,
        genDataAML.attestation,
        genDataAML.nonce,
        genDataAML.ky0xID,
        genDataAML.dataType,
        1
      );
      const inputs = {
        token: usdc,
        msb: msb,
        treasury: treasury,
        main: main,
        genDataList: [genData, genDataAML],
        sender: userA,
      }
      const outputs = {
        matches: [MATCH_STATUS.NOT_FOUND, MATCH_STATUS.MATCH],
        blockNumbers: [0, tx.blockNumber],
        ky0xId: genDataAML.ky0xID
      }
      await callMSBAndAssert(inputs, outputs);
    })
  })

  describe('Attested With Different Timeframe', function() {
    it('POST KYC -> POST WALLT_AML -> POST AML -> QUERY ALL', async () => {
      const genData = await generateData(userA, "PASS", DATATYPES.KYC);
      const genDataAML = await generateData(userA, "LOW_RISK", DATATYPES.AML, genData.ky0xID);
      const tx1 = await main.connect(attestor).postAttribute(
        genData.walletSigAndAddr,
        genData.attestation,
        genData.nonce,
        genData.ky0xID,
        genData.dataType,
        1
      );
      const tx2 = await main.connect(attestor).postAttribute(
        genDataAML.walletSigAndAddr,
        genDataAML.attestation,
        genDataAML.nonce,
        genDataAML.ky0xID,
        genDataAML.dataType,
        1
      );
      const inputs = {
        token: usdc,
        msb: msb,
        treasury: treasury,
        main: main,
        genDataList: [genData, genDataAML],
        sender: userA,
      }
      const outputs = {
        matches: [MATCH_STATUS.MATCH, MATCH_STATUS.MATCH],
        blockNumbers: [tx1.blockNumber, tx2.blockNumber]
      }
      await callMSBAndAssert(inputs, outputs);
    })
  })

  describe('Many Users Batching', function() {
    it('Post UserA & UserB & UserC-> Query User A -> Query User B -> Query C', async () => {
      const genData = await generateData(userA, "PASS", DATATYPES.KYC);
      const genDataB = await generateData(userB, "PASS", DATATYPES.KYC);
      const genDataC = await generateData(userC, "FAIL", DATATYPES.KYC);
      const genDataD = await generateData(attestor, "PASS", DATATYPES.KYC);
      const tx = await main.connect(attestor).postAttribute(
        genData.walletSigAndAddr,
        genData.attestation,
        genData.nonce,
        genData.ky0xID,
        genData.dataType,
        1
      );
      const tx2 = await main.connect(attestor).postAttribute(
        genDataB.walletSigAndAddr,
        genDataB.attestation,
        genDataB.nonce,
        genDataB.ky0xID,
        genDataB.dataType,
        1
      );
      const tx3 = await main.connect(attestor).postAttribute(
        genDataC.walletSigAndAddr,
        genDataC.attestation,
        genDataC.nonce,
        genDataC.ky0xID,
        genDataC.dataType,
        1
      );
      const inputsA = {
        token: usdc,
        msb: msb,
        treasury: treasury,
        main: main,
        genDataList: [genData],
        sender: userA,
      }
      const outputsA = {
        matches: [MATCH_STATUS.MATCH],
        blockNumbers: [tx.blockNumber]
      }
      await callMSBAndAssert(inputsA, outputsA);
      const inputsB = {
        token: usdc,
        msb: msb,
        treasury: treasury,
        main: main,
        genDataList: [genDataB],
        sender: userB,
      }
      const outputsB = {
        matches: [MATCH_STATUS.MATCH],
        blockNumbers: [tx2.blockNumber]
      }
      await callMSBAndAssert(inputsB, outputsB);
      const inputsC = {
        token: usdc,
        msb: msb,
        treasury: treasury,
        main: main,
        genDataList: [genDataC],
        sender: userC,
      }
      const outputsC = {
        matches: [MATCH_STATUS.NO_MATCH],
        blockNumbers: [tx3.blockNumber]
      }
      await callMSBAndAssert(inputsC, outputsC);
      const inputsD = {
        token: usdc,
        msb: msb,
        treasury: treasury,
        main: main,
        genDataList: [genDataD],
        sender: attestor,
      }
      const outputsD = {
        matches: [MATCH_STATUS.NOT_FOUND],
        blockNumbers: [0],
        ky0xId: ethers.constants.HashZero
      }
      await callMSBAndAssert(inputsD, outputsD);
    })
  })

  describe('Different Wallet, Same ky0xID', function() {
    it('Post WalletA -> Post WalletB -> Query WalletA -> Query WalletB', async () => {
      const genData = await generateData(userA, "PASS", DATATYPES.KYC);
      const genDataB = await generateData(userB, "PASS", DATATYPES.KYC, genData.ky0xID);
      const tx = await main.connect(attestor).postAttribute(
        genData.walletSigAndAddr,
        genData.attestation,
        genData.nonce,
        genData.ky0xID,
        genData.dataType,
        1
      );
      const tx2 = await main.connect(attestor).postAttribute(
        genDataB.walletSigAndAddr,
        genDataB.attestation,
        genDataB.nonce,
        genDataB.ky0xID,
        genDataB.dataType,
        1
      );
      const inputsA = {
        token: usdc,
        msb: msb,
        treasury: treasury,
        main: main,
        genDataList: [genData],
        sender: userA,
      }
      const outputsA = {
        matches: [MATCH_STATUS.MATCH],
        blockNumbers: [tx.blockNumber]
      }
      const inputsB = {
        token: usdc,
        msb: msb,
        treasury: treasury,
        main: main,
        genDataList: [genDataB],
        sender: userB,
      }
      const outputsB = {
        matches: [MATCH_STATUS.MATCH],
        blockNumbers: [tx2.blockNumber]
      }
      await callMSBAndAssert(inputsB, outputsB);

      // Test using genDataB with UserA
      const inputMix = {
        token: usdc,
        msb: msb,
        treasury: treasury,
        main: main,
        genDataList: [genDataB],
        sender: userA,
      }
      const outputsMix = {
        matches: [MATCH_STATUS.NOT_FOUND],
        blockNumbers: [0],
        ky0xId:ethers.constants.HashZero
      }
      await callMSBAndAssert(inputMix, outputsMix);

    })
  })

  describe('Continuous Monitoring - Data Update', function() {
    it('[Re-using Nonce] Post KYC (PASS) -> QUERY KYC -> UPDATE KYC (PASS) -> QUERY KYC', async () => {
      let genData = await generateData(userA, "PASS", DATATYPES.KYC);
      let tx = await main.connect(attestor).postAttribute(
        genData.walletSigAndAddr,
        genData.attestation,
        genData.nonce,
        genData.ky0xID,
        genData.dataType,
        1
      );
      let inputs = {
        token: usdc,
        msb: msb,
        treasury: treasury,
        main: main,
        genDataList: [genData],
        sender: userA,
      }
      let outputs = {
        matches: [MATCH_STATUS.MATCH],
        blockNumbers: [tx.blockNumber]
      }
      await callMSBAndAssert(inputs, outputs);

      // Update to FAIL
      const genDataNew = await generateData(userA, "FAIL", DATATYPES.KYC, genData.ky0xID, genData.nonce);
      tx = await main.connect(attestor).postAttribute(
        genDataNew.walletSigAndAddr,
        genDataNew.attestation,
        genDataNew.nonce,
        genDataNew.ky0xID,
        genDataNew.dataType,
        2
      );
      inputs = {
        token: usdc,
        msb: msb,
        treasury: treasury,
        main: main,
        genDataList: [genDataNew],
        sender: userA,
      }
      outputs = {
        matches: [MATCH_STATUS.NO_MATCH],
        blockNumbers: [tx.blockNumber]
      }
      await callMSBAndAssert(inputs, outputs);
    })

    it('[New Nonce] Post KYC (PASS) -> QUERY KYC -> UPDATE KYC (PASS) -> QUERY KYC', async () => {
      let genData = await generateData(userA, "PASS", DATATYPES.KYC);
      let tx = await main.connect(attestor).postAttribute(
        genData.walletSigAndAddr,
        genData.attestation,
        genData.nonce,
        genData.ky0xID,
        genData.dataType,
        1
      );
      let inputs = {
        token: usdc,
        msb: msb,
        treasury: treasury,
        main: main,
        genDataList: [genData],
        sender: userA,
      }
      let outputs = {
        matches: [MATCH_STATUS.MATCH],
        blockNumbers: [tx.blockNumber]
      }
      await callMSBAndAssert(inputs, outputs);

      // Update to FAIL
      const genDataNew = await generateData(userA, "FAIL", DATATYPES.KYC, genData.ky0xID, genData.nonce);
      tx = await main.connect(attestor).postAttribute(
        genDataNew.walletSigAndAddr,
        genDataNew.attestation,
        genDataNew.nonce,
        genDataNew.ky0xID,
        genDataNew.dataType,
        2
      );
      inputs = {
        token: usdc,
        msb: msb,
        treasury: treasury,
        main: main,
        genDataList: [genDataNew],
        sender: userA,
      }
      outputs = {
        matches: [MATCH_STATUS.NO_MATCH],
        blockNumbers: [tx.blockNumber]
      }
      await callMSBAndAssert(inputs, outputs);
    })

    it('Post KYC (PASS) & AML (LOW_RISK) -> QUERY KYC/AML -> UPDATE AML (LOW_RISK) -> QUERY KYC/AML', async () => {
      let genData = await generateData(userA, "PASS", DATATYPES.KYC);
      let genDataAML = await generateData(userA, "LOW_RISK", DATATYPES.AML, genData.ky0xID);
      let tx = await main.connect(attestor).postAttribute(
        genData.walletSigAndAddr,
        genData.attestation,
        genData.nonce,
        genData.ky0xID,
        DATATYPES.KYC,
        1
      );
      let tx2 = await main.connect(attestor).postAttribute(
        genDataAML.walletSigAndAddr,
        genDataAML.attestation,
        genDataAML.nonce,
        genDataAML.ky0xID,
        DATATYPES.AML,
        1
      );
      let inputs = {
        token: usdc,
        msb: msb,
        treasury: treasury,
        main: main,
        genDataList: [genData, genDataAML],
        sender: userA,
      }
      let outputs = {
        matches: [MATCH_STATUS.MATCH, MATCH_STATUS.MATCH],
        blockNumbers: [tx.blockNumber, tx2.blockNumber]
      }
      await callMSBAndAssert(inputs, outputs);

      // Update AML to HIGH_RISK
      const genDataNew = await generateData(userA, "HIGH_RISK", DATATYPES.AML, genData.ky0xID, genData.nonce);
      const tx3 = await main.connect(attestor).postAttribute(
        genDataNew.walletSigAndAddr,
        genDataNew.attestation,
        genDataNew.nonce,
        genDataNew.ky0xID,
        genDataNew.dataType,
        2
      );
      inputs = {
        token: usdc,
        msb: msb,
        treasury: treasury,
        main: main,
        genDataList: [genData, genDataNew],
        sender: userA,
      }
      outputs = {
        matches: [MATCH_STATUS.MATCH, MATCH_STATUS.NO_MATCH],
        blockNumbers: [tx.blockNumber, tx3.blockNumber]
      }
      await callMSBAndAssert(inputs, outputs);
    })
  })

  describe('Smart Contract Update', function() {
    it('POST KYC/AML -> Query KYC/AML -> Update Smart Contract -> Query KYC/AML', async () => {
      let genData = await generateData(userA, "PASS", DATATYPES.KYC);
      let genDataAML = await generateData(userA, "LOW_RISK", DATATYPES.AML, genData.ky0xID);
      let tx = await main.connect(attestor).postAttribute(
        genData.walletSigAndAddr,
        genData.attestation,
        genData.nonce,
        genData.ky0xID,
        DATATYPES.KYC,
        1
      );
      let tx2 = await main.connect(attestor).postAttribute(
        genDataAML.walletSigAndAddr,
        genDataAML.attestation,
        genDataAML.nonce,
        genDataAML.ky0xID,
        DATATYPES.AML,
        1
      );
      let inputs = {
        token: usdc,
        msb: msb,
        treasury: treasury,
        main: main,
        genDataList: [genData, genDataAML],
        sender: userA,
      }
      let outputs = {
        matches: [MATCH_STATUS.MATCH, MATCH_STATUS.MATCH],
        blockNumbers: [tx.blockNumber, tx2.blockNumber]
      }
      await callMSBAndAssert(inputs, outputs);
      const Ky0xMainV2 = await ethers.getContractFactory('Ky0xMainV2');
      // Hack because `upgradeMain` bug - cannot specify a diff account than `deployer`
      await main.connect(governance).grantRole(DEFAULT_ADMIN_ROLE, deployer.address);
      const newMain = await upgradeMain(main, Ky0xMainV2, []);
      expect(main.address).to.be.equal(newMain.address);
      await callMSBAndAssert(inputs, outputs);
    })

    it('POST KYC/AML Update Smart Contract -> Query KYC/AML -> Post KYC/AML -> Query KYC/AML', async () => {
      let genData = await generateData(userA, "PASS", DATATYPES.KYC);
      let genDataAML = await generateData(userA, "LOW_RISK", DATATYPES.AML, genData.ky0xID);
      let tx = await main.connect(attestor).postAttribute(
        genData.walletSigAndAddr,
        genData.attestation,
        genData.nonce,
        genData.ky0xID,
        DATATYPES.KYC,
        1
      );
      let tx2 = await main.connect(attestor).postAttribute(
        genDataAML.walletSigAndAddr,
        genDataAML.attestation,
        genDataAML.nonce,
        genDataAML.ky0xID,
        DATATYPES.AML,
        1
      );
      let inputs = {
        token: usdc,
        msb: msb,
        treasury: treasury,
        main: main,
        genDataList: [genData, genDataAML],
        sender: userA,
      }
      let outputs = {
        matches: [MATCH_STATUS.MATCH, MATCH_STATUS.MATCH],
        blockNumbers: [tx.blockNumber, tx2.blockNumber]
      }
      const Ky0xMainV2 = await ethers.getContractFactory('Ky0xMainV2');
      // Hack because `upgradeMain` bug - cannot specify a diff account than `deployer`
      await main.connect(governance).grantRole(DEFAULT_ADMIN_ROLE, deployer.address);
      const newMain = await upgradeMain(main, Ky0xMainV2, []);
      expect(main.address).to.be.equal(newMain.address);
      await callMSBAndAssert(inputs, outputs);
      genDataAML = await generateData(userA, "HIGH_RISK", DATATYPES.AML, genData.ky0xID);
      let genDataB = await generateData(userB, "PASS", DATATYPES.KYC);
      let tx3 = await main.connect(attestor).postAttribute(
        genDataB.walletSigAndAddr,
        genDataB.attestation,
        genDataB.nonce,
        genDataB.ky0xID,
        genDataB.dataType,
        1
      );
      let tx4 = await main.connect(attestor).postAttribute(
        genDataAML.walletSigAndAddr,
        genDataAML.attestation,
        genDataAML.nonce,
        genDataAML.ky0xID,
        genDataAML.dataType,
        2
      );
      // Query userA Update (AML become HIGH_RISK)
      inputs = {
        token: usdc,
        msb: msb,
        treasury: treasury,
        main: main,
        genDataList: [genData, genDataAML],
        sender: userA,
      }
      outputs = {
        matches: [MATCH_STATUS.MATCH, MATCH_STATUS.NO_MATCH],
        blockNumbers: [tx.blockNumber, tx4.blockNumber]
      }
      await callMSBAndAssert(inputs, outputs);
      // Query userB new attestation
      inputs = {
        token: usdc,
        msb: msb,
        treasury: treasury,
        main: main,
        genDataList: [genDataB],
        sender: userA,
      }
      outputs = {
        matches: [MATCH_STATUS.MATCH],
        blockNumbers: [tx4.blockNumber]
      }
    })
  })

  describe('Change of Price Feed', function() {
    it('Post -> Query -> Change Price -> Query', async () => {
      const genData = await generateData(userA, "PASS", DATATYPES.KYC);
      const tx = await main.connect(attestor).postAttribute(
        genData.walletSigAndAddr,
        genData.attestation,
        genData.nonce,
        genData.ky0xID,
        genData.dataType,
        1
      );
      let inputs = {
        token: usdc,
        msb: msb,
        treasury: treasury,
        main: main,
        genDataList: [genData],
        sender: userA,
      }
      let outputs = {
        matches: [MATCH_STATUS.MATCH],
        blockNumbers: [tx.blockNumber]
      }
      await callMSBAndAssert(inputs, outputs);

      const newUsdcOracle = await deployChainLinkPriceOracle({
        decimals: 8,
        description: "USDC / USD",
        price: 2,
      })

      await allowTokensForPayment({
        governance: governance,
        main: main,
        tokensAndOracles: [{
          token: usdc,
          oracleAddress: newUsdcOracle.address,
        }]
      })

      inputs = {
        token: usdc,
        msb: msb,
        treasury: treasury,
        main: main,
        genDataList: [genData],
        sender: userA,
      }
      outputs = {
        matches: [MATCH_STATUS.MATCH],
        blockNumbers: [tx.blockNumber]
      }
      await callMSBAndAssert(inputs, outputs);
    })
  })

  describe('Query Via callKy0x', function() {
    it('POST KYC (MATCH) -> QUERY KYC (PAYMENT USDC)', async () => {
      const genData = await generateData(userA, "PASS", DATATYPES.KYC);
      const tx = await main.connect(attestor).postAttribute(
        genData.walletSigAndAddr,
        genData.attestation,
        genData.nonce,
        genData.ky0xID,
        DATATYPES.KYC,
        1
      );
      const hashWalletSig = ethers.utils.keccak256(genData.walletSig);
      const initialBalanceMSB = await usdc.balanceOf(msb.address);
      const initialBalanceTreasury = await usdc.balanceOf(treasury.address);
      const tokenAmount = await main.calculateAmountPayment(usdc.address);

      await expect(msb.connect(userA).callKy0x(
        hashWalletSig,
        [genData.nonceSigKD],
        [ethers.utils.id("PASS")],
        [genData.dataType],
        usdc.address
      )).to.emit(msb, 'MatchInfo')
        .withArgs(genData.ky0xID, [MATCH_STATUS.MATCH], tokenAmount, [tx.blockNumber]);

      // Check Payment
      const expectedBalanceMSB = initialBalanceMSB.sub(tokenAmount);
      const expectedBalanceTreasury = initialBalanceTreasury.add(tokenAmount);
      expect((await usdc.balanceOf(msb.address)).toString()).to.be.equal(expectedBalanceMSB.toString());
      expect((await usdc.balanceOf(treasury.address)).toString()).to.be.equal(expectedBalanceTreasury.toString());

    })

  })
})
