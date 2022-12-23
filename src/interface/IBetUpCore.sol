// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.14;

import "./IBetStruct.sol";

interface  IBetUpCore {
    function calcDaoAmountPerUnit(uint256) external view returns(uint256, uint256);
    function setPlayerRecord(address, uint256,uint256) external;
    function playerRecords(address) external view returns(IBetStruct.PlayerRecord memory);
    function calcIncentiveBonus(uint64, uint64, uint256) external view returns(uint256);
    function recordPlayerConsumption(address _player, uint256 _consumptionCount) external;
    function mintCondition(uint256 count) external view returns(IBetStruct.MintCondition memory);
    function upgradeConditionToLevel(uint256 level) external view returns(IBetStruct.MintCondition memory);
    function calcUpgradeAmount(
        uint256 _beforeLevel,
        uint256 _afterLevel
    ) external view returns(uint256, uint256);
    function calcMintAmount(
        uint256 _beforeMintedAmount,
        uint256 _afterMintedAmount
    ) external view returns(uint256, uint256);
}