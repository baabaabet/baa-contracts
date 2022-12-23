import {BetUpCore, BetUpDAOToken} from "../../typechain-types";
import {test_deploy_betBetUpCore, test_deploy_betUpDaoToken} from "../deployer";
import {expect} from "chai"
import {fastTimeAt, getCurrentTime} from "../hardhatEnv";
import {BigNumber, Signer} from "ethers";
import {beforeEach} from "mocha";
import {ethers} from "hardhat";
import {IBetStruct} from "../../typechain-types/src/BetUpCore";

describe("BetUpCore.spec.ts", function() {
    let betUpCore: BetUpCore;
    let betUpDAOToken: BetUpDAOToken;
    // roles
    let defaultAdmin: Signer;

    beforeEach(async () => {
        const signers = await ethers.getSigners()
        defaultAdmin = signers[0]
    })

    beforeEach(async () => {
        betUpDAOToken = await test_deploy_betUpDaoToken()
        betUpCore = await test_deploy_betBetUpCore(betUpDAOToken)
    })

    beforeEach(async () => {
        await betUpCore.grantRole(
          await betUpCore.PARAMS_MANAGER(),
          await defaultAdmin.getAddress()
        )
    })

    it('test:: setRewardRatio:: set reward ratio to three   ', async function () {
        let ratios = [15, 13, 10]
        await betUpCore.setRewardRatio(1, ratios[0])
        await betUpCore.setRewardRatio(2, ratios[1])
        await betUpCore.setRewardRatio(3, ratios[2])

        let ratio1 = await betUpCore.rewardRatio(1)
        let ratio2 = await betUpCore.rewardRatio(2)
        let ratio3 = await betUpCore.rewardRatio(3)
        expect(ratio1).equal(ratios[0])
        expect(ratio2).equal(ratios[1])
        expect(ratio3).equal(ratios[2])

        let currentTime = await getCurrentTime()
        let startTime = currentTime
        let endTime = currentTime + 3000

        await fastTimeAt(startTime+300)
        let bonus1 = await betUpCore.calcIncentiveBonus(startTime,endTime, 1000)
        expect(bonus1).equal(1500)

        await fastTimeAt(startTime + 600)
        let bonus2 = await betUpCore.calcIncentiveBonus(startTime,endTime, 1000)
        expect(bonus2).equal(1300)

        await fastTimeAt(startTime + 1600)
        let bonus3= await betUpCore.calcIncentiveBonus(startTime,endTime, 1000)
        expect(bonus3).equal(1000)

    });

    function formatValue(num: number) {
        return BigNumber.from(num).mul(
          BigNumber.from(10).pow(18)
        )
    }

    it('test:: calcDaoAmountPerUnit ', async () => {
        await betUpCore.grantRole(await betUpCore.REWARD_MANAGER(), await defaultAdmin.getAddress() )

        let f = [
            "875000000000000000",
            "1275000000000000000",
            "1605000000000000000",
            "1998250000000000000",
            "2464100000000000000",
            "3013137500000000000",
            "3657341500000000000",
            "4410254925000000000",
            "5287177620000000000",
            "6305382305000000000"
        ]

        await betUpCore.updateRewardCoefficient(f)
        // await betUpCore.updateRewardCoefficient(1, f[1])
        // await betUpCore.updateRewardCoefficient(2, f[2])
        // await betUpCore.updateRewardCoefficient(3, f[3])
        // await betUpCore.updateRewardCoefficient(4, f[4])
        // await betUpCore.updateRewardCoefficient(5, f[5])
        // await betUpCore.updateRewardCoefficient(6, f[6])
        // await betUpCore.updateRewardCoefficient(7, f[7])
        // await betUpCore.updateRewardCoefficient(8, f[8])
        // await betUpCore.updateRewardCoefficient(9, f[9])

        let per = await betUpCore.calcDaoAmountPerUnit(1)
        console.log(per);
        per = await betUpCore.calcDaoAmountPerUnit(2)
        console.log(per);
        per = await betUpCore.calcDaoAmountPerUnit(3)
        console.log(per);
        per = await betUpCore.calcDaoAmountPerUnit(4)
        console.log(per);
        per = await betUpCore.calcDaoAmountPerUnit(5)
        console.log(per);
        per = await betUpCore.calcDaoAmountPerUnit(6)
        console.log(per);
        per = await betUpCore.calcDaoAmountPerUnit(7)
        console.log(per);
        per = await betUpCore.calcDaoAmountPerUnit(8)
        console.log(per);
        per = await betUpCore.calcDaoAmountPerUnit(9)
        console.log(per);
        per = await betUpCore.calcDaoAmountPerUnit(10)
        console.log(per);
    });

    it('test:: setMintCondition ', async () => {
        let index = [1,2,3,4,5,6,7,8,9,10]
        let condition =  [[30,2000],[15,1000],[15,1000],[15,1000],[15,1000],[15,1000],[15,1000],[15,1000],[15,1000],[15,1000]]

        let _condition = []
        condition.forEach(value => {
            _condition.push(
              {
                  count: value[0],
                  amount: value[1]
              }
            )
        })
        await betUpCore.setMintCondition(index, _condition as any)

        index.map(async (v,i) => {
            let condition = await betUpCore.mintCondition(i)
            // console.log(condition);
        })
    });

    it('test:: setUpgradeConditionToLevel ', async () => {
        let index = [2,3,4,5,6,7,8,9,10]
        let condition =  [[45,11000],[68,23000],[102,44000],[153,82000],[230,150000],[345,420000],[518,760000],[777,1370000],[1166,2500000]]
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
    });
})