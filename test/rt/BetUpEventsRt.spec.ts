import {
    test_deploy_betBetUpCore,
    test_deploy_betUpDaoToken,
    test_deploy_betUpEvents,
    test_deploy_betUpGuess,
    test_deploy_betUpSheep,
    test_deploy_pairManager,
    test_deploy_testErc20,
    test_grantContractRole_for_whole,
    test_setRelativeContract
} from "../deployer";
import {
    BetUpCore,
    BetUpDAOToken,
    BetUpEvents,
    BetUpGuess,
    BetUpSheep,
    PairManager,
    TestERC20
} from "../../typechain-types";
import {Signer} from "ethers";
import {ethers} from "hardhat";
import {fastTimeAt, getCurrentTime} from "../hardhatEnv";
import {beforeEach} from "mocha";
import {parseEther} from "ethers/lib/utils";
import {forkStackParam, getStackResult} from "../common";
import {expect} from "chai"



describe("BetUpEventsRt.spec.ts", function(){
    // contracts
    let testERC20: TestERC20;
    let pairManager: PairManager;
    let betUpDAOToken: BetUpDAOToken;
    let betUpSheep: BetUpSheep;
    let betUpCore: BetUpCore;
    let betUpGuess: BetUpGuess;
    let betUpEvents: BetUpEvents;

    // roles
    let defaultAdmin: Signer;
    let pairAdmin: Signer;
    let pairOpeningAdmin: Signer;
    let pairClosingAdmin1: Signer;
    let pairClosingAdmin2: Signer;
    let pairClosingAdmin3: Signer;

        // roles to betUpEvents
         let openingCoefficientAdmin: Signer;

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

        // @dev roles to betUpEvents
        openingCoefficientAdmin = signers[6]

        // @dev players
        p1 = signers[7];
        p2 = signers[8];
        p3 = signers[9];
    })

    beforeEach(async () => {
        testERC20 = await test_deploy_testErc20()
        pairManager = await test_deploy_pairManager()
        betUpDAOToken = await test_deploy_betUpDaoToken()
        betUpSheep = await test_deploy_betUpSheep(betUpDAOToken)
        betUpCore = await test_deploy_betBetUpCore()
        betUpGuess = await test_deploy_betUpGuess(betUpCore, betUpSheep, betUpDAOToken, pairManager)
        betUpEvents = await test_deploy_betUpEvents(betUpSheep, betUpCore, betUpDAOToken)
        await test_grantContractRole_for_whole(
            betUpDAOToken,
            betUpGuess,
            betUpEvents,
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
        let validChip = [testERC20.address]
        await betUpEvents.addChips(validChip)
    })

    beforeEach(async () => {
        await betUpEvents.grantRole(await betUpEvents.OPEN_COEFFICIENT(), await openingCoefficientAdmin.getAddress())
        await betUpEvents.connect(openingCoefficientAdmin).setOpenCoefficient(0);
    })

    beforeEach(async () => {
        await testERC20.mint(await p1.getAddress(), parseEther("100"))
        await testERC20.mint(await p2.getAddress(), parseEther("100"))
        await testERC20.mint(await p3.getAddress(), parseEther("100"))
    })

    beforeEach(async () => {
        await testERC20.connect(p1).approve(betUpEvents.address, ethers.constants.MaxUint256)
        await testERC20.connect(p2).approve(betUpEvents.address, ethers.constants.MaxUint256)
        await testERC20.connect(p3).approve(betUpEvents.address, ethers.constants.MaxUint256)
    })

    it('BetUpEventsRt', async () => {
        let _endStackAt = await getCurrentTime() + 10
        let _resolutionAt = _endStackAt + 3600
        let _chipID = 1
        let _optionsQty = 3
        let _resolvers = [await defaultAdmin.getAddress()]
        let details = '{"title":"2022 Football World Cup championship prediction.","detail":"detail...","icon":"http://xxxxxxx.com","type":"sports","sourceUrl":"http://xxxxxx.com","options":["Argentina","Croatia","Brazil"]}';

        // @dev open an event
        // 1 - y 2- n 3- draw
        await betUpEvents.open(
          _endStackAt,
          _resolutionAt,
          testERC20.address,
          _optionsQty,
          _resolvers,
          details,
          "abc"
        )

        // @dev stack to the event
        let pairID = "1"
        let stackParams1 = forkStackParam(pairID, "2", parseEther("20").toString())
        let stackParams2 = forkStackParam(pairID, "2", parseEther("30").toString())
        let stackParams3 = forkStackParam(pairID, "3", parseEther("1").toString())

        await betUpEvents.connect(p1).stack(stackParams1.pairID, stackParams1.resultID, stackParams1.amount)
        await betUpEvents.connect(p2).stack(stackParams2.pairID, stackParams2.resultID, stackParams2.amount)
        await betUpEvents.connect(p3).stack(stackParams3.pairID, stackParams3.resultID, stackParams3.amount)

        let stackResult1 = await getStackResult(stackParams1, p1, betUpEvents)
        let stackResult2 = await getStackResult(stackParams2, p2, betUpEvents)
        let stackResult3 = await getStackResult(stackParams3, p3, betUpEvents)
        expect(stackResult1.amount).equal(stackParams1.amount)
        expect(stackResult2.amount).equal(stackParams2.amount)
        expect(stackResult3.amount).equal(stackParams3.amount)

        // fast time to close the event
        let {resolutionAt} = await betUpEvents.pairs(pairID)
        await fastTimeAt(resolutionAt.toNumber() + 1)

        let resultID = 2
        await betUpEvents.close(pairID, resultID,false)

        let pair = await betUpEvents.innerPairs(pairID)
        expect(pair.resultID).equal(resultID)

        // claim
        await betUpEvents.connect(p2).claim(stackParams2.pairID, stackParams2.resultID, 0)
        let balance = await testERC20.balanceOf(await p2.getAddress())
        expect(balance).equal("100540000000000000000")

    });
})