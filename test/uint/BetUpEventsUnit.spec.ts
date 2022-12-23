import {
    test_deploy_betBetUpCore,
    test_deploy_betUpDaoToken,
    test_deploy_betUpEvents,
    test_deploy_betUpGuess,
    test_deploy_betUpSheep,
    test_deploy_pairManager,
    test_deploy_testErc20, test_deploy_testErc20WithSixDecimal,
    test_grantContractRole_for_whole,
} from "../deployer";
import {
    BetUpCore,
    BetUpDAOToken,
    BetUpEvents,
    BetUpGuess,
    BetUpSheep,
    PairManager,
    TestERC20, TestERC20WithSixDecimal
} from "../../typechain-types";
import {BigNumber, Signer} from "ethers";
import {ethers} from "hardhat";
import {beforeEach} from "mocha";
import {parseEther, parseUnits} from "ethers/lib/utils";
import {
    calcAvailableAmount,
    calcProfit,
    expectCheckClosedStatus,
    forkOpeningParams,
    getOptionVolumeID,
    getPairResolveID,
    getPlayerID,
    getResultCounterID
} from "../common";
import {expect} from "chai";
import {fastTimeAt, getCurrentTime} from "../hardhatEnv";


describe("BetUpEventsUnit.spec.ts", function(){
    // contracts
    let testERC20: TestERC20;
    let testERC20WithSixDecimal: TestERC20WithSixDecimal;
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
        testERC20WithSixDecimal = await test_deploy_testErc20WithSixDecimal()
        pairManager = await test_deploy_pairManager()
        betUpDAOToken = await test_deploy_betUpDaoToken()
        betUpCore = await test_deploy_betBetUpCore(betUpDAOToken)
        betUpSheep = await test_deploy_betUpSheep(betUpDAOToken, betUpCore)
        betUpGuess = await test_deploy_betUpGuess(betUpCore, betUpSheep, betUpDAOToken, pairManager)
        betUpEvents = await test_deploy_betUpEvents(betUpSheep, betUpCore, betUpDAOToken)
        await test_grantContractRole_for_whole(
          betUpDAOToken,
          betUpGuess,
          betUpEvents,
          pairManager,
          betUpSheep,
          pairAdmin,
          pairOpeningAdmin,
          pairClosingAdmin1,
          pairClosingAdmin2,
          pairClosingAdmin3,
          betUpCore,
          defaultAdmin
        )

        // await test_setRelativeContract(betUpSheep, betUpCore)
    })

    beforeEach(async () => {
        let validChip = [testERC20.address]
        await betUpEvents.addChips(validChip)
    })

    beforeEach(async () => {
        await betUpEvents.grantRole(await betUpEvents.OPEN_COEFFICIENT(), await openingCoefficientAdmin.getAddress())
        await betUpEvents.grantRole(await betUpEvents.OPEN_ROLE(), await defaultAdmin.getAddress())
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

    it('testFailed:: open :: with insufficient balance of dao token ', async () => {
        let resolvers = [await defaultAdmin.getAddress()]
        let openingParam = await forkOpeningParams(resolvers, testERC20)
        await expect(
            betUpEvents.connect(p1).open(
            openingParam._endStackAt,
            openingParam._resolutionAt,
            openingParam._chip,
            openingParam._optionsQty,
            openingParam._resolvers,
            openingParam.details,
            openingParam.type
          )
        ).revertedWith("ERC20: insufficient allowance")
    });

    it('testFailed:: open :: invalid _optionsQty ', async () => {
        let resolvers = [ethers.constants.AddressZero]
        let openingParam = await forkOpeningParams(resolvers, testERC20, 1)
        await expect( betUpEvents.open(
          openingParam._endStackAt,
          openingParam._resolutionAt,
          openingParam._chip,
          openingParam._optionsQty,
          openingParam._resolvers,
          openingParam.details,
          openingParam.type
        )).revertedWith('invalid _optionsQty')
    });

    it('testFailed:: open :: "invalid time" for _endStackAt > block.timestamp', async () => {
        let resolvers = [ethers.constants.AddressZero]
        let openingParam = await forkOpeningParams(resolvers, testERC20, 3, 10)
        await expect( betUpEvents.open(
          openingParam._endStackAt,
          openingParam._resolutionAt,
          openingParam._chip,
          openingParam._optionsQty,
          openingParam._resolvers,
          openingParam.details,
          openingParam.type
        )).revertedWith('invalid time')
    });

    it('testFailed:: open :: "invalid time" for _resolutionAt > _endStackAt', async () => {
        let resolvers = [ethers.constants.AddressZero]
        let openingParam = await forkOpeningParams(resolvers, testERC20,3, 0, 10)
        await expect( betUpEvents.open(
          openingParam._endStackAt,
          openingParam._resolutionAt,
          openingParam._chip,
          openingParam._optionsQty,
          openingParam._resolvers,
          openingParam.details,
          openingParam.type
        )).revertedWith('invalid time')
    })

    it('testFailed:: open :: "invalid _resolvers" ', async () => {
        let openingParam = await forkOpeningParams([], testERC20)
        await expect( betUpEvents.open(
          openingParam._endStackAt,
          openingParam._resolutionAt,
          openingParam._chip,
          openingParam._optionsQty,
          openingParam._resolvers,
          openingParam.details,
          openingParam.type
        )).revertedWith('invalid _resolvers')

        await expect( betUpEvents.open(
          openingParam._endStackAt,
          openingParam._resolutionAt,
          openingParam._chip,
          openingParam._optionsQty,
          [await defaultAdmin.getAddress(), await defaultAdmin.getAddress()],
          openingParam.details,
          openingParam.type
        )).revertedWith('invalid _resolvers')
    })

    it('testFailed:: open :: "invalid _chip" ', async () => {
        let resolvers = [await defaultAdmin.getAddress()]
        let updateChip = await test_deploy_testErc20()
        let openingParam = await forkOpeningParams(resolvers, updateChip,3,0,0)
        await expect(
          betUpEvents.open(
            openingParam._endStackAt,
            openingParam._resolutionAt,
            openingParam._chip,
            openingParam._optionsQty,
            openingParam._resolvers,
            openingParam.details,
            openingParam.type
          )
        ).revertedWith("invalid _chip")
    })

    it('testFailed:: open :: invalid resolvers when give address(0) ', async () => {
        let revolvers = [ethers.constants.AddressZero]
        let openingParam = await forkOpeningParams(revolvers, testERC20)
        await expect(betUpEvents.open(
          openingParam._endStackAt,
          openingParam._resolutionAt,
          openingParam._chip,
          openingParam._optionsQty,
          openingParam._resolvers,
          openingParam.details,
          openingParam.type
        )).revertedWithCustomError(betUpEvents, "InvalidResolver")
    });

    it('testFailed:: open :: invalid resolvers when give same address ', async () => {
        let revolvers = [await defaultAdmin.getAddress(), await defaultAdmin.getAddress(), await p1.getAddress()]
        let openingParams = await forkOpeningParams(revolvers, testERC20)
        await expect( betUpEvents.open(
          openingParams._endStackAt,
          openingParams._resolutionAt,
          openingParams._chip,
          openingParams._optionsQty,
          openingParams._resolvers,
          openingParams.details,
          openingParams.type
        )).revertedWithCustomError(betUpEvents, "InvalidResolver")
    });

    it('test:: open :: should open successfully', async () => {
        let resolvers = [await defaultAdmin.getAddress()]
        let openingParam = await forkOpeningParams(resolvers, testERC20)

        let startAt = await getCurrentTime()

        await expect(betUpEvents.open(
          openingParam._endStackAt,
          openingParam._resolutionAt,
          openingParam._chip,
          openingParam._optionsQty,
          openingParam._resolvers,
          openingParam.details,
          openingParam.type
        )).emit(betUpEvents, "CreateEventEvent")

        let pairIDCounter = await betUpEvents.pairIDCounter()
        expect(pairIDCounter).equal(2)

        let pairID = 1
        let pairCtx = await betUpEvents.pairs(pairID)
        expect(pairCtx).deep.equal([
            BigNumber.from(openingParam._resolutionAt),
            await defaultAdmin.getAddress(),
            openingParam._resolvers.length,
             BigNumber.from(openingParam._endStackAt),
             openingParam._chip,
             openingParam._optionsQty,
             await betUpEvents.createRewardsRatio(),
             false,
             false,
             false,
        ])
        let innerPairCtx = await betUpEvents.innerPairs(pairID)
        expect(innerPairCtx).deep.equal([
            BigNumber.from(0),
            BigNumber.from(startAt+1),
            await betUpEvents.resolveDeadlineSecond() + openingParam._resolutionAt,
            0,
            0
        ])


        let resolverID = getPairResolveID(pairID, openingParam._resolvers[0])
        let resolverCtx = await betUpEvents.pairsResolver(resolverID)
        expect(resolverCtx).deep.equal([true, false, 0])

    });

    it('testFailed:: close :: non-existent pairID', async () => {
        let noExistentPairID = 1
        await expect(betUpEvents.close(noExistentPairID, 1, false ))
          .revertedWith('invalid _resultID')
    });

    it('testFailed :: close :: unauthorized for invalid resolver', async () => {
        let resolver = [await defaultAdmin.getAddress()]
        let openingParam = await forkOpeningParams(resolver, testERC20)
        await betUpEvents.open(
          openingParam._endStackAt,
          openingParam._resolutionAt,
          openingParam._chip,
          openingParam._optionsQty,
          openingParam._resolvers,
          openingParam.details,
          openingParam.type
        )

        let pairID = 1
        await expect( betUpEvents.connect(p1)
          .close(pairID, 1, false))
          .revertedWith('unauthorized')

    });

    it('testFailed :: close :: "resolved already"', async () => {
        let resolver = [await defaultAdmin.getAddress()]
        let openingParam = await forkOpeningParams(resolver, testERC20)
        await betUpEvents.open(
          openingParam._endStackAt,
          openingParam._resolutionAt,
          openingParam._chip,
          openingParam._optionsQty,
          openingParam._resolvers,
          openingParam.details,
          openingParam.type
        )

        await fastTimeAt(openingParam._resolutionAt+1)

        let pairID = 1
        let resultID = 1
        await betUpEvents.connect(defaultAdmin).close(pairID, 1, false)

        let resultCounterID = getResultCounterID(pairID, resultID)
        let resultCounter = await betUpEvents.resultCounter(resultCounterID)
        expect(resultCounter).equal(1)

        let pair = await betUpEvents.innerPairs(pairID)
        expect(pair.resultID).equal(1)

        await expect(betUpEvents.connect(defaultAdmin)
          .close(pairID,1, false))
          .revertedWith('resolved already')
    });

    it('testFailed:: close :: "invalid _resultID" when set no-existent resultID ', async () => {
        let resolver = [await defaultAdmin.getAddress()]
        let openingParam = await forkOpeningParams(resolver, testERC20)
        await betUpEvents.open(
          openingParam._endStackAt,
          openingParam._resolutionAt,
          openingParam._chip,
          openingParam._optionsQty,
          openingParam._resolvers,
          openingParam.details,
          openingParam.type
        )

        await fastTimeAt(openingParam._resolutionAt+1)

        let pairID = 1
        let InvalidResultID = 4
        await expect( betUpEvents.connect(defaultAdmin).close(pairID, InvalidResultID, false))
          .revertedWith("invalid _resultID")

        InvalidResultID = 0
        await expect( betUpEvents.connect(defaultAdmin).close(pairID, InvalidResultID, false))
          .revertedWith("invalid _resultID")
    });

    it('testFailed:: close ::  outdated at the time which before pair\'s resolutionAt', async () => {
        let resolver = [await defaultAdmin.getAddress()]
        let openingParam = await forkOpeningParams(resolver, testERC20)
        await betUpEvents.open(
          openingParam._endStackAt,
          openingParam._resolutionAt,
          openingParam._chip,
          openingParam._optionsQty,
          openingParam._resolvers,
          openingParam.details,
          openingParam.type
        )

        let pairID = 1
        let resultID = 1
        await expect(betUpEvents.close(pairID, resultID, false))
          .revertedWith("outdated")
    });

    it('testFailed:: close :: outdated at the time which after pair\'s resolutionAt + resolveDeadlineSecond', async () => {
        let resolver = [await defaultAdmin.getAddress()]
        let openingParam = await forkOpeningParams(resolver, testERC20)
        await betUpEvents.open(
          openingParam._endStackAt,
          openingParam._resolutionAt,
          openingParam._chip,
          openingParam._optionsQty,
          openingParam._resolvers,
          openingParam.details,
          openingParam.type
        )

        let resolveDeadlineSecond = (await betUpEvents.resolveDeadlineSecond())
        await fastTimeAt(openingParam._resolutionAt + resolveDeadlineSecond + 1)
        let pairID = 1
        let resultID = 1

        await expect(betUpEvents.close(pairID, resultID, false))
          .revertedWith("outdated")

    });

    it('test:: close :: successfully with one resolver', async () => {
        let resolver = [await defaultAdmin.getAddress()]
        let openingParam = await forkOpeningParams(resolver, testERC20)
        await betUpEvents.open(
          openingParam._endStackAt,
          openingParam._resolutionAt,
          openingParam._chip,
          openingParam._optionsQty,
          openingParam._resolvers,
          openingParam.details,
          openingParam.type
        )

        await fastTimeAt(openingParam._resolutionAt+1)
        let pairID = 1
        let resultID = 2
        await betUpEvents.close(pairID, resultID, false)

        let pair = await betUpEvents.innerPairs(pairID)
        expect(pair.resultID).equal(resultID)

        let pairResolverID = getPairResolveID(pairID, await defaultAdmin.getAddress())
        let pairResolver = await betUpEvents.pairsResolver(pairResolverID)
        expect(pairResolver).deep.equal([
            true,
            false,
            resultID
        ])

        let resultCounterID = getResultCounterID(pairID, resultID)
        let resultCounter = await betUpEvents.resultCounter(resultCounterID)
        expect(resultCounter).equal(1)
    });

    it('test:: close :: successfully with 3 resolver', async () => {
        let resolvers = [
            await pairClosingAdmin1.getAddress(),
            await pairClosingAdmin2.getAddress(),
            await pairClosingAdmin3.getAddress()
        ]

        let openingParam = await forkOpeningParams(resolvers, testERC20)
        await betUpEvents.open(
          openingParam._endStackAt,
          openingParam._resolutionAt,
          openingParam._chip,
          openingParam._optionsQty,
          openingParam._resolvers,
          openingParam.details,
          openingParam.type,
        )

        await fastTimeAt(openingParam._resolutionAt)

        let pairID = 1
        let resultID = 1

        let pair = await betUpEvents.pairs(pairID)
        let innerPair = await betUpEvents.innerPairs(pairID)
        expect(pair.resolverQty).equal(openingParam._resolvers.length)
        expect(innerPair.resultID).equal(0)

        await betUpEvents.connect(pairClosingAdmin1).close(pairID, resultID, false)
        await expectCheckClosedStatus(
          betUpEvents,
          pairID,
          resultID,
          pairClosingAdmin1,
          {
              pairResultID: 0,
              resultCount: 1,
              pairResolver: [true,false,resultID]
          }
        )

        await betUpEvents.connect(pairClosingAdmin2).close(pairID, resultID, false)
        await expectCheckClosedStatus(
          betUpEvents,
          pairID,
          resultID,
          pairClosingAdmin2,
          {
              pairResultID: resultID,
              resultCount: 2,
              pairResolver: [true, false, resultID]
          }
        )

        await expect(betUpEvents.connect(pairClosingAdmin3).close(pairID,resultID, false))
          .revertedWith("pair resolved")


    });

    it('test:: close :: tow resolver submitted same resultID and the other one submitted different resultID', async () => {
        let resolvers = [
            await pairClosingAdmin1.getAddress(),
            await pairClosingAdmin2.getAddress(),
            await pairClosingAdmin3.getAddress()
        ]

        let openingParam = await forkOpeningParams(resolvers, testERC20)

        await betUpEvents.open(
          openingParam._endStackAt,
          openingParam._resolutionAt,
          openingParam._chip,
          openingParam._optionsQty,
          openingParam._resolvers,
          openingParam.details,
          openingParam.type,
        )

        await fastTimeAt(openingParam._resolutionAt)


        let pairID = 1
        let resultIDS = [1,2,1]

        await betUpEvents.connect(pairClosingAdmin1).close(pairID, resultIDS[0], false)
        await expectCheckClosedStatus(
          betUpEvents,
          pairID,
          resultIDS[0],
          pairClosingAdmin1,
          {
              pairResultID: 0,
              resultCount: 1,
              pairResolver: [true, false, resultIDS[0]]
          }
        )

        await betUpEvents.connect(pairClosingAdmin2).close(pairID,resultIDS[1], false)
        await expectCheckClosedStatus(
          betUpEvents,
          pairID,
          resultIDS[1],
          pairClosingAdmin2,
          {
              pairResultID: 0,
              resultCount: 1,
              pairResolver: [true, false, resultIDS[1]]
          }
        )

        await betUpEvents.connect(pairClosingAdmin3).close(pairID, resultIDS[2], false)
        await expectCheckClosedStatus(
          betUpEvents,
          pairID,
          resultIDS[2],
          pairClosingAdmin3,
          {
              pairResultID: resultIDS[2],
              resultCount: 2,
              pairResolver: [true, false, resultIDS[2]]
          }
        )

    });

    it('testFailed:: close :: all resolvers submitted different resultID ', async () => {
        let resolvers = [
            await pairClosingAdmin1.getAddress(),
            await pairClosingAdmin2.getAddress(),
            await pairClosingAdmin3.getAddress()
        ]

        let openingParam = await forkOpeningParams(resolvers, testERC20)

        await betUpEvents.open(
            openingParam._endStackAt,
            openingParam._resolutionAt,
            openingParam._chip,
            openingParam._optionsQty,
            openingParam._resolvers,
            openingParam.details,
            openingParam.type,
        )

        await fastTimeAt(openingParam._resolutionAt)

        let pairID = 1
        let results = [1,2,3]

        await betUpEvents.connect(pairClosingAdmin1).close(pairID, results[0], false)
        await expectCheckClosedStatus(
          betUpEvents,
          pairID,
          results[0],
          pairClosingAdmin1,
          {
              pairResultID: 0,
              resultCount: 1,
              pairResolver: [true, false, results[0]]
          }
        )

        await betUpEvents.connect(pairClosingAdmin2).close(pairID, results[1], false)
        await expectCheckClosedStatus(
          betUpEvents,
          pairID,
          results[1],
          pairClosingAdmin2,
          {
              pairResultID: 0,
              resultCount: 1,
              pairResolver: [true,false,results[1]]
          }
        )

        await betUpEvents.connect(pairClosingAdmin3).close(pairID, results[2], false)
        await expectCheckClosedStatus(
          betUpEvents,
          pairID,
          results[2],
          pairClosingAdmin3,
          {
              pairResultID: 0,
              resultCount: 1,
              pairResolver: [true, false, results[2]]
          }
        )

    });

    it('testFailed:: stack :: an un-existent pair ', async () => {
        let unExistentPairID = 100;
        await expect(betUpEvents.connect(p1).stack(unExistentPairID, 1, parseEther("10")))
          .revertedWithCustomError(betUpEvents, "InvalidPairID")

    });

    it('testFailed:: stack:: pair has arrived at closing endStackAt', async() => {
        let resolver = [await defaultAdmin.getAddress()]
        let openingParam = await forkOpeningParams(resolver, testERC20)
        await betUpEvents.open(
          openingParam._endStackAt,
          openingParam._resolutionAt,
          openingParam._chip,
          openingParam._optionsQty,
          openingParam._resolvers,
          openingParam.details,
          openingParam.type,
        )

        await fastTimeAt(openingParam._endStackAt + 1)

        let pairID = 1
        let resultID = 1
        let stackAmount = parseEther("10")
        await expect(betUpEvents.connect(p1).stack(pairID, resultID, stackAmount))
          .revertedWith("Invalid stack time")

    });

    it('testFailed:: stack :: stack with un-existent resultID', async() => {
        let resolver = [await defaultAdmin.getAddress()]
        let openingParam = await forkOpeningParams(resolver, testERC20)
        await betUpEvents.open(
          openingParam._endStackAt,
          openingParam._resolutionAt,
          openingParam._chip,
          openingParam._optionsQty,
          openingParam._resolvers,
          openingParam.details,
          openingParam.type,
        )

        let pairID = 1
        let unExistentResultID = 4
        let amount = parseEther("10")
        await expect(betUpEvents.connect(p1).stack(pairID, unExistentResultID, amount))
          .revertedWithCustomError(betUpEvents, 'InvalidResultID')

        unExistentResultID = 0
        await expect(betUpEvents.connect(p1).stack(pairID, unExistentResultID, amount))
          .revertedWithCustomError(betUpEvents, 'InvalidResultID')

    });

    it('testFailed:: stack:: stack with zero amount', async () => {
        let resolver = [await defaultAdmin.getAddress()]
        let openingParam = await forkOpeningParams(resolver, testERC20)
        await betUpEvents.open(
          openingParam._endStackAt,
          openingParam._resolutionAt,
          openingParam._chip,
          openingParam._optionsQty,
          openingParam._resolvers,
          openingParam.details,
          openingParam.type,
        )

        let pairID = 1
        let resultID = 1
        let invalidAmount = 0
        await expect( betUpEvents.connect(p1).stack(pairID, resultID, invalidAmount))
          .revertedWithCustomError(betUpEvents, 'InvalidAmount')
    });

    it('test:: stack:: stack one side ', async () => {
        let resolver = [await defaultAdmin.getAddress()]
        let openingParam = await forkOpeningParams(resolver, testERC20)
        await betUpEvents.open(
          openingParam._endStackAt,
          openingParam._resolutionAt,
          openingParam._chip,
          openingParam._optionsQty,
          openingParam._resolvers,
          openingParam.details,
          openingParam.type
        )

        let pairID = 1
        let resultID = 1
        let stackedAmount = parseEther("10")

        await expect(betUpEvents.connect(p1).stack(pairID, resultID, stackedAmount))
          .emit(betUpEvents, 'StackEvent')
          .withArgs(pairID, resultID, stackedAmount)

        let balanceTo = await testERC20.balanceOf(betUpEvents.address)
        expect(balanceTo).equal(stackedAmount)
        let balanceFrom = await testERC20.balanceOf(await p1.getAddress())
        expect(balanceFrom).equal(parseEther("100").sub(stackedAmount))

        let playerID = getPlayerID(pairID,resultID,await p1.getAddress())
        let playerCtx = await betUpEvents.players(playerID)
        expect(playerCtx.amount).equal(stackedAmount)
        expect(playerCtx.amountWithBonus).equal(stackedAmount)

        let optionVolumeID = getOptionVolumeID(pairID, resultID)
        let optionVolume = await betUpEvents.optionsVolume(optionVolumeID)
        expect(optionVolume.amount).equal(stackedAmount)

        let pair = await betUpEvents.innerPairs(pairID)
        expect(pair.total).equal(stackedAmount)

        let playerRecord = await betUpCore.playerRecords(await p1.getAddress())
        expect(playerRecord).deep.equal([0, 1, "10000000" ])


    });

    it('test:: stack:: stack two sides ', async () => {
        let resolver = [await defaultAdmin.getAddress()]
        let openingParam = await forkOpeningParams(resolver, testERC20)
        await betUpEvents.open(
          openingParam._endStackAt,
          openingParam._resolutionAt,
          openingParam._chip,
          openingParam._optionsQty,
          openingParam._resolvers,
          openingParam.details,
          openingParam.type
        )

        let pairID = 1
        let resultIDs = [1,2]
        let stackedAmounts = [parseEther("10"), parseEther("20")]

        await expect(betUpEvents.connect(p1).stack(pairID, resultIDs[0], stackedAmounts[0]))
          .emit(betUpEvents, "StackEvent")
          .withArgs(pairID, resultIDs[0], stackedAmounts[0])

        await expect(betUpEvents.connect(p2).stack(pairID,resultIDs[1], stackedAmounts[1]))
          .emit(betUpEvents, 'StackEvent')
          .withArgs(pairID,resultIDs[1],stackedAmounts[1])

        let balanceFrom1 = await testERC20.balanceOf(await p1.getAddress())
        let balanceFrom2 = await testERC20.balanceOf(await p2.getAddress())
        let balanceTo = await testERC20.balanceOf(betUpEvents.address)
        expect(balanceFrom1).equal(parseEther("100").sub(stackedAmounts[0]))
        expect(balanceFrom2).equal(parseEther("100").sub(stackedAmounts[1]))
        expect(balanceTo).equal(stackedAmounts[0].add(stackedAmounts[1]))

        let playerID1 = getPlayerID(pairID,resultIDs[0],await p1.getAddress())
        let playerID2 = getPlayerID(pairID, resultIDs[1], await p2.getAddress())
        let playerCtx1 = await betUpEvents.players(playerID1)
        let platerCtx2 = await betUpEvents.players(playerID2)
        expect(playerCtx1.amount).equal(stackedAmounts[0]).equal(playerCtx1.amountWithBonus)
        expect(platerCtx2.amount).equal(stackedAmounts[1]).equal(platerCtx2.amountWithBonus)

        let optionVolumeID1 = getOptionVolumeID(pairID,resultIDs[0])
        let optionVolumeID2 = getOptionVolumeID(pairID,resultIDs[1])
        let optionVolume1 = await betUpEvents.optionsVolume(optionVolumeID1)
        let optionVolume2 = await betUpEvents.optionsVolume(optionVolumeID2)
        expect(optionVolume1.amount).equal(stackedAmounts[0])
        expect(optionVolume2.amount).equal(stackedAmounts[1])

        let pair = await betUpEvents.innerPairs(pairID)
        expect(pair.total).equal(stackedAmounts[0].add(stackedAmounts[1]))
    });

    it('testFailed:: claim :: an un-existent pair ', async () => {
        let invalidPairID = 1
        let mockResultID = 1
        let maxLevel = 0
        await expect(betUpEvents.connect(p1).claim(invalidPairID, mockResultID, maxLevel))
          .revertedWithCustomError(betUpEvents, "InvalidPairID")
    });

    it('testFailed:: claim:: the side which the player didn\'t staked ', async () => {
        let resolvers = [await defaultAdmin.getAddress()]
        let openingParam = await forkOpeningParams(resolvers, testERC20)
        await betUpEvents.open(
          openingParam._endStackAt,
          openingParam._resolutionAt,
          openingParam._chip,
          openingParam._optionsQty,
          openingParam._resolvers,
          openingParam.details,
          openingParam.type
        )

        await fastTimeAt(openingParam._resolutionAt)

        let pairID = 1
        let invalidResultID = 1
        let maxLevel = 0
        await expect(betUpEvents.connect(p1).claim(pairID, invalidResultID, maxLevel))
          .revertedWithCustomError(betUpEvents, "InvalidResultID")
          .withArgs(1)
    });

    it('testFailed:: claim:: the pair is ongoing ', async () => {
        let resolvers = [await defaultAdmin.getAddress()]
        let openingParam = await forkOpeningParams(resolvers, testERC20)
        await betUpEvents.open(
          openingParam._endStackAt,
          openingParam._resolutionAt,
          openingParam._chip,
          openingParam._optionsQty,
          openingParam._resolvers,
          openingParam.details,
          openingParam.type
        )

        let pairID = 1
        let invalidResultID = 1
        let maxLevel = 0

        await expect(betUpEvents.connect(p1).claim(pairID,invalidResultID,maxLevel))
          .revertedWith("ongoing")
    });

    it('testFailed:: claim:: with wrong maximum level ', async () => {
        let resolvers = [await defaultAdmin.getAddress()]
        let openingParam = await forkOpeningParams(resolvers, testERC20)
        await betUpEvents.open(
          openingParam._endStackAt,
          openingParam._resolutionAt,
          openingParam._chip,
          openingParam._optionsQty,
          openingParam._resolvers,
          openingParam.details,
          openingParam.type
        )

        let pairID = 1
        let resultID = 1
        let invalidMaxLevel = 100
        let stackedAmount = parseEther("10")

        await betUpEvents.connect(p1).stack(pairID,resultID, stackedAmount)
        await fastTimeAt(openingParam._resolutionAt)
        await expect(betUpEvents.connect(p1).claim(pairID,resultID,invalidMaxLevel))
          .revertedWith("Invalid _maxLevel")
    });

    it('testFailed:: claim:: the pair was paused', async () => {
        let resolver = [await defaultAdmin.getAddress()]
        let openingParam = await forkOpeningParams(resolver, testERC20)
        await betUpEvents.open(
          openingParam._endStackAt,
          openingParam._resolutionAt,
          openingParam._chip,
          openingParam._optionsQty,
          openingParam._resolvers,
          openingParam.details,
          openingParam.type
        )

        let pairID = 1
        let resultID = 1
        let amount = parseEther("10")

        await betUpEvents.connect(p1).stack(pairID, resultID, amount)
        await fastTimeAt(openingParam._resolutionAt)
        await betUpEvents.close(pairID, resultID, false)

        await betUpEvents.pausePair(pairID, true)

        let maxLevel = 0
        await expect(betUpEvents.connect(p1).claim(pairID, resultID, maxLevel))
          .revertedWithCustomError(betUpEvents, "PairPaused")
          .withArgs(1)


    });

    it('test:: claim:: claim only one side has stacked amount and this side is the pair\'s resultID', async () => {
        let resolver = [await defaultAdmin.getAddress()]
        let openingParam = await forkOpeningParams(resolver, testERC20)
        await betUpEvents.open(
          openingParam._endStackAt,
          openingParam._resolutionAt,
          openingParam._chip,
          openingParam._optionsQty,
          openingParam._resolvers,
          openingParam.details,
          openingParam.type
        )

        let pairID = 1
        let resultID = 1
        let stackedAmount = parseEther("10")
        await betUpEvents.connect(p1).stack(pairID,resultID, stackedAmount)
        await fastTimeAt(openingParam._resolutionAt)
        await betUpEvents.close(pairID,resultID, false)
        let maxLevel = 0;
        await expect(betUpEvents.connect(p1).claim(pairID, resultID,maxLevel))
          .emit(betUpEvents, "ClaimEvent")
          .withArgs(pairID, resultID, parseEther("10"), 0)

        let balanceTo = await testERC20.balanceOf(await p1.getAddress())
        let balanceFrom = await testERC20.balanceOf(betUpEvents.address)
        expect(balanceTo).equal(parseEther("100"))
        expect(balanceFrom).equal(0)

        let balanceToOfDao = await betUpDAOToken.balanceOf(await p1.getAddress())
        expect(balanceToOfDao).equal(0)


    });

    it('testFailed:: claim:: claim only one siede has stacked amount and this side is not the pair\'s resultID ', async () => {
        let resolver = [await defaultAdmin.getAddress()]
        let openingParam = await forkOpeningParams(resolver, testERC20)
        await betUpEvents.open(
          openingParam._endStackAt,
          openingParam._resolutionAt,
          openingParam._chip,
          openingParam._optionsQty,
          openingParam._resolvers,
          openingParam.details,
          openingParam.type
        )

        let pairID = 1
        let resultID = 1
        let stackedAmount = parseEther("10")
        await betUpEvents.connect(p1).stack(pairID,resultID, stackedAmount)
        await fastTimeAt(openingParam._resolutionAt)
        await betUpEvents.close(pairID,2, false)
        let maxLevel = 0;
        await expect(betUpEvents.claim(pairID, resultID, maxLevel))
          .revertedWithCustomError(betUpEvents, "InvalidResultID")
          .withArgs(resultID)

    });

    it('test:: claim :: two guys staked same side and other one stacked is different with them', async () => {
        let resolver = [await defaultAdmin.getAddress()]
        let openingParam = await forkOpeningParams(resolver, testERC20)
        await betUpEvents.open(
          openingParam._endStackAt,
          openingParam._resolutionAt,
          openingParam._chip,
          openingParam._optionsQty,
          openingParam._resolvers,
          openingParam.details,
          openingParam.type
        )

        let pairID = 1
        let resultIDs = [1,1,2]
        let stackedAmounts = [parseEther("10"), parseEther("20"), parseEther("30")]
        
        await betUpEvents.connect(p1).stack(pairID, resultIDs[0], stackedAmounts[0])
        await betUpEvents.connect(p2).stack(pairID, resultIDs[1], stackedAmounts[1])
        await betUpEvents.connect(p3).stack(pairID, resultIDs[2], stackedAmounts[2])

        let balanceTo = await testERC20.balanceOf(betUpEvents.address)
        expect(balanceTo).equal(stackedAmounts[0].add(stackedAmounts[1]).add(stackedAmounts[2]))
        
        await fastTimeAt(openingParam._resolutionAt)

        let closeResultID = 1
        await betUpEvents.close(pairID, closeResultID, false)

        let maxLevel = 0
        await betUpEvents.connect(p1).claim(pairID, resultIDs[0],maxLevel)
        await betUpEvents.connect(p2).claim(pairID,resultIDs[1],maxLevel)

        let balanceTo1 = await testERC20.balanceOf(await  p1.getAddress())
        let balanceTo2 = await testERC20.balanceOf(await  p2.getAddress())

        let total = stackedAmounts[0].add(stackedAmounts[1]).add(stackedAmounts[2])
        let op = stackedAmounts[0].add(stackedAmounts[1])

        expect(balanceTo1).equal(
          parseEther("100").add(calcProfit(op, stackedAmounts[0], total)))
        expect(balanceTo2).equal(
          parseEther("100").add(calcProfit(op, stackedAmounts[1], total)))

        await expect(betUpEvents.connect(p3).claim(pairID, resultIDs[2], maxLevel))
          .revertedWith('nothing be withdrew')

    });

    it('test:: claim :: pair resultID == 0 and the time has over the deadline  ', async () => {

        let resolver = [await defaultAdmin.getAddress()]
        let openingParam = await forkOpeningParams(resolver, testERC20)
        await betUpEvents.open(
          openingParam._endStackAt,
          openingParam._resolutionAt,
          openingParam._chip,
          openingParam._optionsQty,
          openingParam._resolvers,
          openingParam.details,
          openingParam.type
        )

        let pairID = 1
        let resultID = 1
        let stackedAmount = parseEther("10")

        await betUpEvents.connect(p1).stack(pairID, resultID, stackedAmount)

        let pair = await betUpEvents.pairs(pairID)

        await fastTimeAt(pair.resolutionAt.add(await betUpEvents.resolveDeadlineSecond()).toNumber())

        let maxLevel = 0;
        await expect(betUpEvents.connect(p1).claim(pairID,resultID, maxLevel))
          .emit(betUpEvents, "ClaimEvent")
          .withArgs(pairID, resultID, stackedAmount, 0)

        let balanceTo = await testERC20.balanceOf(await p1.getAddress())
        expect(balanceTo).equal(parseEther("100"))

        let balanceFrom = await testERC20.balanceOf(betUpEvents.address)
        expect(balanceFrom).equal(0)

    });

    it('testFailed:: claim :: the player who stacked wrong resultID and he\'s maximun level is zero, nothing could be claimed', async () => {
        let resolver = [await defaultAdmin.getAddress()]
        let openingParam = await forkOpeningParams(resolver, testERC20)
        await betUpEvents.open(
          openingParam._endStackAt,
          openingParam._resolutionAt,
          openingParam._chip,
          openingParam._optionsQty,
          openingParam._resolvers,
          openingParam.details,
          openingParam.type
        )

        let pairID = 1
        let resultID = 1
        let stackedAmount = parseEther("10")
        await betUpEvents.connect(p1).stack(pairID, resultID, stackedAmount)
        await betUpEvents.connect(p2).stack(pairID, 2, stackedAmount)
        await fastTimeAt(openingParam._resolutionAt)
        await betUpEvents.close(pairID, 2, false)
        await expect(betUpEvents.connect(p1).claim(pairID, resultID, 0))
          .revertedWith('nothing be withdrew')
    });

    it('testFailed:: addChips :: add duplicated chip', async () => {
        let chips = [testERC20.address]
        await expect(betUpEvents.addChips(chips)).revertedWith('duplicate')
    });

    it('testFailed:: addChips :: add an eoa address ', async () => {
        let invalidChips = [await p1.getAddress()]
        await expect(betUpEvents.addChips(invalidChips)).revertedWith('invalid address')
    });

    it('testFailed:: updateChip:: invalid an un-existent chip ', async () => {
        let unExistentChip = await test_deploy_testErc20()
        await expect(betUpEvents.updateChip(unExistentChip.address, 1))
          .revertedWith("invalid _chip")
    });

    it('testFailed:: updateChip:: duplicate ' , async () => {
        await expect(betUpEvents.updateChip(testERC20.address, 1))
          .revertedWith("invalid _chip")
    });

    it('test:: updateChip:: invalid an existent chip ', async () => {
        let status = 2
        await expect (betUpEvents.updateChip(testERC20.address, status))
          .emit(betUpEvents, "InvalidChipEvent")
          .withArgs(testERC20.address, status)

        let chipStatus = await betUpEvents.validChips(testERC20.address)
        expect(chipStatus).equal(status)
    });

    it('testFailed:: editCreateFee::  "invalid _createFee" ', async () => {
        await betUpEvents.grantRole(await betUpEvents.GOVERNANCE_ROLE(), await defaultAdmin.getAddress())

        let invalidCreationFee = 50000
        await expect(betUpEvents.setCreationFee(invalidCreationFee))
          .revertedWith("invalid _createFee")
    });

    it('test:: editCreateFee:: successfully ', async () => {
        await betUpEvents.grantRole(await betUpEvents.GOVERNANCE_ROLE(), await defaultAdmin.getAddress())

        let prior = await betUpEvents.createRewardsRatio()

        let createFee = BigNumber.from(5000) // @dev equal to 0.5 (500/ 10000)
        await expect(betUpEvents.setCreationFee(createFee))
          .emit(betUpEvents, "EditCreationFee")
          .withArgs(prior, createFee)

        let fee = await betUpEvents.createRewardsRatio()
        expect(fee).equal(createFee)
    });

    it('test:: claimCreationRewards:: claimCreationRewards ', async () => {
        let resolver = [await defaultAdmin.getAddress()]
        let openingParam = await forkOpeningParams(resolver, testERC20)
        await betUpEvents.open(
          openingParam._endStackAt,
          openingParam._resolutionAt,
          openingParam._chip,
          openingParam._optionsQty,
          openingParam._resolvers,
          openingParam.details,
          openingParam.type
        )

        let pairID = 1
        let resultIDs = [1,2]
        let stackedAmount = [parseEther("10"), parseEther("20")]
        await betUpEvents.connect(p1).stack(pairID, resultIDs[0], stackedAmount[0])
        await betUpEvents.connect(p2).stack(pairID, resultIDs[1], stackedAmount[1])
        await fastTimeAt(openingParam._resolutionAt)
        await betUpEvents.close(pairID, resultIDs[0], false)
        await betUpEvents.grantRole(await betUpEvents.GOVERNANCE_ROLE(), await defaultAdmin.getAddress())

        let creationReward = BigNumber.from("10").pow("18")
        await expect(betUpEvents.claimCreationRewards(pairID))
          .emit(betUpEvents, "WithdrawFeeEvent")
          .withArgs(pairID, creationReward)

        let balanceTo = await testERC20.balanceOf(betUpEvents.address)
        expect(balanceTo).equal(stackedAmount[0].add(stackedAmount[1]).sub(creationReward))

        let pair = await betUpEvents.pairs(pairID)
        expect(pair.claimedReward).equal(true)

        let creationFee = 5000
        await betUpEvents.setCreationFee(creationFee)
        expect(await betUpEvents.createRewardsRatio()).equal(creationFee)

        await expect(betUpEvents.claimCreationRewards(pairID))
          .revertedWith("claimed")
    });

    it('should ', async () => {
        await testERC20WithSixDecimal.connect(p1).mint(await p1.getAddress(), parseEther("1000"))
        await testERC20WithSixDecimal.connect(p1).approve(betUpEvents.address, ethers.constants.MaxUint256)
        await testERC20WithSixDecimal.connect(p2).mint(await p2.getAddress(), parseEther("1000"))
        await testERC20WithSixDecimal.connect(p2).approve(betUpEvents.address, ethers.constants.MaxUint256)

        await betUpEvents.addChips([testERC20WithSixDecimal.address])

        let resolver = [await defaultAdmin.getAddress()]
        let openingParam = await forkOpeningParams(resolver, testERC20WithSixDecimal)
        await betUpEvents.open(
          openingParam._endStackAt  + 1000,
          openingParam._resolutionAt + 1000,
          openingParam._chip,
          openingParam._optionsQty,
          openingParam._resolvers,
          openingParam.details,
          openingParam.type
        )

        let pairID = 1
        let resultIDs = [1,2]
        // 100
        let stackedAmount = ["100000000", "100000000"]

        for(let i = 0; i < 45; i++) {
            await betUpEvents.connect(p1).stack(pairID, resultIDs[1], stackedAmount[0])
        }

        await betUpSheep.connect(p1).createCard(1, [2,2,2])
        await betUpSheep.connect(p1).createCard(1, [2,2,2])

        let balanceWithSheep = await betUpSheep.balanceOf(await p1.getAddress())
        console.log(balanceWithSheep);

        await betUpEvents.connect(p2).stack(pairID, resultIDs[0], stackedAmount[1])
        await fastTimeAt(openingParam._resolutionAt+ 1000)
        await betUpEvents.close(pairID, resultIDs[0], false)
        //
        // await betUpEvents.connect(p1).claim(pairID, resultIDs[0], 1)
        await betUpEvents.connect(p2).claim(pairID, resultIDs[0], 0)

        // let balanceTo1 = await testERC20.balanceOf(await p1.getAddress())
        // let balanceTp2 = await testERC20.balanceOf(await p2.getAddress())
        // console.log(balanceTo1);
        // console.log(balanceTp2);

    });

    it('test:: claim :: unilateral and unsettle and after _endStackAt ', async () => {
        let resolver = [await defaultAdmin.getAddress()]
        let openingParam = await forkOpeningParams(resolver, testERC20)
        await betUpEvents.open(
          openingParam._endStackAt,
          openingParam._resolutionAt,
          openingParam._chip,
          openingParam._optionsQty,
          openingParam._resolvers,
          openingParam.details,
          openingParam.type
        )

        let pairID = 1
        let resultID = 2
        let stackedAmount = parseEther("1")

        await betUpEvents.connect(p1).stack(pairID, resultID, stackedAmount)

        let playerRecords = await betUpCore.playerRecords(await p1.getAddress())
        console.log(playerRecords);

        await fastTimeAt(openingParam._endStackAt)
        await betUpEvents.connect(p1).claim(pairID, resultID, 0)

        let balance = await testERC20.balanceOf(await p1.getAddress())
        expect(balance).equal(parseEther("100"))

    });

    it('test:: claim :: unilateral and unsettle and after _resolutionAt', async () => {
        let resolver = [await defaultAdmin.getAddress()]
        let openingParam = await forkOpeningParams(resolver, testERC20)
        await betUpEvents.open(
          openingParam._endStackAt,
          openingParam._resolutionAt,
          openingParam._chip,
          openingParam._optionsQty,
          openingParam._resolvers,
          openingParam.details,
          openingParam.type
        )

        let pairID = 1
        let resultID = 2
        let stackedAmount = parseEther("1")

        await betUpEvents.connect(p1).stack(pairID, resultID, stackedAmount)
        await fastTimeAt(openingParam._resolutionAt)
        await betUpEvents.connect(p1).claim(pairID, resultID, 0)

        let balance = await testERC20.balanceOf(await p1.getAddress())
        expect(balance).equal(parseEther("100"))

    });


    it('test:: claim :: withdraw principle when resolvers submitted different resultID and arrive at _resolutionAt + resolveDeadlineSecond ', async () => {
        let resolver = [await pairClosingAdmin1.getAddress(), await pairClosingAdmin2.getAddress(), await pairClosingAdmin3.getAddress()]
        let openingParam = await forkOpeningParams(resolver, testERC20)
        await betUpEvents.open(
          openingParam._endStackAt,
          openingParam._resolutionAt,
          openingParam._chip,
          openingParam._optionsQty,
          openingParam._resolvers,
          openingParam.details,
          openingParam.type
        )

        let pairID = 1
        let resultID = 2
        let stackedAmount = parseEther("1")

        await betUpEvents.connect(p1).stack(pairID, resultID, stackedAmount)
        await fastTimeAt(openingParam._resolutionAt)
        await betUpEvents.connect(pairClosingAdmin1).close(pairID, 1, false)
        await betUpEvents.connect(pairClosingAdmin2).close(pairID, 2, false)
        await betUpEvents.connect(pairClosingAdmin3).close(pairID, 3, false)
        await fastTimeAt(openingParam._resolutionAt + (await betUpEvents.resolveDeadlineSecond()))

        await betUpEvents.connect(p1).claim(pairID, resultID, 0)

        let balance = await testERC20.balanceOf(await p1.getAddress())
        expect(balance).equal(parseEther("100"))

    });

    it('test:: claim :: withdraw principle when no resolvers submitted resultID and arrive at _resolutionAt + resolveDeadlineSecond ', async () => {
        let resolver = [await defaultAdmin.getAddress()]
        let openingParam = await forkOpeningParams(resolver, testERC20)
        await betUpEvents.open(
          openingParam._endStackAt,
          openingParam._resolutionAt,
          openingParam._chip,
          openingParam._optionsQty,
          openingParam._resolvers,
          openingParam.details,
          openingParam.type
        )

        let pairID = 1
        let resultIDs = [1,2,3]
        let stackedAmount = parseEther("1")

        await betUpEvents.connect(p1).stack(pairID, resultIDs[0], stackedAmount)
        await betUpEvents.connect(p2).stack(pairID, resultIDs[1], stackedAmount)
        await betUpEvents.connect(p3).stack(pairID, resultIDs[2], stackedAmount)
        await fastTimeAt(openingParam._resolutionAt + (await betUpEvents.resolveDeadlineSecond()))

        await betUpEvents.connect(p1).claim(pairID, resultIDs[0], 0)
        await betUpEvents.connect(p2).claim(pairID, resultIDs[1], 0)
        await betUpEvents.connect(p3).claim(pairID, resultIDs[2], 0)

        let balance = await testERC20.balanceOf(await p1.getAddress())
        expect(balance).equal(parseEther("100"))

        balance = await testERC20.balanceOf(await p2.getAddress())
        expect(balance).equal(parseEther("100"))

        balance = await testERC20.balanceOf(await p3.getAddress())
        expect(balance).equal(parseEther("100"))
    });

    it('test:: getRewardOf::  ', async () => {
        let resolver = [await defaultAdmin.getAddress()]
        let openingParam = await forkOpeningParams(resolver, testERC20)
        await betUpEvents.open(
          openingParam._endStackAt,
          openingParam._resolutionAt,
          openingParam._chip,
          openingParam._optionsQty,
          openingParam._resolvers,
          openingParam.details,
          openingParam.type
        )

        let pairID = 1
        let resultID = 2
        let stackedAmount = parseEther("1")

        await betUpEvents.connect(p1).stack(pairID, 1, stackedAmount)
        await betUpEvents.connect(p1).stack(pairID, 2, stackedAmount)
        await fastTimeAt(openingParam._resolutionAt)
        await betUpEvents.close(pairID, resultID, false)
        let res = await betUpEvents.getRewardOf(pairID, resultID, 0, await p1.getAddress())
        console.log(res);

    });

    it('withdrawToVault', async () => {
        let resolver = [await defaultAdmin.getAddress()]
        let openingParam = await forkOpeningParams(resolver, testERC20)
        await betUpEvents.open(
          openingParam._endStackAt,
          openingParam._resolutionAt,
          openingParam._chip,
          openingParam._optionsQty,
          openingParam._resolvers,
          openingParam.details,
          openingParam.type
        )

        let pairID = 1
        let resultIDs = [1,2,3]
        let stackedAmounts = [
          parseUnits('100','mwei'),
            parseUnits('200','mwei'),
            parseUnits('300','mwei'),
        ]

        await betUpEvents.connect(p1).stack(pairID, resultIDs[0], stackedAmounts[0])
        await betUpEvents.connect(p2).stack(pairID, resultIDs[1], stackedAmounts[1])
        await betUpEvents.connect(p3).stack(pairID, resultIDs[2], stackedAmounts[2])
        await fastTimeAt(openingParam._resolutionAt)
        await betUpEvents.close(pairID, resultIDs[0], false)

        let pair = await betUpEvents.pairs(pairID)
        let innerPair = await betUpEvents.innerPairs(pairID)

        let opv = await betUpEvents.optionsVolume(getOptionVolumeID(pairID,resultIDs[0]))
        opv = await betUpEvents.optionsVolume(getOptionVolumeID(pairID,resultIDs[1]))
        opv = await betUpEvents.optionsVolume(getOptionVolumeID(pairID,resultIDs[2]))
        let op = await betUpEvents.optionsVolume(getOptionVolumeID(pairID,innerPair.resultID))

        let availableAmount = calcAvailableAmount(innerPair.total,op.amount,pair.creationRatio)

        let balance = await testERC20.balanceOf(await defaultAdmin.getAddress())
        expect(balance).equal(0)
        await expect(betUpEvents.withdrawToVault([pairID]))
          .emit(betUpEvents, 'WithdrawToVaultEvent')
          .withArgs(pairID, availableAmount)

        balance = await testERC20.balanceOf(await defaultAdmin.getAddress())
        expect(availableAmount).equal(balance)

    });

    it('test:: setResultID', async () => {
        let resolver = [await defaultAdmin.getAddress()]
        let openingParam = await forkOpeningParams(resolver, testERC20)
        await betUpEvents.open(
          openingParam._endStackAt,
          openingParam._resolutionAt,
          openingParam._chip,
          openingParam._optionsQty,
          openingParam._resolvers,
          openingParam.details,
          openingParam.type
        )

        let pairID = 1

        await betUpEvents.grantRole(
          await betUpEvents.GOVERNANCE_ROLE(), await defaultAdmin.getAddress())

        await betUpEvents.setResultID(pairID, 1, true)

        let innerPair = await betUpEvents.innerPairs(pairID)
        expect(innerPair.resultID).equal(65535)
    })

    it('testFailed:: invalid pairId :: one-side with has been resolved ', async () => {
        let resolver = [await defaultAdmin.getAddress()]
        let openingParam = await forkOpeningParams(resolver, testERC20)
        await betUpEvents.open(
          openingParam._endStackAt,
          openingParam._resolutionAt,
          openingParam._chip,
          openingParam._optionsQty,
          openingParam._resolvers,
          openingParam.details,
          openingParam.type
        )

        let pairID = 1
        let resultIDs = [1,2,3]
        let stackedAmounts = [
            parseUnits('100','mwei'),
        ]

        let playerBalance1 = await testERC20.balanceOf(await p1.getAddress())
        console.log(playerBalance1);

        await betUpEvents.connect(p1).stack(pairID, resultIDs[0], stackedAmounts[0])
        await fastTimeAt(openingParam._resolutionAt)
        await betUpEvents.close(pairID, resultIDs[0], false)

        let balance = await testERC20.balanceOf(await defaultAdmin.getAddress())
        expect(balance).equal(0)

        await expect(betUpEvents.withdrawToVault([pairID]))
          .revertedWithCustomError(betUpEvents, 'InvalidPairID')
          .withArgs('1')


        await expect(betUpEvents.claimCreationRewards(pairID))
          .revertedWithCustomError(betUpEvents, 'InvalidPairID')
          .withArgs('1')

        let playerBalance2 = await testERC20.balanceOf(await p1.getAddress())
        console.log(playerBalance2);

        await betUpEvents.connect(p1).claim(pairID, resultIDs[0], 0)

        let playerBalance3 = await testERC20.balanceOf(await p1.getAddress())
        expect(playerBalance3).equal(playerBalance1)
    });

    it('testFailed:: invalid pairId :: one-side with has been resolved 2', async () => {
        let resolver = [await defaultAdmin.getAddress()]
        let openingParam = await forkOpeningParams(resolver, testERC20)
        await betUpEvents.open(
          openingParam._endStackAt,
          openingParam._resolutionAt,
          openingParam._chip,
          openingParam._optionsQty,
          openingParam._resolvers,
          openingParam.details,
          openingParam.type
        )

        let pairID = 1
        let resultIDs = [1,2,3]
        let stackedAmounts = [
            parseUnits('100','mwei'),
        ]

        let playerBalance1 = await testERC20.balanceOf(await p1.getAddress())

        await betUpEvents.connect(p1).stack(pairID, resultIDs[0], stackedAmounts[0])
        await fastTimeAt(openingParam._resolutionAt)
        await betUpEvents.close(pairID, resultIDs[1], false)

        let balance = await testERC20.balanceOf(await defaultAdmin.getAddress())
        expect(balance).equal(0)

        await expect(betUpEvents.withdrawToVault([pairID]))
          .revertedWithCustomError(betUpEvents, 'InvalidPairID')
          .withArgs('1')


        await expect(betUpEvents.claimCreationRewards(pairID))
          .revertedWithCustomError(betUpEvents, 'InvalidPairID')
          .withArgs('1')

        await expect(betUpEvents.claimCreationRewards(pairID))
          .revertedWithCustomError(betUpEvents, 'InvalidPairID')
          .withArgs('1')

        let playerBalance2 = await testERC20.balanceOf(await p1.getAddress())
        console.log(playerBalance2);

        await betUpEvents.connect(p1).claim(pairID, resultIDs[0], 0)

        let playerBalance3 = await testERC20.balanceOf(await p1.getAddress())
        expect(playerBalance3).equal(playerBalance1)
    });

    it('abc', async () => {
        let id = await getOptionVolumeID(112,1)
        console.log(id);
        id = await getOptionVolumeID(112,2)
        console.log(id);
        id = await getOptionVolumeID(112,3)
        console.log(id);
    });

    it('bug1:: ', async () => {
        await testERC20WithSixDecimal.connect(p1).mint(await p1.getAddress(), parseEther("1000"))
        await testERC20WithSixDecimal.connect(p1).approve(betUpEvents.address, ethers.constants.MaxUint256)
        await testERC20WithSixDecimal.connect(p2).mint(await p2.getAddress(), parseEther("1000"))
        await testERC20WithSixDecimal.connect(p2).approve(betUpEvents.address, ethers.constants.MaxUint256)
        await testERC20WithSixDecimal.connect(p3).mint(await p3.getAddress(), parseEther("1000"))
        await testERC20WithSixDecimal.connect(p3).approve(betUpEvents.address, ethers.constants.MaxUint256)

        await betUpEvents.addChips([testERC20WithSixDecimal.address])
        let resolver = [await defaultAdmin.getAddress()]
        let openingParam = await forkOpeningParams(resolver, testERC20WithSixDecimal)
        await betUpEvents.open(
          openingParam._endStackAt,
          openingParam._resolutionAt,
          openingParam._chip,
          openingParam._optionsQty,
          openingParam._resolvers,
          openingParam.details,
          openingParam.type
        )

        let pairID = 1
        let resultID = [1,2,3]
        let stackedAmount = [
            parseUnits('100','mwei'),
            parseUnits('200','mwei'),
            parseUnits('300','mwei')
        ]

        await betUpEvents.connect(p1).stack(pairID, resultID[0], stackedAmount[0])
        await betUpEvents.connect(p2).stack(pairID, resultID[1], stackedAmount[1])
        await betUpEvents.connect(p3).stack(pairID, resultID[2], stackedAmount[2])

        await fastTimeAt(openingParam._resolutionAt)
        await betUpEvents.close(pairID, resultID[0], false)

        let reward = await betUpEvents.getRewardOf(pairID, resultID[0], 0, await p1.getAddress())
        // console.log(reward); // todo
        await betUpEvents.connect(p1).claim(pairID, resultID[0], 0)
        reward = await betUpEvents.getRewardOf(pairID, resultID[0], 0, await p1.getAddress())
        expect(reward[0]).equal(reward[1]).equal('0')

    });

    it('bug 66 ', async () => {
        await testERC20WithSixDecimal.connect(p1).mint(await p1.getAddress(), parseEther("1000"))
        await testERC20WithSixDecimal.connect(p1).approve(betUpEvents.address, ethers.constants.MaxUint256)
        await testERC20WithSixDecimal.connect(p2).mint(await p2.getAddress(), parseEther("1000"))
        await testERC20WithSixDecimal.connect(p2).approve(betUpEvents.address, ethers.constants.MaxUint256)
        await testERC20WithSixDecimal.connect(p3).mint(await p3.getAddress(), parseEther("1000"))
        await testERC20WithSixDecimal.connect(p3).approve(betUpEvents.address, ethers.constants.MaxUint256)

        await betUpEvents.addChips([testERC20WithSixDecimal.address])
        let resolver = [await defaultAdmin.getAddress()]
        let openingParam = await forkOpeningParams(resolver, testERC20WithSixDecimal)
        await betUpEvents.open(
          openingParam._endStackAt,
          openingParam._resolutionAt,
          openingParam._chip,
          openingParam._optionsQty,
          openingParam._resolvers,
          openingParam.details,
          openingParam.type
        )

        let pairID = 1
        let resultID = [1,2,3]
        let stackedAmount = [
            parseUnits('100','mwei'),
            parseUnits('200','mwei'),
            parseUnits('300','mwei')
        ]

        await betUpEvents.connect(p1).stack(pairID, resultID[0], stackedAmount[0])
        await betUpEvents.connect(p2).stack(pairID, resultID[1], stackedAmount[1])
        await betUpEvents.connect(p3).stack(pairID, resultID[2], stackedAmount[2])

        await fastTimeAt(openingParam._resolutionAt)
        await expect(betUpEvents.connect(p1).claim(pairID, resultID[0], 0))
          .revertedWith("nothing be withdrew")

    });

    it('fix::bug2 ', async () => {
        await testERC20WithSixDecimal.connect(p1).mint(await p1.getAddress(), parseEther("1000"))
        await testERC20WithSixDecimal.connect(p1).approve(betUpEvents.address, ethers.constants.MaxUint256)

        await betUpEvents.addChips([testERC20WithSixDecimal.address])
        let resolver = [await defaultAdmin.getAddress()]
        let openingParam = await forkOpeningParams(resolver, testERC20WithSixDecimal)
        await betUpEvents.open(
          openingParam._endStackAt,
          openingParam._resolutionAt,
          openingParam._chip,
          openingParam._optionsQty,
          openingParam._resolvers,
          openingParam.details,
          openingParam.type
        )

        let pairID = 1
        let resultID = 2
        await betUpEvents.connect(p1).stack(pairID, resultID, '100')
        await fastTimeAt(openingParam._resolutionAt)
        await betUpEvents.close(pairID, 1, false)
        let reward = await betUpEvents.getRewardOf(pairID, 1, 0, await p1.getAddress())
        console.log(reward);
    });

    it('fix::bug3 normal user withdraw creation reward', async () => {
        await testERC20WithSixDecimal.connect(p2).mint(await p2.getAddress(), parseEther("1000"))
        await testERC20WithSixDecimal.connect(p2).approve(betUpEvents.address, ethers.constants.MaxUint256)
        await testERC20WithSixDecimal.connect(p3).mint(await p3.getAddress(), parseEther("1000"))
        await testERC20WithSixDecimal.connect(p3).approve(betUpEvents.address, ethers.constants.MaxUint256)

        await betUpDAOToken.grantRole(await betUpDAOToken.MINT_MANAGER(), await p1.getAddress())
        await betUpDAOToken.connect(p1).mint(await p1.getAddress(), parseEther('1000'))
        await betUpDAOToken.connect(p1).approve(betUpEvents.address, ethers.constants.MaxUint256)

        await betUpEvents.addChips([testERC20WithSixDecimal.address])
        let resolver = [await p1.getAddress()]
        let openingParam = await forkOpeningParams(resolver, testERC20WithSixDecimal)
        await betUpEvents.connect(p1).open(
          openingParam._endStackAt,
          openingParam._resolutionAt,
          openingParam._chip,
          openingParam._optionsQty,
          openingParam._resolvers,
          openingParam.details,
          openingParam.type
        )

        let balanceTo = await betUpDAOToken.balanceOf(betUpEvents.address)
        expect(balanceTo).equal(parseEther('1000'))

        let pairID = 1
        let resultIDs = [1,2]
        await betUpEvents.connect(p2).stack(pairID, resultIDs[0], '100')
        await betUpEvents.connect(p3).stack(pairID, resultIDs[1], '100')
        await fastTimeAt(openingParam._resolutionAt)
        await betUpEvents.connect(p1).close(pairID, resultIDs[1], false)

        await betUpEvents.connect(p1).claimCreationRewards(pairID)

        let balanceFrom = await betUpDAOToken.balanceOf(await p1.getAddress())
        expect(balanceFrom).equal(parseEther('1000'))

    });

    it('fix::bug4 ', async () => {
        await testERC20WithSixDecimal.connect(p1).mint(await p1.getAddress(), parseEther("1000"))
        await testERC20WithSixDecimal.connect(p1).approve(betUpEvents.address, ethers.constants.MaxUint256)
        await testERC20WithSixDecimal.connect(p2).mint(await p2.getAddress(), parseEther("1000"))
        await testERC20WithSixDecimal.connect(p2).approve(betUpEvents.address, ethers.constants.MaxUint256)

        await betUpDAOToken.connect(p1).approve(betUpSheep.address, ethers.constants.MaxUint256)

        await betUpEvents.addChips([testERC20WithSixDecimal.address])

        let resolver = [await defaultAdmin.getAddress()]
        let openingParam = await forkOpeningParams(resolver, testERC20WithSixDecimal)
        await betUpEvents.open(
          openingParam._endStackAt  + 1000,
          openingParam._resolutionAt + 1000,
          openingParam._chip,
          openingParam._optionsQty,
          openingParam._resolvers,
          openingParam.details,
          openingParam.type
        )

        let pairID = 1
        let resultIDs = [1,2]
        // 100
        let stackedAmount = ["100000000", "100000000"]

        for(let i = 0; i < 45; i++) {
            await betUpEvents.connect(p1).stack(pairID, resultIDs[1], stackedAmount[0])
        }

        let record = await betUpCore.playerRecords(await p1.getAddress())
        expect(record).deep.equal([
          BigNumber.from('0'),
          BigNumber.from('45'),
          BigNumber.from((45 * 100000000).toString())
        ])

        await betUpSheep.connect(p1).createCard(1, [2,2,2])

        record = await betUpCore.playerRecords(await p1.getAddress())
        expect(record).deep.equal([
            BigNumber.from('30'),
            BigNumber.from('45'),
            BigNumber.from((45 * 100000000).toString())
        ])

        await betUpDAOToken.grantRole(await betUpDAOToken.MINT_MANAGER(), await defaultAdmin.getAddress())
        await betUpDAOToken.mint(await p1.getAddress(), parseEther("11000"))
        let daoBalance = await betUpDAOToken.balanceOf(await p1.getAddress())
        expect(daoBalance).equal(BigNumber.from('11000').mul(BigNumber.from('10').pow('18')))

        await betUpSheep.connect(p1).upgradeCard(1, 2)

        record = await betUpCore.playerRecords(await p1.getAddress())
        expect(record).deep.equal([
            BigNumber.from('45'),
            BigNumber.from('45'),
            BigNumber.from((45 * 100000000).toString())
        ])

        daoBalance = await betUpDAOToken.balanceOf(await p1.getAddress())
        expect(daoBalance).equal(0)

        let level = await betUpSheep.getTokenIdLevel(1)
        expect(level).equal(2)

        daoBalance = await betUpDAOToken.balanceOf(await p1.getAddress())
        expect(daoBalance).equal("0")
    });

    it('test:: withdraw dao rewards', async () => {
        await testERC20WithSixDecimal.connect(p1).mint(await p1.getAddress(), parseEther("1000"))
        await testERC20WithSixDecimal.connect(p1).approve(betUpEvents.address, ethers.constants.MaxUint256)
        await testERC20WithSixDecimal.connect(p2).mint(await p2.getAddress(), parseEther("1000"))
        await testERC20WithSixDecimal.connect(p2).approve(betUpEvents.address, ethers.constants.MaxUint256)

        await betUpDAOToken.connect(p1).approve(betUpSheep.address, ethers.constants.MaxUint256)
        await betUpDAOToken.connect(p2).approve(betUpSheep.address, ethers.constants.MaxUint256)

        await betUpEvents.addChips([testERC20WithSixDecimal.address])

        let resolver = [await defaultAdmin.getAddress()]
        let openingParam = await forkOpeningParams(resolver, testERC20WithSixDecimal)
        await betUpEvents.open(
          openingParam._endStackAt,
          openingParam._resolutionAt,
          openingParam._chip,
          openingParam._optionsQty,
          openingParam._resolvers,
          openingParam.details,
          openingParam.type
        )

        let pairID = 1
        let resultIDs = [1,2]
        // 100
        let stackedAmount = ["100000000", "100000000"]

        for(let i = 0; i < 45; i++) {
            await betUpEvents.connect(p1).stack(pairID, resultIDs[1], stackedAmount[0])
            await betUpEvents.connect(p2).stack(pairID, resultIDs[0], stackedAmount[0])
        }

        await betUpSheep.connect(p1).createCard(1, [2,2,2])
        await betUpSheep.connect(p2).createCard(1, [2,2,2])

        await betUpDAOToken.grantRole(await betUpDAOToken.MINT_MANAGER(), await defaultAdmin.getAddress())
        await betUpDAOToken.mint(await p1.getAddress(), parseEther("11000"))
        await betUpDAOToken.mint(await p2.getAddress(), parseEther("11000"))

        await fastTimeAt(openingParam._resolutionAt)
        await betUpEvents.close(pairID, 1, false)

        await betUpEvents.connect(p1).claim(pairID, resultIDs[1], 1)

    })


    it('fix::bug5 ', async () => {
        await testERC20WithSixDecimal.connect(p1).mint(await p1.getAddress(), parseEther("1000"))
        await testERC20WithSixDecimal.connect(p1).approve(betUpEvents.address, ethers.constants.MaxUint256)
        await testERC20WithSixDecimal.connect(p2).mint(await p2.getAddress(), parseEther("1000"))
        await testERC20WithSixDecimal.connect(p2).approve(betUpEvents.address, ethers.constants.MaxUint256)

        await betUpDAOToken.connect(p1).approve(betUpSheep.address, ethers.constants.MaxUint256)

        await betUpEvents.addChips([testERC20WithSixDecimal.address])

        let resolver = [await defaultAdmin.getAddress()]
        let openingParam = await forkOpeningParams(resolver, testERC20WithSixDecimal)
        await betUpEvents.open(
          openingParam._endStackAt  + 1000,
          openingParam._resolutionAt + 1000,
          openingParam._chip,
          openingParam._optionsQty,
          openingParam._resolvers,
          openingParam.details,
          openingParam.type
        )

        let pairID = 1
        let resultIDs = [1,2]
        // 100
        let stackedAmount = ["100000000", "100000000"]

        for(let i = 0; i < 68; i++) {
            await betUpEvents.connect(p1).stack(pairID, resultIDs[1], stackedAmount[0])
        }

        let record = await betUpCore.playerRecords(await p1.getAddress())
        console.log(record);

        await betUpSheep.connect(p1).createCard(1, [2,2,2])

        record = await betUpCore.playerRecords(await p1.getAddress())
        console.log(record);

        await betUpDAOToken.grantRole(await betUpDAOToken.MINT_MANAGER(), await defaultAdmin.getAddress())
        await betUpDAOToken.mint(await p1.getAddress(), parseEther("34000"))
        let daoBalance = await betUpDAOToken.balanceOf(await p1.getAddress())
        console.log(daoBalance);

        await betUpSheep.connect(p1).upgradeCard(1, 3)

        record = await betUpCore.playerRecords(await p1.getAddress())
        console.log(record);

        let level = await betUpSheep.getTokenIdLevel(1)
        console.log(level);

        daoBalance = await betUpDAOToken.balanceOf(await p1.getAddress())
        console.log(daoBalance);
        expect(daoBalance).equal('0')
    });


    it('calcUpgradeAmount ', async () => {
        let res = await betUpCore.calcUpgradeAmount(2,5)
        console.log(res);
        res = await betUpCore.calcUpgradeAmount(1,5)
        console.log(res);
    });

    it('calcMintAmount ', async () => {
        let res = await betUpCore.calcMintAmount(1,5)
        console.log(res);

        res = await betUpCore.calcMintAmount(0,1)
        console.log(res);

        res = await betUpCore.calcMintAmount(0,5)
        console.log(res);

        res = await betUpCore.calcMintAmount(2,3)
        console.log(res);

        res = await betUpCore.calcMintAmount(1,2)
        console.log(res);

        console.log(ethers.constants.MaxUint256.toString())
    });

    it('fix:: bug6 ', async () => {
        let resolver = [await defaultAdmin.getAddress()]
        let openingParam = await forkOpeningParams(resolver, testERC20)
        await betUpEvents.open(
          openingParam._endStackAt,
          openingParam._resolutionAt,
          openingParam._chip,
          openingParam._optionsQty,
          openingParam._resolvers,
          openingParam.details,
          openingParam.type
        )

        let pairID = 1
        let resultID = 1
        let stackedAmount = 1000
        await betUpEvents.connect(p1).stack(pairID, resultID, stackedAmount)
        await fastTimeAt(openingParam._resolutionAt)
        await betUpEvents.close(pairID, 2, false)

        let res = await betUpEvents.innerPairs(pairID)
        console.log(res);
        await expect(betUpEvents.claimCreationRewards(pairID))
          .revertedWithCustomError(betUpEvents, 'InvalidPairID')
          .withArgs(1)
    });

    it('guess batch withdraw ', async () => {
        let apple_dai_target1 = ethers.utils.formatBytes32String("apple/dai")
        let apple_dai_target2 = ethers.utils.formatBytes32String("apple/usdt")
        await pairManager.grantRole(await pairManager.PAIR_MANAGER(), await defaultAdmin.getAddress())
        await pairManager.grantRole(await pairManager.OPEN_MANAGER(), await defaultAdmin.getAddress())
        await pairManager.grantRole(await pairManager.CLOSE_MANAGER(), await defaultAdmin.getAddress())

        await pairManager.addPair(
  [
            {
              pairName: apple_dai_target1,
              chip: testERC20.address,
              status: 1,
              counter: 0
            },
            {
              pairName: apple_dai_target2,
              chip: testERC20WithSixDecimal.address,
              status: 1,
              counter: 0
            }
          ]
        )
        let pairId1 = await pairManager.pairIds(apple_dai_target1, testERC20.address)
        let pairId2 = await pairManager.pairIds(apple_dai_target2, testERC20WithSixDecimal.address)

        let otime = await getCurrentTime()
        await pairManager.open([pairId1], [30], [otime], [3600], [600], [1200])
        await pairManager.open([pairId2], [30], [otime], [3600], [600], [1200])
        await fastTimeAt(otime + 600)

        let amount1 = BigNumber.from('10000000000000000000')
        await testERC20.mint(await p1.getAddress(), amount1)
        await testERC20.mint(await p2.getAddress(), amount1)
        await testERC20.connect(p1).approve(betUpGuess.address, ethers.constants.MaxUint256)
        await testERC20.connect(p2).approve(betUpGuess.address, ethers.constants.MaxUint256)
        await betUpGuess.connect(p1).trystack(pairId1, amount1, 1)
        await betUpGuess.connect(p2).trystack(pairId1, amount1, 2)

        let amount2 = '10000000'
        await testERC20WithSixDecimal.mint(await p1.getAddress(), '10000000')
        await testERC20WithSixDecimal.mint(await p2.getAddress(), '10000000')
        await testERC20WithSixDecimal.connect(p1).approve(betUpGuess.address, ethers.constants.MaxUint256)
        await testERC20WithSixDecimal.connect(p2).approve(betUpGuess.address, ethers.constants.MaxUint256)
        await betUpGuess.connect(p1).trystack(pairId2, amount2, 1)
        await betUpGuess.connect(p2).trystack(pairId2, amount2, 2)

        await fastTimeAt(await getCurrentTime() + 3700)
        let closingData1: PairManager.ClosingDataStruct
        closingData1 =  {
            ids: [pairId1],
            cPrices: [100],
            nextOPrice: [100],
            nextOTimes:  [await getCurrentTime()] ,
            nextPeriodSeconds:  [3600],
            nextSIntervalsSeconds: [600],
            nextEIntervalsSeconds:  [1200]
        }
        let closingData2 =  {
            ids: [pairId2],
            cPrices: [100],
            nextOPrice: [100],
            nextOTimes:  [await getCurrentTime()] ,
            nextPeriodSeconds:  [3600],
            nextSIntervalsSeconds: [600],
            nextEIntervalsSeconds:  [1200]
        }
        await pairManager.close(closingData1)
        await pairManager.close(closingData2)


        let reward = await betUpGuess.getRewardOf(pairId1, 0, await p1.getAddress(), 1, 0)
        console.log(reward);

        reward = await betUpGuess.getRewardOf(pairId2, 0, await p1.getAddress(), 1, 0)
        console.log(reward);

        // await betUpGuess.connect(p1).withdraw(0, [pairId1], [0], [1])
        // await betUpGuess.connect(p1).withdraw(0, [pairId2], [0], [1])
        await betUpGuess.connect(p1).withdraw(0, [pairId1,pairId2], [0,0], [1,1])

    });

    it('should abc', () => {
        let p = getOptionVolumeID(7, 1)
        console.log(p);
        p = getOptionVolumeID(7, 2)
        console.log(p);
        p = getOptionVolumeID(7, 3)
        console.log(p);
    });
})