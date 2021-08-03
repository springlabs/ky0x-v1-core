require("@nomiclabs/hardhat-waffle");
require('@openzeppelin/hardhat-upgrades');
require("hardhat-gas-reporter");
require('hardhat-abi-exporter');
require('hardhat-contract-sizer');

module.exports = {
  solidity: {
    compilers: [
      { version: "0.8.0" },
      { version: "0.8.2" },
    ],
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
};
