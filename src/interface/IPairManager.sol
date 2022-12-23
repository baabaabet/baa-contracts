// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.14;
import "./IBetStruct.sol";

interface IPairManager {

    function pairsConfig(uint256 _pairId) external view returns(IBetStruct.PairConfig memory);

    function pairCount() external view returns(uint256);

    function accChips(address) external view returns(uint256);

    function pairsCR(uint256 _pairId, uint64 _counter) external view returns(IBetStruct.PairsCRound memory);

    function setRTotal(uint256 _id, uint64 _counter, uint256 _amount, uint256 _bonusAmount) external;

    function setFTotal(uint256 _id, uint64 _counter, uint256 _amount, uint256 _bonusAmount) external;

    function setAccChip(address _chip, uint256 _amount) external;
}