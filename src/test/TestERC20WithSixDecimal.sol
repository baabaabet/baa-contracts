// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.14;

import "../../lib/openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";

contract TestERC20WithSixDecimal is ERC20 {

    constructor(string memory name_, string memory symbol_) ERC20(name_,symbol_) {}

    function mint(address account, uint256 amount) external {
        _mint(account, amount);
    }

    function giveMeTestCoin() external {
        _mint(msg.sender, 10000 * 10 **6);
    }

    function decimals() public view virtual override returns (uint8) {
        return 6;
    }
}