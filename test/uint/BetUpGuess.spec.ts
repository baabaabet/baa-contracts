import {expect} from "chai";
import {
    BetUpCore,
    BetUpDAOToken, BetUpGuess,
    BetUpSheep,
    PairManager,
    TestERC20,
    TestERC20WithSixDecimal
} from "../../typechain-types";
import {Signer} from "ethers";
import {beforeEach} from "mocha";
import {ethers} from "hardhat";
import {
    test_deploy_betBetUpCore,
    test_deploy_betUpDaoToken, test_deploy_betUpEvents, test_deploy_betUpGuess, test_deploy_betUpSheep,
    test_deploy_pairManager,
    test_deploy_testErc20,
    test_deploy_testErc20WithSixDecimal, test_grantContractRole_for_whole, test_setRelativeContract
} from "../deployer";
import {parseEther} from "ethers/lib/utils";

describe("BetUpGuess.spec.ts", function() {
    // contracts
    let testERC20: TestERC20;
    let testERC20WithSixDecimal: TestERC20WithSixDecimal;
    let pairManager: PairManager;
    let betUpDAOToken: BetUpDAOToken;
    let betUpSheep: BetUpSheep;
    let betUpCore: BetUpCore;
    let betUpGuess: BetUpGuess;

    // roles
    let defaultAdmin: Signer;
    let pairAdmin: Signer;
    let pairOpeningAdmin: Signer;
    let pairClosingAdmin1: Signer;
    let pairClosingAdmin2: Signer;
    let pairClosingAdmin3: Signer;

    // players
    let p1: Signer;
    let p2: Signer;
    let p3: Signer;

    beforeEach(async () => {
        const signers = await ethers.getSigners()
        // @dev signers[0] is the default deployer to all contracts
        defaultAdmin = signers[0]
        pairAdmin = signers[1]
        pairOpeningAdmin = signers[2]
        pairClosingAdmin1 = signers[3]
        pairClosingAdmin2 = signers[4]
        pairClosingAdmin3 = signers[5]

        // @dev players
        p1 = signers[7];
        p2 = signers[8];
        p3 = signers[9];
    })

    beforeEach(async () => {
        testERC20 = await test_deploy_testErc20()
        testERC20WithSixDecimal = await test_deploy_testErc20WithSixDecimal()
        pairManager = await test_deploy_pairManager()
        betUpDAOToken = await test_deploy_betUpDaoToken()
        betUpSheep = await test_deploy_betUpSheep(betUpDAOToken)
        betUpCore = await test_deploy_betBetUpCore()
        betUpGuess = await test_deploy_betUpGuess(betUpCore, betUpSheep, betUpDAOToken, pairManager)
        await test_grantContractRole_for_whole(
            betUpDAOToken,
            betUpGuess,
            null,
            pairManager,
            pairAdmin,
            pairOpeningAdmin,
            pairClosingAdmin1,
            pairClosingAdmin2,
            pairClosingAdmin3,
            betUpCore,
            defaultAdmin
        )

        await test_setRelativeContract(betUpSheep, betUpCore)
    })

    beforeEach(async () => {
        await testERC20.mint(await p1.getAddress(), parseEther("10"))
        await testERC20.mint(await p2.getAddress(), parseEther("10"))
        await testERC20.mint(await p3.getAddress(), parseEther("10"))
        await testERC20.connect(p1).approve(betUpGuess.address, ethers.constants.MaxUint256)
        await testERC20.connect(p2).approve(betUpGuess.address, ethers.constants.MaxUint256)
        await testERC20.connect(p3).approve(betUpGuess.address, ethers.constants.MaxUint256)
    })

    beforeEach( async () => {
        let param = {
            level: 1,
            categoryAmount: 4,
            categoryItemsAmount: [5,5,3,14],
            rareLimitAmount:  [0,0,0,50]
        }
        await betUpSheep.setLevelConfig(
            param.level,
            param.categoryAmount,
            param.categoryItemsAmount,
            param.rareLimitAmount
        )
    })

    it('should delAdmin', async () => {
        pairManager = await test_deploy_pairManager()
        betUpGuess = await test_deploy_betUpGuess(betUpCore, betUpSheep, betUpDAOToken, pairManager)
        await pairManager.grantRole(await pairManager.OPEN_MANAGER(), await pairOpeningAdmin.getAddress())
        await betUpGuess.grantRole(await betUpGuess.FEE_MANAGER(), await defaultAdmin.getAddress())
        await pairManager.grantRole(await pairManager.PAIR_MANAGER(), await defaultAdmin.getAddress())
        let hasRole = await pairManager.hasRole(await pairManager.OPEN_MANAGER(), await pairOpeningAdmin.getAddress())
        expect(hasRole).to.be.true
        hasRole = await betUpGuess.hasRole(await betUpGuess.FEE_MANAGER(), await defaultAdmin.getAddress())
        expect(hasRole).to.be.true
        hasRole = await pairManager.hasRole(await pairManager.PAIR_MANAGER(), await defaultAdmin.getAddress())
        expect(hasRole).to.be.true

        let openManagersAmount = await pairManager.closeManagers()
        expect(openManagersAmount).to.be.equal("3")

        await pairManager.revokeRole(await pairManager.OPEN_MANAGER(), await pairOpeningAdmin.getAddress())
        hasRole = await pairManager.hasRole(await pairManager.OPEN_MANAGER(), await pairOpeningAdmin.getAddress())
        expect(hasRole).to.be.false

        await betUpGuess.revokeRole(await betUpGuess.FEE_MANAGER(), await defaultAdmin.getAddress())
        hasRole = await betUpGuess.hasRole(await betUpGuess.FEE_MANAGER(), await defaultAdmin.getAddress())
        expect(hasRole).to.be.false

        await pairManager.revokeRole(await pairManager.PAIR_MANAGER(), await defaultAdmin.getAddress())
        hasRole = await pairManager.hasRole(await pairManager.PAIR_MANAGER(), await defaultAdmin.getAddress())
        expect(hasRole).to.be.false

        openManagersAmount = await pairManager.closeManagers()
        expect(openManagersAmount).to.be.equal("3")
    });
})