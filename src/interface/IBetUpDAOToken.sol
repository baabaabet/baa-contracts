// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.14;


interface IBetUpDAOToken {
    function mint(address _account, uint256 _amount) external;
    function burn(address _account, uint256 _amount) external;
    function balanceOf(address account) external view  returns (uint256);
    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}