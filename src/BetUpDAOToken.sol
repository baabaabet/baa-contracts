// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.14;
import  "../lib/openzeppelin-contracts-upgradeable/contracts/proxy/utils/Initializable.sol";
import  "../lib/openzeppelin-contracts-upgradeable/contracts/proxy/utils/UUPSUpgradeable.sol";
import  "../lib/openzeppelin-contracts-upgradeable/contracts/access/AccessControlUpgradeable.sol";
import  "../lib/openzeppelin-contracts-upgradeable/contracts/token/ERC20/extensions/ERC20VotesUpgradeable.sol";

contract BetUpDAOToken is Initializable, UUPSUpgradeable, AccessControlUpgradeable, ERC20VotesUpgradeable {

    bytes32 public constant MINT_MANAGER = keccak256("MINT_MANAGER_ROLE");

    function mint(address _account, uint256 _amount) external onlyRole(MINT_MANAGER) {
        require(_account != address(0), "Invalid account");
        require(_amount > 0, "Invalid amount");

        _mint(_account, _amount);
    }

    function burn(uint256 _amount) external {
        require(_amount > 0, "Invalid amount");
        _burn(msg.sender, _amount);
    }

    bytes32 private constant _DELEGATION_TYPEHASH =
    keccak256("Delegation(address delegatee,uint256 nonce,uint256 expiry)");

    function _authorizeUpgrade(address) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}

    function initialize() external initializer {
        __AccessControl_init();
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        __UUPSUpgradeable_init();
        __ERC20_init("BaaBaaDao", "BAA");
        __ERC20Permit_init("BaaBaaDao");
    }
}