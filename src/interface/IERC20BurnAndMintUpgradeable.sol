// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.0;

//import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "../../lib/openzeppelin-contracts-upgradeable/contracts/token/ERC20/IERC20Upgradeable.sol";

/**
 * @dev Interface for the optional metadata functions from the ERC20 standard.
 *
 * _Available since v4.1._
 */
interface IERC20BurnAndMintUpgradeable is IERC20Upgradeable {
    /**
     * @dev Returns the name of the token.
     */
    function name() external view returns (string memory);

    /**
     * @dev Returns the symbol of the token.
     */
    function symbol() external view returns (string memory);

    /**
     * @dev Returns the decimals places of the token.
     */
    function decimals() external view returns (uint8);

    function mint(address account, uint256 amount) external;

    function burn(uint256 amount) external;

    function transferOwnership(address newOwner) external;
}
