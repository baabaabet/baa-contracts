import {ethers} from "hardhat";
import {
    BetUpCore,
    BetUpDAOToken, BetUpEvents,
    BetUpGuess,
    BetUpSheep, FreeMintOfSheep, MERC1967Proxy,
    PairManager,
    TestERC20, TestERC20WithSixDecimal
} from "../typechain-types";
import {BigNumber, Signer} from "ethers";

export async function test_deploy_proxy(logic: string, data: string = "0x"): Promise<MERC1967Proxy> {
    let _logic = await ethers.getContractFactory("MERC1967Proxy")
    return await _logic.deploy(logic, data) as MERC1967Proxy
}

export async function test_deploy_contract_with_proxy<T>(name: string): Promise<T> {
    let logicF = await ethers.getContractFactory(name)
    let logic = await logicF.deploy()

    let proxy = await test_deploy_proxy(logic.address)
    return await ethers.getContractAt(name, proxy.address) as T
}

export async function test_deploy_testErc20(): Promise<TestERC20> {
    let logic = await ethers.getContractFactory("TestERC20")
    return await logic.deploy("USDT", "USDT") as TestERC20;
}

export async function test_deploy_testErc20WithSixDecimal(): Promise<TestERC20WithSixDecimal> {
    let logic = await ethers.getContractFactory("TestERC20WithSixDecimal")
    return await logic.deploy("USDT", "USDT") as TestERC20WithSixDecimal;
}

export async function test_deploy_pairManager(): Promise<PairManager> {
    let instance = await test_deploy_contract_with_proxy<PairManager>("PairManager")
    await instance.initialize();
    return instance;
}

export async function test_deploy_betUpDaoToken(): Promise<BetUpDAOToken> {
    let instance = await test_deploy_contract_with_proxy<BetUpDAOToken>("BetUpDAOToken")
    await instance.initialize();
    return instance;
}

export async function test_deploy_betUpSheep(
  betUpDaoToken: BetUpDAOToken,
  betUpCore: BetUpCore
): Promise<BetUpSheep> {
    let instance = await test_deploy_contract_with_proxy<BetUpSheep>("BetUpSheep")
    await instance.initialize(
      betUpDaoToken.address,
      betUpCore.address,
      process.env.LOCAL_MINT_LIMIT,
      process.env.LOCAL_BASE_URL
    );
    return instance;
}

export async function test_deploy_betBetUpCore( betUpDaoToken: BetUpDAOToken): Promise<BetUpCore> {
    let instance = await test_deploy_contract_with_proxy<BetUpCore>("BetUpCore")
    // let arr = process.env.LOCAL_REWARDD_COEFFICIENT.split(",").map(v => BigNumber.from(v))
    await instance.initialize(betUpDaoToken.address, process.env.LOCAL_REWARDD_COEFFICIENT.split(","));

    return instance;
}

export async function test_deploy_betUpGuess(
  betUpCore: BetUpCore,
  betUpSheep: BetUpSheep,
  betUpDaoToken: BetUpDAOToken,
  pairManager: PairManager,

): Promise<BetUpGuess>{
    let instance = await test_deploy_contract_with_proxy<BetUpGuess>("BetUpGuess")
    await instance.initialize(
      betUpCore.address,
      betUpSheep.address,
      betUpDaoToken.address,
      pairManager.address
    );
    return instance;
}

export async function test_deploy_betUpEvents(
  betUpSheep: BetUpSheep,
  betUpCore: BetUpCore,
  betUpDaoToken: BetUpDAOToken
): Promise<BetUpEvents> {
    let instance = await test_deploy_contract_with_proxy<BetUpEvents>("BetUpEvents")
    await instance.initialize(
      betUpSheep.address,
      betUpCore.address,
      betUpDaoToken.address,
    );
    return instance;
}

