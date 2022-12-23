import {task, types} from "hardhat/config";
// import chalk from "chalk";
import path from "path";
import fs from "fs";
import {TestERC20} from "../typechain-types";

/**
 *
 * hh pairManager-addPair  \
 --contract-addr 0xE69b540726e5348435C2834187579efc303c760A  \
 --pair-name "./configs/pairs/pairs-dev-avalanche.json" \
 --network avalanche_fuji
 */


task(`pairManager-addPair`, "addPair()")
  .addParam('contractAddr', 'purse token  address', undefined, types.string, false)
  .addParam('pairName', 'pair name', undefined, types.inputFile, false)
  .setAction(async (taskArgs, {run, ethers, artifacts}) => {
      const {contractAddr, pairName } = taskArgs

      let configPath = path.join(__dirname, `../${pairName}`)
      const config = JSON.parse(fs.readFileSync(configPath).toString())
      // console.log(chalk.blue.bold(`pair config:`))
      console.log(config.pairs);

      let pairs = await Promise.all(
        config.pairs.map(async (pair: any) => {

            let chipInst = await ethers.getContractAt("TestERC20", pair['chipAddress'] ) as TestERC20

            let symbol

            try {
                symbol = await chipInst.symbol()
            }catch (e) {
                // console.error(chalk.red(`critical call symbol() for ${pair['chipAddress']} cause ${e}`))
                process.exit(1)
            }

            const _symbol = pair.pairName.split("/")[1]
            if(_symbol != symbol) {
                // console.error(chalk.red(`criticall ${_symbol} not match ${symbol}`))
                process.exit(1)
            }

            console.log(pair.pairName.toUpperCase());

            // return {
            //     pairName: ethers.utils.formatBytes32String(pair.pairName.toUpperCase()),
            //     chip: pair.chipAddress,
            //     status: 1,
            //     counter: 0
            // }

            return [
                ethers.utils.formatBytes32String(pair.pairName.toUpperCase()),
                pair.chipAddress,
                1,
                0
            ]
        })
      )

      console.log(JSON.stringify(pairs));

  })
