const { ethers } = require('hardhat');

const ATTESTOR_ROLE = ethers.utils.id('ATTESTOR_ROLE');
const PAUSER_ROLE = ethers.utils.id('PAUSER_ROLE');
const DEFAULT_ADMIN_ROLE = ethers.constants.HashZero;

const DATATYPES = {
  KYC: 0,
  AML: 1,
}

const ERRORS = {
  NO_ERROR: 0,
  NOT_FOUND: 1,
}

const KYC_VALUES = {
  PASS: 'PASS',
  FAIL: 'FAIL'
}

const MATCH_STATUS = {
  NOT_FOUND: 0,
  MATCH: 1,
  NO_MATCH: 2
}

module.exports = {
  ATTESTOR_ROLE,
  DEFAULT_ADMIN_ROLE,
  PAUSER_ROLE,

  DATATYPES,
  KYC_VALUES,
  ERRORS,
  MATCH_STATUS
}

