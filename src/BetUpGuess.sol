// SPDX-License-Identifier: Apache-2.0

///////////////////////////////////////////////////////////////////////
//                                                                   //
//    ____       _     _    _          _____                         //
//   |  _ \     | |   | |  | |        / ____|                        //
//   | |_) | ___| |_  | |  | |_ __   | |  __  __ _ _ __ ___   ___    //
//   |  _ < / _ \ __| | |  | | '_ \  | | |_ |/ _` | '_ ` _ \ / _ \   //
//   | |_) |  __/ |_  | |__| | |_) | | |__| | (_| | | | | | |  __/   //
//   |____/ \___|\__|  \____/| .__/   \_____|\__,_|_| |_| |_|\___|   //
//                           | |                                     //
//                           |_|                                     //
//                                                                   //
/////////////////////// @Here we are //////////////////////////////////

pragma solidity ^0.8.14;

import  "../lib/openzeppelin-contracts-upgradeable/contracts/proxy/utils/Initializable.sol";
import  "../lib/openzeppelin-contracts-upgradeable/contracts/proxy/utils/UUPSUpgradeable.sol";
import  "../lib/openzeppelin-contracts-upgradeable/contracts/access/AccessControlUpgradeable.sol";
import  "../lib/openzeppelin-contracts-upgradeable/contracts/token/ERC20/extensions/IERC20MetadataUpgradeable.sol";
import  "../lib/openzeppelin-contracts-upgradeable/contracts/token/ERC20/utils/SafeERC20Upgradeable.sol";
import  "../lib/openzeppelin-contracts-upgradeable/contracts/security/PausableUpgradeable.sol";

import "./interface/IBetUpSheep.sol";
import "./interface/IBetUpDAOToken.sol";
import "./interface/IBetStruct.sol";
import "./interface/IPairManager.sol";
import "./interface/IBetUpCore.sol";

