require("@quai/hardhat-deploy-metadata");
require("@nomicfoundation/hardhat-toolbox");
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
    mainnetCyprus1: {
      url: process.env.MAINNET_RPC_URL || "https://rpc.quai.network/cyprus1",
      accounts: process.env.MAINNET_CYPRUS1_PK
        ? [process.env.MAINNET_CYPRUS1_PK]
        : process.env.CYPRUS1_PK
          ? [process.env.CYPRUS1_PK]
          : [],
    },
    orchardCyprus1: {
      url: process.env.ORCHARD_RPC_URL || "https://orchard.rpc.quai.network/cyprus1",
      accounts: process.env.ORCHARD_CYPRUS1_PK
        ? [process.env.ORCHARD_CYPRUS1_PK]
        : process.env.CYPRUS1_PK
          ? [process.env.CYPRUS1_PK]
          : [],
    },
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
