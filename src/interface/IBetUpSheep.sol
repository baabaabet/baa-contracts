// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.14;

interface IBetUpSheep {
    function getMaxLevel(address _address) external view returns(uint256);
    function playersSnapshot(address _address) external view returns(uint256);
    function getLastIndexBits(uint256 x) external pure returns(uint256);
    function checkMaxLevel(uint256 _maxLevel, address _account) external view returns(bool result);
}