import {expect} from "chai";
import {
    BetUpCore,
    BetUpDAOToken,
    BetUpSheep,
    FreeMintOfSheep,
    TestERC20,
    TestERC20WithSixDecimal
} from "../../typechain-types";
import {beforeEach} from "mocha";
import {
    setCoreConfig,
    test_deploy_betBetUpCore,
    test_deploy_betUpDaoToken,
    test_deploy_betUpSheep, test_deploy_freeMintOfSheep,
    test_deploy_testErc20,
    test_deploy_testErc20WithSixDecimal
} from "../deployer";
import {ethers} from "hardhat";
import {BigNumber, Signer} from "ethers";
import {pack, unPack} from "../common";


describe("BetUpSheep.spec.ts", function () {
    let testERC20: TestERC20;
    let testERC20WithSixDecimal: TestERC20WithSixDecimal;
    let betUpSheep: BetUpSheep;
    let betUpDAOToken: BetUpDAOToken;
    let betUpCore: BetUpCore;

    // roles
    let defaultAdmin: Signer;

    // players
    let p1: Signer;
    let p2: Signer;
    let p3: Signer;

    beforeEach(async () => {
        const signers = await ethers.getSigners()
        // @dev signers[0] is the default deployer to all contracts
        defaultAdmin = signers[0]
        // @dev players
        p1 = signers[7];
        p2 = signers[8];
        p3 = signers[9];
    })

    beforeEach(async () => {
        testERC20 = await test_deploy_testErc20()
        testERC20WithSixDecimal = await test_deploy_testErc20WithSixDecimal()
        betUpDAOToken = await test_deploy_betUpDaoToken()
        betUpCore = await test_deploy_betBetUpCore(betUpDAOToken)
        betUpSheep = await test_deploy_betUpSheep(betUpDAOToken, betUpCore)
    })


    beforeEach( async () => {
        await setCoreConfig(betUpCore, defaultAdmin)
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

    it('testFailed:: freeMint with an unauthorized account', async () => {
        let hasRole= await betUpSheep.hasRole(await betUpSheep.FREE_MINT_ROLE(), await p1.getAddress())
        expect(hasRole).equal(false)
        await expect( betUpSheep.connect(p1).createCard(1,[1,1,1]))
          .revertedWith("condition is not met")
    });

    it('test:: free mint with an authorized account which is an EOA ', async () => {
        await betUpSheep.grantRole(await betUpSheep.FREE_MINT_ROLE(), await p1.getAddress() )

        let amount = 1
        let fixedItems = [1,2,1]
        await betUpSheep.connect(p1).createCard(amount, fixedItems)
        let tokenId = amount
        let owner = await betUpSheep.ownerOf(tokenId)
        expect(owner).equal(await p1.getAddress())

        let level = await betUpSheep.getTokenIdLevel(tokenId)
        expect(level).equal(1)

        let serial = await betUpSheep.getSerialsOf(tokenId)

        let  unpacked = unPack(serial[0].serial, serial[0].categoryAmount.toNumber())
        expect(unpacked.slice(0,3)).deep.equal(fixedItems)

        let numberMinted = await betUpSheep.numberMinted(await p1.getAddress())
        expect(numberMinted).equal(1)
    });

    it('test:: batch mint', async () => {
        await betUpSheep.grantRole(await betUpSheep.FREE_MINT_ROLE(), await p1.getAddress() )

        let amount = 10
        let fixedItems = [1,2,1]
        await betUpSheep.connect(p1).createCard(amount, fixedItems)
        for(let i = 1; i <= amount; i++) {
            let tokenId = i
            let owner = await betUpSheep.ownerOf(tokenId)
            expect(owner).equal(await p1.getAddress())
            let level = await betUpSheep.getTokenIdLevel(tokenId)
            expect(level).equal(1)
            let serial = await betUpSheep.getSerialsOf(tokenId)
            let  unpacked = unPack(serial[0].serial, serial[0].categoryAmount.toNumber())
            expect(unpacked.slice(0,3)).deep.equal(fixedItems)
        }

    });

})