import {ethers} from "hardhat"
import {BigNumber} from "ethers";

class CallCommandParamsType {
    struct: string
    value?: Array<any>
    to: string

    constructor( struct: string,  to: string, value?: Array<any>) {
        this.struct = struct
        this.to = to
        this.value = value
    }
}

async function callCommand(params: CallCommandParamsType) {
    let reg = /^([A-Za-z]+)\((.*)\)\((.*)\)$/
    reg.exec(params.struct)
    let functionName = RegExp.$1.trim()
    let functionParams = RegExp.$2.trim()
    let functionRes = RegExp.$3.trim()

    // get function selector
    let selector = ethers.utils.id(`${functionName}(${functionParams})`).substring(0,10)
    // console.log("selector", selector);

    // get call data
    let functionParamsArr = functionParams.split(",")
    let calldata;
    if(!params.value) {
        calldata = selector
    }else {
        calldata = ethers.utils.hexConcat([
            selector,
            ethers.utils.defaultAbiCoder.encode(functionParamsArr, params.value)
        ])
    }
    // console.log("calldata", calldata)

    // send static call
    let callResultData = await ethers.provider.call(
      {
          to: params.to,
          data: calldata
      }
    )
    // console.log("callResultData", callResultData);

    // decode call result data
    return ethers.utils.defaultAbiCoder.decode(
      functionRes.split(","),
      callResultData
    )
}


async function main() {
    // testnet
    // let contractAddress = "0xB7991c58016bE7d45bA249074A3D7EdC8c685F61"
    // mainnet
    let contractAddress = "0x09B9FDaE3000bC5AEbAaD4b5619f0D4E14293856"

    let pairIDCounter = await callCommand(new CallCommandParamsType('pairIDCounter()(uint256)', contractAddress))
    console.log('pairIDCounter::',pairIDCounter);

    let vaultAmount: BigNumber = BigNumber.from("0");

    for(let i = 1; i < pairIDCounter; i++) {
        let pairID = i
        let innerPairs = await callCommand(new CallCommandParamsType(
          "innerPairs(uint256)(uint256,uint64,uint64,uint16,uint24)",
          contractAddress,
          [pairID],
        ))

        let total = innerPairs[0]
        let resultID = innerPairs[3]
        let optionsVolume;

        if(resultID > 0) {
            optionsVolume = await callCommand(new CallCommandParamsType(
              "optionsVolume(bytes32)(uint256,uint256)",
              contractAddress,
            [ethers.utils.solidityKeccak256(["uint256", "uint16"], [pairID, resultID])]
            ))

            let subAmount = total.sub(optionsVolume[0])
            let _vaultAmount = subAmount.mul(ethers.BigNumber.from(10)).div(ethers.BigNumber.from(100))
            vaultAmount = vaultAmount.add(_vaultAmount)
            console.log(`pairID ${i}::total is ${total}:: resultID is ${resultID}:: optionsVolume is ${optionsVolume[0]} :: vault amount is ${_vaultAmount} :: total vaultAmount is :: ${vaultAmount}`);
        }

    }


}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error)
        process.exit(1)
    })