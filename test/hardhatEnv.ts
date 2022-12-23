import {ethers} from "hardhat";
import assert from "assert";

export async function getCurrentTime(): Promise<number> {
    let block_number = await ethers.provider.getBlockNumber()
    let {timestamp} = await ethers.provider.getBlock(block_number)
    return timestamp
}

export async function fastTimeAt(targetTimeAt: number): Promise<void> {
    assert(targetTimeAt > 0, '_target_time should > 0')
    await ethers.provider.send('evm_mine', [targetTimeAt])
}