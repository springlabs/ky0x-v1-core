const { ethers, upgrades } = require("hardhat");

async function deployERC20(opts = {}) {
  const name = opts.name || "USD Coin";
  const symbol = opts.symbol || "USDC";
  const decimals = opts.decimals || 18;

  const ERC20 = await ethers.getContractFactory("KERC20");
  const erc20 = await ERC20.deploy(name, symbol, decimals);
  await erc20.deployed();
  return erc20;
}

async function deployTimelock(minDelay, proposers, executors) {
  const TimelockController = await ethers.getContractFactory("TimelockController");
  const timelock = await TimelockController.deploy(minDelay, proposers, executors);
  await timelock.deployed();
  return timelock;
}

async function deployMain(opts = {}) {
  const Ky0xMain = await ethers.getContractFactory("Ky0xMain");
  const main = await Ky0xMain.deploy();
  await main.deployed();
  return main;
}

async function deployMainAndProxy(argsValues) {
  const Ky0xMain = await ethers.getContractFactory("Ky0xMain");
  const proxy = await upgrades.deployProxy(
    Ky0xMain,
    argsValues,
    { initializer: "initialize", kind: "uups" },
  )
  await proxy.deployed();
  return proxy;
}

async function allowTokensForPayment(opts = {}) {
  const governance = opts.governance;
  const main = opts.main;
  const tokensAndOracles = opts.tokensAndOracles;

  tokensAndOracles.forEach(async (item) => {
    await main.connect(governance).allowTokenPayment(item.token.address, true, item.oracleAddress)
  })
}

async function upgradeMain(proxy, newMain, argsValues) {
  const newProxy = await upgrades.upgradeProxy(proxy.address, newMain)
  return newProxy;
}


module.exports = {
  deployERC20,
  deployMain,
  deployMainAndProxy,
  deployTimelock,
  upgradeMain,
  allowTokensForPayment,
}
