const { ethers } = require('hardhat');
const { createHmac } = require('crypto');
const { expect } = require('chai');

const {
  DATATYPES,
  KYC_VALUES
} = require('./constant');

const KY0X_HMAC_KEY = ethers.utils.randomBytes(32);

async function deployMSB(proxy, tokens) {
  const MSB = await ethers.getContractFactory("MSB");
  const msb = await MSB.deploy(proxy.address);
  await msb.deployed();
  tokens.forEach(async (token) => {
    const decimals = await token.decimals();
    const amount = ethers.BigNumber.from("1000").mul(ethers.BigNumber.from("10").pow(decimals));
    await token.transfer(msb.address, amount);
  })
  return msb
}

async function callMSBAndAssert(inputs, outputs) {
  const initialBalanceMSB = await inputs.token.balanceOf(inputs.msb.address);
  const initialBalanceTreasury = await inputs.token.balanceOf(inputs.treasury.address);
  const tokenAmount = await inputs.main.calculateAmountPayment(inputs.token.address);
  outputs.paymentAmount = tokenAmount;

  await callMSB(inputs, outputs);
  // Check Payment
  const expectedBalanceMSB = initialBalanceMSB.sub(tokenAmount);
  const expectedBalanceTreasury = initialBalanceTreasury.add(tokenAmount);
  expect((await inputs.token.balanceOf(inputs.msb.address)).toString()).to.be.equal(expectedBalanceMSB.toString());
  expect((await inputs.token.balanceOf(inputs.treasury.address)).toString()).to.be.equal(expectedBalanceTreasury.toString());
}


async function callMSB(inputs, outputs) {
  const hashWalletSig = ethers.utils.keccak256(inputs.genDataList[0].walletSig);
  const ky0xId = outputs.ky0xId || inputs.genDataList[0].ky0xID;

  await expect(inputs.msb.connect(inputs.sender).depositWithEvents(
    inputs.genDataList.map((item) => item.nonceSigKD),
    hashWalletSig,
    inputs.token.address
  )).to.emit(inputs.msb, 'MatchInfo')
    .withArgs(ky0xId, outputs.matches, outputs.paymentAmount, outputs.blockNumbers);
}

async function deployChainLinkPriceOracle(opts) {
  const decimals = opts.decimals || 18;
  const description = opts.description || "WETH / USD";
  const version = opts.version || 1;
  const price = opts.price || 1337;

  const ChainLinkPriceOracle = await ethers.getContractFactory("ChainLinkPriceOracle");
  const priceOracle = await ChainLinkPriceOracle.deploy(decimals, description, version, price);
  await priceOracle.deployed();
  return priceOracle;
}

function randomID() {
  // Ky0xID
  const firstName = ethers.utils.randomBytes(32);
  const lastName = ethers.utils.randomBytes(32);
  const dateOfBirth = ethers.utils.randomBytes(32);
  const selectedPII = ethers.utils.keccak256(firstName, lastName, dateOfBirth);

  const ky0xID = '0x' + createHmac('sha256', KY0X_HMAC_KEY)
    .update(selectedPII)
    .digest('hex');
  return ky0xID;
}

async function generateData(user, attributeRawValue, dataType, kID = '', _nonce = '') {
  // walletSig and nonceSig
  const nonce = _nonce || ethers.utils.keccak256(ethers.utils.randomBytes(32));
  const hashAddr = ethers.utils.keccak256(user.address);
  const walletSig = await user.signMessage(hashAddr);
  const nonceSig = await user.signMessage(nonce);

  const nonceSigKD = ethers.utils.keccak256(
    ethers.utils.defaultAbiCoder.encode(
      ["uint256", "uint256", "bytes32"],
      [1, dataType, ethers.utils.keccak256(nonceSig)]
    )
  );
  const walletSigAndAddr = ethers.utils.keccak256(
    ethers.utils.defaultAbiCoder.encode(
      ["bytes32",  "address"],
      [ethers.utils.keccak256(walletSig), user.address]
    )
  )

  const ky0xID = kID || randomID();
  const attestation = ethers.utils.keccak256(
    ethers.utils.defaultAbiCoder.encode(
      ["bytes32", "bytes32", "bytes32", "bytes32"],
      [ky0xID, nonceSigKD, walletSigAndAddr, ethers.utils.id(attributeRawValue)],
    )
  )

  return {
    nonce,
    hashAddr,
    walletSig,
    nonceSig,
    nonceSigKD,
    walletSigAndAddr,
    ky0xID,
    attestation,
    dataType
  }
}

module.exports = {
  randomID,
  generateData,
  deployMSB,
  callMSB,
  deployChainLinkPriceOracle,
  callMSBAndAssert,
}

