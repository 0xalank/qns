require("@quai/hardhat-deploy-metadata");
require("dotenv").config();

module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      viaIR: true,
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    cyprus1: {
      url: process.env.RPC_URL || "https://orchard.rpc.quai.network/cyprus1",
      accounts: process.env.CYPRUS1_PK ? [process.env.CYPRUS1_PK] : [],
    },
  },
  paths: {
    sources: "./contracts",
    artifacts: "./artifacts",
  },
};