contract BetUpGuess is Initializable, UUPSUpgradeable, AccessControlUpgradeable, PausableUpgradeable  {
    using SafeERC20Upgradeable for IERC20MetadataUpgradeable;

    bytes32 public constant FEE_MANAGER = keccak256("FEE_MANAGER_ROLE");

    address public betUpCoreAddress;
    address public sheepAddress;
    address public daoTokenAddress;
    address public pairManagerAddress;

    // @dev bytes32( player address,pairID, counter)
    mapping(bytes32 => IBetStruct.PlayerRound) private _players;

    struct WithdrawType {
        uint256 rewards;
        uint256 accAmount;
        uint256[] accList;
        uint256[] rewardList;
    }

    event StackEvent(
        uint256 indexed id,
        uint256 indexed counter,
        address indexed player,
        uint8 direction,
        uint256 amount
    );

    event WithdrawEvent(
        uint256[] ids,
        uint64[] counter,
        uint256[] result,
        uint256[] accList,
        uint256[] rewardList
    );

    event DistributeEvent(
        address[] chips,
        uint256[] amounts
    );

    //============================ query function ===================================

    function players(address _player, uint256 _pairId, uint64 _counter) external view returns(IBetStruct.PlayerRound memory){
        return _players[
        keccak256(
            abi.encodePacked(
                _player,
                _pairId,
                _counter
            )
        )
        ];
    }

    function getRewardOf(
        uint256 _id,
        uint64 _counter,
        address _receiver,
        uint256 _result,
        uint256 _maxLevel
    ) external view returns(IBetStruct.RewardType memory reward){
        IBetStruct.PairsCRound memory pcr =  IPairManager(pairManagerAddress).pairsCR(_id, _counter);
        IBetStruct.PlayerRound memory player = _players[keccak256(abi.encodePacked(_receiver, _id, _counter))];

        if( block.timestamp > pcr.cTime - pcr.eInterval
            && (pcr.fTotal == 0 && pcr.rTotal > 0 || pcr.fTotal > 0 && pcr.rTotal == 0)) {
            reward.refund = _result == 1 ? player.riseAmount : player.fallAmount;
            return reward;
        }else {
            return _calcReward(
                pcr,
                player,
                _result,
                _receiver,
                IPairManager(pairManagerAddress).pairsConfig(_id).chip,
                _maxLevel
            );
        }

    }



    //============================ transaction function ===================================
    // special name for gas optimize
    // @dev _direction 1-rise 2-fall
    function trystack(uint256 _id, uint256 _amount, uint8 _direction) external {
        require(_amount > 0, 'Invalid amount');
        require(_direction == 1 || _direction == 2, "Invalid _direction");

        IPairManager ipm = IPairManager(pairManagerAddress);
        require(_id > 0 && _id <= ipm.pairCount(), "Out of length");

        IBetStruct.PairConfig memory _pairConfig = ipm.pairsConfig(_id);
        uint64 counter = _pairConfig.counter;

        IBetStruct.PairsCRound memory pcr =  IPairManager(pairManagerAddress).pairsCR(_id, counter);
        require(pcr.oPrice > 0 && pcr.cPrice == 0, "Invalid pair");

        uint64 startStackTime = pcr.oTime + pcr.sInterval;
        uint64 endStackTime = pcr.cTime - pcr.eInterval;

        require(block.timestamp > startStackTime && block.timestamp < endStackTime , "Timeout");

        IBetStruct.PlayerRound storage player =  _players[keccak256(abi.encodePacked(msg.sender,_id,counter))];

        unchecked {
            uint256 bonus = IBetUpCore(betUpCoreAddress).calcIncentiveBonus(startStackTime, endStackTime, _amount);

            if(_direction == 1) {
                player.rIncentiveAmount += bonus;
                player.riseAmount += _amount;
                IPairManager(pairManagerAddress).setRTotal(_id, counter, pcr.rTotal + _amount, bonus);
            }else {
                player.fIncentiveAmount += bonus;
                player.fallAmount += _amount;
                IPairManager(pairManagerAddress).setFTotal(_id, counter, pcr.fTotal + _amount, bonus);
            }

        }

        IERC20MetadataUpgradeable(_pairConfig.chip).safeTransferFrom(msg.sender, address(this), _amount);
        emit StackEvent(_id, counter, msg.sender, _direction, _amount);

        uint256 decimal =  IERC20MetadataUpgradeable(_pairConfig.chip).decimals();
        IBetUpCore(betUpCoreAddress).setPlayerRecord(msg.sender, _amount, decimal);

    }

    function withdraw(
        uint256 _maxLevel,
        uint256[] memory _ids,
        uint64[] memory _counter,
        uint256[] memory _result // 1- rise 2- fall
    ) external whenNotPaused {
        require(
            _ids.length == _counter.length &&
            _ids.length == _result.length,
            "Invalid length"
        );

        WithdrawType memory wt = WithdrawType(0,0,new uint256[](_ids.length),new uint256[](_ids.length));
        address sender = msg.sender;

        for(uint256 i = 0; i < _ids.length; i++) {
            uint64 counter = _counter[i];
            uint256 pairId = _ids[i];
            uint256 result = _result[i];

            require(result == 1 || result == 2, "Invalid result");
            IBetStruct.RewardType memory reward = _withdraw(pairId, counter, result, _maxLevel);

            wt.rewardList[i] = reward.rewardDao;
            wt.accList[i] = reward.refund;
            wt.rewards += reward.rewardDao;

            IERC20MetadataUpgradeable(
                IPairManager(pairManagerAddress).pairsConfig(pairId).chip
            ).safeTransfer(sender, reward.refund);

        }

        if(wt.rewards > 0) {
            IBetUpDAOToken(daoTokenAddress).mint(msg.sender, wt.rewards);
        }

        emit WithdrawEvent(_ids, _counter, _result, wt.accList, wt.rewardList);
    }

    //============================ admin function ===================================
    function withdrawFee(address[] memory _chips) external onlyRole(FEE_MANAGER) {
        uint256[] memory amounts = new uint256[](_chips.length);

        for(uint256 i = 0; i < _chips.length; i++) {
            address chip = _chips[i];
            uint256 amount = IPairManager(pairManagerAddress).accChips(chip);
            amounts[i] = amount;
            if(amount > 0) {
                IPairManager(pairManagerAddress).setAccChip(chip, 0);
                IERC20MetadataUpgradeable(chip).safeTransfer(msg.sender, amount);
            }
        }

        emit DistributeEvent(_chips, amounts);
    }

    function updateSheepAddress(address _address) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_address != address(0), "Invalid address");
        sheepAddress = _address;
    }

    function updateDaoTokenAddress(address _address) external onlyRole(DEFAULT_ADMIN_ROLE) {
        daoTokenAddress = _address;
    }

    function updateCoreAddress(address _address) external onlyRole(DEFAULT_ADMIN_ROLE) {
        betUpCoreAddress = _address;
    }

    // =============================== private/internal function ================================
    function _withdraw(
        uint256 pairId,
        uint64 counter,
        uint256 result,
        uint256 _maxLevel
    ) private returns(IBetStruct.RewardType memory reward ) {
        IBetStruct.PairsCRound memory pcr =  IPairManager(pairManagerAddress).pairsCR(pairId, counter);
        IBetStruct.PlayerRound storage player = _players[keccak256(abi.encodePacked(msg.sender, pairId, counter))];

        if( block.timestamp > pcr.cTime - pcr.eInterval
            && (pcr.fTotal == 0 && pcr.rTotal > 0 || pcr.fTotal > 0 && pcr.rTotal == 0)) {
            reward.refund = result == 1 ? player.riseAmount : player.fallAmount;

        }else if(pcr.oPrice > 0 && pcr.cPrice > 0) {
            reward = _calcReward (
                pcr,
                player,
                result,
                msg.sender,
                IPairManager(pairManagerAddress).pairsConfig(pairId).chip,
                _maxLevel
            );

        } else {
            revert("Not yet end");
        }

        if(result == 1) {
            player.riseAmount = 0;
        }else if(result == 2) {
            player.fallAmount = 0;
        }

        return reward;
    }

    function _calcReward(
        IBetStruct.PairsCRound memory _pcr,
        IBetStruct.PlayerRound memory _player,
        uint256 _result,
        address _account,
        address _chip,
        uint256 _maxLevel
    )
    private view returns(IBetStruct.RewardType memory reward)
    {
        require(IBetUpSheep(sheepAddress).checkMaxLevel(_maxLevel, _account), "Invalid _maxLevel");

        (uint256 winPer, uint256 losePer) = IBetUpCore(betUpCoreAddress).calcDaoAmountPerUnit(_maxLevel);

        uint256 riseAmount = _player.riseAmount;
        uint256 fallAmount = _player.fallAmount;
        uint256 _chipDecimal = IERC20MetadataUpgradeable(_chip).decimals();

        if(_pcr.oPrice == _pcr.cPrice) {
            if(_result == 1) {
                reward.refund = riseAmount;
            }else if (_result == 2) {
                reward.refund = fallAmount;
            }
        }else if(_pcr.oPrice < _pcr.cPrice) {

            if(riseAmount > 0 && _result == 1) {
                reward.refund = _player.riseAmount + _player.rIncentiveAmount * _pcr.fTotal * 9 / (_pcr.rTotalBonus * 10);
                reward.rewardDao = winPer * riseAmount / 10 ** _chipDecimal;

            }else if(fallAmount > 0 && _result == 2) {

                if(_pcr.rTotal == 0) { reward.refund = fallAmount;}
                reward.rewardDao = losePer * fallAmount / 10 ** _chipDecimal;
            }


        }else if(_pcr.oPrice > _pcr.cPrice) {

            if(fallAmount > 0 && _result == 2 ) {

                reward.refund =  _player.fallAmount + _player.fIncentiveAmount * _pcr.rTotal * 9 / (_pcr.fTotalBonus * 10);
                reward.rewardDao = winPer * fallAmount / 10 ** _chipDecimal;

            } else if( riseAmount > 0 && _result == 1) {

                if(_pcr.fTotal == 0) { reward.refund = riseAmount; }
                reward.rewardDao = losePer * riseAmount / 10 ** _chipDecimal;
            }

        }
        return reward;
    }



    function _authorizeUpgrade(address) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}

    function initialize(
        address _betUpCoreAddress,
        address _sheepAddress,
        address _daoTokenAddress,
        address _pairManagerAddress
    ) external initializer {
        require(_sheepAddress != address(0), "Invalid address");
        require(_daoTokenAddress != address(0), "Invalid address");
        require(_pairManagerAddress != address(0), "Invalid address");
        __AccessControl_init();
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        __UUPSUpgradeable_init();
        __Pausable_init();

        betUpCoreAddress = _betUpCoreAddress;
        sheepAddress = _sheepAddress;
        daoTokenAddress = _daoTokenAddress;
        pairManagerAddress = _pairManagerAddress;
    }
}