export async function test_grantContractRole_for_whole(
  betUpDaoToken: BetUpDAOToken,
  betUpGuess: BetUpGuess,
  betUpEvents: BetUpEvents | null,
  pairManager: PairManager,
  betUpSheep: BetUpSheep,
  pairAdmin: Signer,
  pairOpeningAdmin: Signer,
  pairClosingAdmin1: Signer,
  pairClosingAdmin2: Signer,
  pairClosingAdmin3: Signer,
  betUpCore: BetUpCore,
  defaultAdmin: Signer
) {
    // add dao token's MINT_MANAGER
    await betUpDaoToken.grantRole(await betUpDaoToken.MINT_MANAGER(), betUpGuess.address)
    betUpEvents && await betUpDaoToken.grantRole(await betUpDaoToken.MINT_MANAGER(), betUpEvents.address)

    // add a pairManager's PAIR_MANAGER
    await pairManager.grantRole(await pairManager.PAIR_MANAGER(), await pairAdmin.getAddress())

    // add a pairManager's OPEN_MANAGER
    await pairManager.grantRole(await pairManager.OPEN_MANAGER(), await pairOpeningAdmin.getAddress())

    // add one pairManager's CLOSE_MANAGERs
    // await pairManager.grantRole(await pairManager.CLOSE_MANAGER(), await pairClosingAdmin1.getAddress())
    // await pairManager.grantRole(await pairManager.CLOSE_MANAGER(), await pairClosingAdmin2.getAddress())
    // await pairManager.grantRole(await pairManager.CLOSE_MANAGER(), await pairClosingAdmin3.getAddress())

    // add pairManager's PAIRCR_MANAGER_ROLE
    await pairManager.grantRole(await pairManager.PAIRCR_MANAGER(), betUpGuess.address)

    // add betUpCore's RECORD_MANAGER
    betUpEvents && await betUpCore.grantRole(await betUpCore.RECORD_MANAGER(), betUpEvents.address)
    await betUpCore.grantRole(await betUpCore.RECORD_MANAGER(), betUpSheep.address)
    await betUpCore.grantRole(await betUpCore.RECORD_MANAGER(), betUpGuess.address)

    // add betUpEvent's
    betUpEvents && await betUpEvents.grantRole(await betUpEvents.GOVERNANCE_ROLE(), await defaultAdmin.getAddress())


    //
    await betUpCore.grantRole(await betUpCore.PARAMS_MANAGER(), await defaultAdmin.getAddress())
    let index = [1,2,3,4,5,6,7,8,9,10]
    let condition =  [[30,0],[45,11000],[68,23000],[102,44000],[153,82000],[230,150000],[345,420000],[518,760000],[777,1370000],[1166,2500000]]
    let _condition2 = []
    condition.forEach(value => {
        _condition2.push(
          {
              count: value[0],
              amount: value[1]
          }
        )
    })
    await betUpCore.setUpgradeConditionToLevel(index, _condition2)

    let index2 = [1,2,3,4,5,6,7,8,9,10]
    let condition2 =  [[30,2000],[15,1000],[15,1000],[15,1000],[15,1000],[15,1000],[15,1000],[15,1000],[15,1000],[15,1000]]

    let _condition = []
    condition2.forEach(value => {
        _condition.push(
          {
              count: value[0],
              amount: value[1]
          }
        )
    })
    await betUpCore.setMintCondition(index2, _condition as any)

    await betUpSheep.setLevelConfig(
      levelConfig["level-1"].level,
      levelConfig["level-1"].categoryAmount,
      levelConfig["level-1"].categoryItemsAmount,
      levelConfig["level-1"].rareLimitAmount,
    )

    await betUpSheep.setLevelConfig(
      levelConfig["level-2"].level,
      levelConfig["level-2"].categoryAmount,
      levelConfig["level-2"].categoryItemsAmount,
      levelConfig["level-2"].rareLimitAmount,
    )

    await betUpSheep.setLevelConfig(
      levelConfig["level-3"].level,
      levelConfig["level-3"].categoryAmount,
      levelConfig["level-3"].categoryItemsAmount,
      levelConfig["level-3"].rareLimitAmount,
    )

    await betUpSheep.setLevelConfig(
      levelConfig["level-4"].level,
      levelConfig["level-4"].categoryAmount,
      levelConfig["level-4"].categoryItemsAmount,
      levelConfig["level-4"].rareLimitAmount,
    )

    await betUpSheep.setLevelConfig(
      levelConfig["level-5"].level,
      levelConfig["level-5"].categoryAmount,
      levelConfig["level-5"].categoryItemsAmount,
      levelConfig["level-5"].rareLimitAmount,
    )

}


let levelConfig = {
    "level-1": {
        "level": 1,
        "categoryAmount": 4,
        "categoryItemsAmount": [5,5,3,14],
        "rareLimitAmount":  [0,0,0,180]
    },
    "level-2": {
        "level": 2,
        "categoryAmount": 5,
        "categoryItemsAmount": [5,5,3,11,11],
        "rareLimitAmount":  [0,0,0,180,180]
    },
    "level-3": {
        "level": 3,
        "categoryAmount": 6,
        "categoryItemsAmount": [5,5,3,10,10,10],
        "rareLimitAmount":  [0,0,0,50,180,180]
    },
    "level-4": {
        "level": 4,
        "categoryAmount": 7,
        "categoryItemsAmount": [5,5,3,9,9,9,9],
        "rareLimitAmount":  [0,0,0,180,180,180,180]
    },
    "level-5": {
        "level": 5,
        "categoryAmount": 8,
        "categoryItemsAmount": [5,5,3,8,8,8,8,8],
        "rareLimitAmount":  [0,0,0,180,180,180,180,180]
    }
}

export async function setCoreConfig(
  betUpCore: BetUpCore,
  defaultAdmin: Signer
) {
    await betUpCore.grantRole(await betUpCore.PARAMS_MANAGER(), await defaultAdmin.getAddress())
    let index = [1,2,3,4,5,6,7,8,9,10]
    let condition =  [[30,0],[45,11000],[68,23000],[102,44000],[153,82000],[230,150000],[345,420000],[518,760000],[777,1370000],[1166,2500000]]
    let _condition2 = []
    condition.forEach(value => {
        _condition2.push(
          {
              count: value[0],
              amount: value[1]
          }
        )
    })
    await betUpCore.setUpgradeConditionToLevel(index, _condition2)

    let index2 = [1,2,3,4,5,6,7,8,9,10]
    let condition2 =  [[30,2000],[15,1000],[15,1000],[15,1000],[15,1000],[15,1000],[15,1000],[15,1000],[15,1000],[15,1000]]

    let _condition = []
    condition2.forEach(value => {
        _condition.push(
          {
              count: value[0],
              amount: value[1]
          }
        )
    })
    await betUpCore.setMintCondition(index2, _condition as any)
}