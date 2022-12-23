// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.14;

import  "../lib/openzeppelin-contracts-upgradeable/contracts/proxy/utils/Initializable.sol";
import  "../lib/openzeppelin-contracts-upgradeable/contracts/proxy/utils/UUPSUpgradeable.sol";
import  "../lib/openzeppelin-contracts-upgradeable/contracts/access/AccessControlUpgradeable.sol";

import "./interface/IBetStruct.sol";
import "./interface/IERC20BurnAndMintUpgradeable.sol";

contract BetUpCore is Initializable, UUPSUpgradeable, AccessControlUpgradeable {
    bytes32 public constant REWARD_MANAGER = keccak256("REWARD_MANAGER_ROLE");
    bytes32 public constant RECORD_MANAGER = keccak256("RECORD_MANAGER_ROLE");
    bytes32 public constant PARAMS_MANAGER = keccak256("PARAMS_MANAGER_ROLE");

    address public daoAddress;

    // @dev the level of reward coefficient :
    // [
    //  875000000000000000,1275000000000000000,1605000000000000000,
    //  1998250000000000000,2464100000000000000,3013137500000000000,
    //  3657341500000000000,4410254925000000000,5287177620000000000,
    //  6305382304750000000
    // ]
    uint256[] public rewardCoefficient;

    mapping(address => IBetStruct.PlayerRecord) public playerRecords;

    mapping(uint8 => uint256) public rewardRatio;

    // @dev mapping from the count of mint to the number of `{}`
    // count- [30, 15, 15, 15,15, 15,15,15,15,15]
    // amount- [2000,1000,1000,1000,1000,1000,1000,1000,1000,1000] (amount * 10 ** 6)
    mapping(uint256 => IBetStruct.MintCondition) public mintCondition;

    // @dev mapping from level to the number of `upgrade condition`
    // count- [30,45,68,102,153,230,345,518,777,1166]
    // amount- [1000,3000,9000,35000,136500,408000,1210000,3653000,11538000] (amount * 10 ** 18)
    mapping(uint256 => IBetStruct.MintCondition) public upgradeConditionToLevel;

    // @dev  two decimals
    uint256 winRatio;
    // @dev two decimals
    uint256 loseRatio;


    // @dev add or update the `_amount` of  `stackedAmountToLevel[index]`
    function setMintCondition(
        uint256[] memory _count,
        IBetStruct.MintCondition[] memory _condition
    ) external onlyRole(PARAMS_MANAGER) {
        require(_count.length == _condition.length, "length not match");
        for(uint256 i = 0; i < _count.length; i++) {
            uint256 count = _count[i];
            mintCondition[count].count =  _condition[i].count;
            mintCondition[count].amount = _condition[i].amount;
        }
    }

    function setUpgradeConditionToLevel(
        uint8[] memory _levels,
        IBetStruct.MintCondition[] memory _condition
    ) external onlyRole(PARAMS_MANAGER) {
        require(_levels.length == _condition.length, "length not match");
        for(uint256 i = 0; i < _levels.length; i++) {
            uint8 level = _levels[i];
            upgradeConditionToLevel[level].count = _condition[i].count;
            upgradeConditionToLevel[level].amount = _condition[i].amount;
        }
    }

    function calcUpgradeAmount(
        uint256 _beforeLevel,
        uint256 _afterLevel
    ) external view returns(uint256, uint256){
        if(_beforeLevel == _afterLevel) return (0,0);

        uint256 total = 0;
        uint256 count = upgradeConditionToLevel[_afterLevel].count - upgradeConditionToLevel[_beforeLevel].count;
        for(uint256 i = _beforeLevel+ 1; i <= _afterLevel; i++) {
            total += upgradeConditionToLevel[i].amount;
        }

        return  (count, total * 10 ** 18);
    }

    function calcMintAmount(
        uint256 _beforeMintedAmount,
        uint256 _afterMintedAmount
    ) external view returns(uint256, uint256){
        uint256 count = 0;
        uint256 totalAmount = 0;

        for(uint256 i = _beforeMintedAmount+1; i <= _afterMintedAmount; i++) {
            IBetStruct.MintCondition memory condition = mintCondition[i];
            count += condition.count;
            totalAmount += condition.amount;
        }
        return (count, totalAmount * 10 ** 6);
    }

    function updateDaoAddress(address _addr) external onlyRole(DEFAULT_ADMIN_ROLE) {
        daoAddress = _addr;
    }

    /*
        factor: 1+ rewardCoefficient x( level - 1)
        increase 0.25 rewardCoefficient each level
        win will get [ 1+ rewardCoefficient x(level -1)] * 1.25
        lose will get [ 1+ rewardCoefficient x(level-1)] * 0.5
        @return (win per, lose per)
  */
    function calcDaoAmountPerUnit(uint256 _level) external view returns(uint256, uint256) {
        if(_level == 0) { return (0,0);}
        uint256 number =  rewardCoefficient[_level-1];
        uint256 win =  _level == 1 ? 1e18 : winRatio  * number / 100;
        return (win, loseRatio * number / 100);
    }

    function updateRewardCoefficient(uint256[] memory _rewardCoefficients) external onlyRole(REWARD_MANAGER)  {
        require(_rewardCoefficients.length > 0, "Invalid length");
        for(uint256 i = 0; i < _rewardCoefficients.length; i++) {
            rewardCoefficient[i]  = _rewardCoefficients[i];
        }
    }

    function calcIncentiveBonus(uint64 _startTime, uint64 _endTime, uint256 _amount) external view returns(uint256 bonus) {
        return _calcIncentiveBonus(_startTime, _endTime, _amount);
    }

    function _calcIncentiveBonus(uint64 _startTime, uint64 _endTime, uint256 _amount) internal view returns(uint256 bonus) {
        uint64 span = _endTime - _startTime;
        uint64 current = uint64(block.timestamp);

        if(current <= _startTime + span / 6) {
            bonus = rewardRatio[1] * _amount / 10;
        }else if(current < _startTime + span / 2) {
            bonus = rewardRatio[2] * _amount / 10;
        }else {
            bonus = _amount;
        }

        return bonus;
    }

    function setPlayerRecord(address _player, uint256 _amount, uint256 _decimal) external onlyRole(RECORD_MANAGER) {
        playerRecords[_player].cumulative++;

        uint256 __amount = _decimal > 6 ? _amount / 10 ** (_decimal-6) : _amount;
        playerRecords[_player].accAmount += __amount;
    }

    function recordPlayerConsumption(address _player, uint256 _consumptionCount) external onlyRole(RECORD_MANAGER) {
        playerRecords[_player].consumption += _consumptionCount;
    }

    function setRewardRatio(uint8 _index, uint256 _ratio) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_ratio > 0, "invalid ratio");
        rewardRatio[_index] = _ratio;
    }

    function _authorizeUpgrade(address) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}

    function initialize(
        address _daoAddress,
        uint256[] memory _rewardCoefficient
    ) external initializer {
        __AccessControl_init();
        __UUPSUpgradeable_init();
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);

        daoAddress = _daoAddress;

        for(uint256 i = 0 ; i < _rewardCoefficient.length; i++) {
            uint256 f = _rewardCoefficient[i];
            require(f > 0, "Invalid _rewardCoefficient");
            rewardCoefficient.push(f);
        }

        rewardRatio[1] = 10;
        rewardRatio[2] = 10;
        rewardRatio[3] = 10;

        winRatio = 125;
        loseRatio = 50;
    }

}