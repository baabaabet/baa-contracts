import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "hardhat-preprocessor";
import fs from "fs";
import "hardhat-wallet";
import "hardhat-spdx-license-identifier";
import * as dotenv from "dotenv";
dotenv.config({path: "./.env"});
import "./tasks/index"


function getRemappings() {
  return fs
    .readFileSync("remappings.txt", "utf8")
    .split("\n")
    .filter(Boolean) // remove empty lines
    .map((line) => line.trim().split("="));
}

const config: HardhatUserConfig = {
  solidity: {
    compilers:[
      {
        version: "0.8.17",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200
          }
        }
      }
    ],
  },
  preprocess: {
    eachLine: (hre) => ({
      transform: (line: string) => {
        if (line.match(/^\s*import /i)) {
          for (const [from, to] of getRemappings()) {
            if (line.includes(from)) {
              line = line.replace(from, to);
              break;
            }
          }
        }
        return line;
      },
    }),
  },
  paths: {
    sources: "./src",
    cache: "./cache-hardhat",
  },
  spdxLicenseIdentifier: {
    overwrite: true,
    runOnCompile: true,
  },
  gasReporter: {
    enabled: true,
    currency: process.env.GAS_REPOTER_CURRENCY,
    coinmarketcap: process.env.GAS_REPOTER_COIN_MARKET_KEY,
    showMethodSig: true,
    token: process.env.GAS_REPOTER_TOKEN,
    gasPriceApi: process.env.GAS_REPOTER_GAS_PRICE_API
  },
  networks: {
    avalanche_fuji: {
      url: process.env.AVALANCHE_TESTNET_RPC_URL,
      chainId: 43113
    },
    avalanche_mainnet: {
      url: process.env.AVALANCHE_mainnet_RPC_URL,
      chainId: 43114
    },
  }
};

export default config;
