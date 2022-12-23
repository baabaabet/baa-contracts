import {ethers} from "hardhat";
import {BigNumber, Signer} from "ethers";
import {BetUpEvents, TestERC20, TestERC20WithSixDecimal} from "../typechain-types";
import {getCurrentTime} from "./hardhatEnv";
import {expect} from "chai";

type EventDetail = {
    title: string
    detail: string
    icon: string
    type: "crypto" | "sports" | "politics" | "others"
    sourceUrl: "..."
}


async function getEventsDetails() {
    // Argentina national football team
    // Croatia national football team
    let json = {
        title: "2022 Football World Cup championship prediction.",
        detail: "detail...",
        icon: "http://xxxxxxx.com",
        type: "sports",
        sourceUrl: "http://xxxxxx.com",
        options: ["Argentina", "Croatia", "Brazil"]
    }

    console.log(JSON.stringify(json))
}

type StackParam = Record<"pairID" | "resultID" | "amount", string>;

export function forkStackParam(
  pairID: string,
  resultID: string,
  amount:string
): StackParam {
    return {
        pairID,
        resultID,
        amount
    }
}

export async function getStackResult(
  _stackParams: StackParam,
  player: Signer,
  betUpEvents: BetUpEvents
): Promise< [BigNumber, BigNumber] & { amount: BigNumber; amountWithBonus: BigNumber }> {
    let playerID1 = ethers.utils
      .solidityKeccak256(
          ["uint256", "uint16", "address"],
          [_stackParams.pairID, _stackParams.resultID, await player.getAddress()]
    )
    return await betUpEvents.players(playerID1)
}

type OpenType = "crypto" | "sports" | "politics" | "others"

type OpeningParams = Record<
  "_endStackAt" | "_resolutionAt" | "_optionsQty", any> &
  Record<"_resolvers", string[]> &
  Record<"details" | "_chip" , string> &
  Record<"type", OpenType>

export async function forkOpeningParams(
  _resolvers: string[],
  _testErc20: TestERC20 | TestERC20WithSixDecimal,
  _optionsQty: number = 3,
  _endStackAt?: number,
  _resolutionAt?: number,

): Promise<OpeningParams> {

    let details = '{"title":"2022 Football World Cup championship prediction.","detail":"detail...","icon":"http://xxxxxxx.com","type":"sports","sourceUrl":"http://xxxxxx.com","options":["Argentina","Croatia","Brazil"]}';

    let __endStackAt = _endStackAt ? _endStackAt :await getCurrentTime() + 10
    let __resolutionAt = _resolutionAt ? _resolutionAt : __endStackAt + 3600

    return {
        _endStackAt:  __endStackAt,
        _resolutionAt: __resolutionAt,
        _chip: _testErc20.address,
        _optionsQty,
        _resolvers,
        details,
        type: "crypto"
    }
}

export function getPairResolveID(pairID: number, address: string): string {
    return ethers.utils.solidityKeccak256(["uint256","address"], [pairID, address])
}

export function getResultCounterID(pairID: number, resultID: number): string {
    return ethers.utils.solidityKeccak256(["uint256","uint16"], [pairID,resultID])
}

export function getPlayerID(pairID: number, resultID: number, address: string): string {
    return ethers.utils.solidityKeccak256(["uint256", "uint16", "address"], [pairID, resultID, address])
}

export function getOptionVolumeID(pairID: number, resultID: number):string {
    return ethers.utils.solidityKeccak256(["uint256", "uint16"], [pairID, resultID])
}

type ExpectClosedStatusType = {
    pairResultID: number
    resultCount: number,
    pairResolver: Array<boolean | number>
}

export async function expectCheckClosedStatus(
  betUpEvents: BetUpEvents,
  pairID: number,
  resultID: number,
  pairClosingAdmin: Signer,
  expectData: ExpectClosedStatusType
) {
    let pair = await betUpEvents.innerPairs(pairID)
    expect(pair.resultID).equal(expectData.pairResultID)

    let resultCounterID = getResultCounterID(pairID, resultID)
    let resultCount = await betUpEvents.resultCounter(resultCounterID)
    expect(resultCount).equal(expectData.resultCount)

    let pairResolverID = getPairResolveID(pairID, await pairClosingAdmin.getAddress())
    let pairResolver = await betUpEvents.pairsResolver(pairResolverID)
    expect(pairResolver).deep.equal(expectData.pairResolver)
}

/*
       @dev claim: claim the principle and the benefits
       R = (9 * P * (T-OP)) / (10 * OP)
       R = rewards
       P = player amount
       OP = the number of same result of P
       T = total volume
   */
export function calcProfit(op: BigNumber, playerAmount: BigNumber, total: BigNumber): BigNumber {
    let proportion = BigNumber.from(9).div(10)

    return (BigNumber.from(9)
      .mul(playerAmount)
      .mul(total.sub(op)))
      .div(
        BigNumber.from(10).mul(op)
      )
}

export function calcAvailableAmount(
  total: BigNumber,
  op: BigNumber,
  creationRation: number): BigNumber {
    let other = total.sub(op)
    return other.mul('10000').sub(
      other.mul(creationRation)
    ).div(
      BigNumber.from("10").mul('10000')
    )
}

export function pack(_amounts: Array<number>, count: number): BigNumber {
    let s = BigNumber.from(0)
    for(let i = 0 ; i < count; i++) {
        s = s.shl(8).or(_amounts[i])
    }
    // console.log("pack::", s.toString())
    return s
}

export function unPack(resource: BigNumber , count: number ): Array<number> {
    let arr = []
    for(let  i = 0; i < count; i++) {
        let tmep = resource.shr(
          8 * i
        ).and("0xff").toNumber()

        arr.push(tmep)
    }

    return arr.reverse();
}