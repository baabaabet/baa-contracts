// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.14;


interface IBetStruct {
    struct PairsCRound {
        // @dev Opening price
        uint128 oPrice;
        // @dev Closing price
        uint128 cPrice;
        // @dev The total number of the guessing up bet of a round
        uint256 rTotal;
        // @dev The total number of the guessing down bet of a round
        uint256 fTotal;
        // @dev The period of postpone of start stack
        uint32 sInterval;
        // @dev The period of lock staking
        uint32 eInterval;
        // @dev The opening time of the pair of a round
        uint64 oTime;
        // @dev The closing time of the pair of a round
        uint64 cTime;
        // @dev The total number of rise direction bonus
        uint256 rTotalBonus;
        // @dev The total number of fall direction bonus
        uint256 fTotalBonus;
    }

    struct RewardType {
        uint256 refund;
        uint256 rewardDao;
    }

    struct PlayerRound {
        uint256 riseAmount;
        uint256 fallAmount;
        uint256 rIncentiveAmount;
        uint256 fIncentiveAmount;
    }

    struct PairConfig {
        bytes32 pairName;
        address chip;
        uint8 status;  // 0- non-existence 1 -activated 2- unactivated
        uint64 counter; // pair counter MAX counter is 2^64-1 (start from 0 to which means the next to be closed counter order)
    }

    struct PlayerRecord {
        uint256 consumption;
        uint256 cumulative;
        uint256 accAmount; // @dev the number of the accumulation of stacked amount
    }

    struct MintCondition {
        uint16 count;  // @dev the time of mint
        uint64 amount; // @dev the number of dao (amount * 10 ^ 18) for upgradeCondition
        // @dev the number of accumulated amount of stake for mintCondition
    }

}