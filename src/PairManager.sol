// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.14;

import  "../lib/openzeppelin-contracts-upgradeable/contracts/proxy/utils/Initializable.sol";
import  "../lib/openzeppelin-contracts-upgradeable/contracts/proxy/utils/UUPSUpgradeable.sol";
import  "../lib/openzeppelin-contracts-upgradeable/contracts/access/AccessControlUpgradeable.sol";
import  "../lib/openzeppelin-contracts-upgradeable/contracts/token/ERC20/extensions/IERC20MetadataUpgradeable.sol";

import "./interface/IBetStruct.sol";

contract PairManager is Initializable, UUPSUpgradeable, AccessControlUpgradeable {
    bytes32 public constant PAIR_MANAGER = keccak256("PAIR_MANAGER_ROLE");
    bytes32 public constant OPEN_MANAGER =  keccak256("OPEN_MANAGER_ROLE");
    bytes32 public constant CLOSE_MANAGER =  keccak256("CLOSE_MANAGER_ROLE");
    bytes32 public constant PAIRCR_MANAGER =  keccak256("PAIRCR_MANAGER_ROLE");

    // @dev amount of open manager
    uint256 public closeManagers;

    // @dev split pair property cause which is more save gas
    // @dev pair name => chip address => pair id
    mapping(bytes32 => mapping(address => uint256)) public pairIds;

    // @dev pair id => counter => pairsRound
    mapping(uint256 => mapping(uint64 => IBetStruct.PairsCRound)) public pairsCR;

    // chip address => accumulate amount
    mapping(address => uint256) public accChips;

    // @Dev bytes32(pairID,counter,hash) => PairSignature
    mapping(bytes32 => PairSignature) closeSignatures;

    // @dev store pair name and corresponding chip
    IBetStruct.PairConfig[] private _pairsConfig;

    struct ClosingData {
        uint256[] ids;
        uint128[] cPrices;
        uint128[] nextOPrice;
        uint64[] nextOTimes;
        uint32[] nextPeriodSeconds;
        uint32[] nextSIntervalsSeconds;
        uint32[] nextEIntervalsSeconds;
    }

    struct PairSignature {
        // Cumulative number of hash submissions
        uint8 hashAmount;
        mapping( address => bool) hasSigned;
    }

    event AddPairsEvent(
        IBetStruct.PairConfig[] pairs
    );

    event EditPairsEvent(
        uint256[] ids
    );

    event OpenEvent(
        uint256[] ids,
        uint256[] counters
    );

    event CloseEvent(
        uint256[]  ids,
        uint256[]  counters
    );

    // ======================== query function ===================================

    function pairCount() external view returns(uint256) {
        return _pairsConfig.length;
    }

    function pairsConfig(uint256 _pairId) external view returns(IBetStruct.PairConfig memory) {
        return  _pairsConfig[_pairId-1];
    }

    function getCloseSignatures(uint256 _pairId, uint64 _counter, bytes32 _hash) external view returns(uint256) {
        bytes32 key = keccak256(abi.encode(_pairId,_counter, _hash));
        return closeSignatures[key].hashAmount;
    }


    // ======================== transaction function ===================================
    function addPair(IBetStruct.PairConfig[] memory _pairs) external onlyRole(PAIR_MANAGER) {
        for(uint256 i = 0; i < _pairs.length; i++) {
            IBetStruct.PairConfig memory pf = _pairs[i];
            require(pf.pairName != bytes32(0), "Invalid name");
            require(pf.chip != address(0), "Invalid chip");
            require(pairIds[pf.pairName][pf.chip] == 0, "Duplicated");

            _pairsConfig.push(
                IBetStruct.PairConfig(pf.pairName, pf.chip, 1, 0)
            );
            uint256 pairId = _pairsConfig.length;
            pairIds[pf.pairName][pf.chip] = pairId;

        }
        emit AddPairsEvent(_pairs);
    }

    function editPair(uint256[] memory _ids) external onlyRole(PAIR_MANAGER) {
        for(uint256 i = 0; i < _ids.length; i++) {
            uint256 pairId = _ids[i];
            require(pairId > 0 && pairId <= _pairsConfig.length, "Out of length");

            uint256 index = pairId - 1;
            _pairsConfig[index].status = _pairsConfig[index].status == 1 ? 2 : 1;
        }
        emit EditPairsEvent(_ids);
    }

    function open(
        uint256[] memory _ids,
        uint128[] memory _oPrices,
        uint64[] memory _oTimes,
        uint32[] memory _periodSeconds,
        uint32[] memory _sIntervalSeconds,
        uint32[] memory _eIntervalsSeconds
    ) external onlyRole(OPEN_MANAGER) {
        require(
            ( (_oPrices.length ^ _ids.length)
            | (_oTimes.length ^ _oPrices.length)
            | (_ids.length ^ _oTimes.length)
            | (_sIntervalSeconds.length ^ _eIntervalsSeconds.length)
            | (_sIntervalSeconds.length ^ _periodSeconds.length) )== 0,
            "Invalid length"
        );

        uint256[] memory counters = new uint256[](_ids.length);

        for(uint256 i = 0; i < _ids.length; i++) {
            uint128 openPrice = _oPrices[i];
            uint64 openTime = _oTimes[i];
            uint64 period = _periodSeconds[i];
            uint32 sInterval = _sIntervalSeconds[i];
            uint32 eInterval = _eIntervalsSeconds[i];
            uint256 pairId = _ids[i];
            require(pairId > 0 && pairId <= _pairsConfig.length, "Out of length");
            IBetStruct.PairConfig memory _pairConfig =  _pairsConfig[pairId - 1];

            require(_pairConfig.status == 1, "Invalid pair");
            require(openPrice > 0, "Invalid price");
            require(period > 0, "Invalid period");

            uint64 closeTime = openTime + period;
            require(closeTime > block.timestamp, "Invalid time");
            require(openTime + sInterval < closeTime - eInterval, "Invalid ctime");

            uint64 counter = _pairConfig.counter;
            IBetStruct.PairsCRound storage pcr = pairsCR[pairId][counter];
            require(pcr.oPrice == 0, "Invalid counter");

            pcr.sInterval = sInterval;
            pcr.eInterval = eInterval;
            pcr.oTime = openTime;
            pcr.cTime = closeTime;
            pcr.oPrice = openPrice;
            counters[i] = counter;
        }

        emit OpenEvent( _ids, counters);

    }

    function close(ClosingData memory data) external onlyRole(CLOSE_MANAGER) {
        require(
            ( (data.ids.length ^ data.cPrices.length)
            | (data.nextOPrice.length ^ data.nextOTimes.length)
            | (data.nextOPrice.length ^ data.cPrices.length)
            | (data.nextPeriodSeconds.length ^ data.nextSIntervalsSeconds.length)
            | (data.nextSIntervalsSeconds.length ^ data.nextEIntervalsSeconds.length)
            | (data.nextOTimes.length ^ data.nextPeriodSeconds.length)
            )== 0,
            "Invalid length"
        );


        uint256[] memory counters = new uint256[](data.ids.length);

        for(uint256 i = 0; i < data.ids.length; i++) {
            uint256 pairId = data.ids[i];

            require(pairId > 0 && pairId <= _pairsConfig.length, "Out of length");
            IBetStruct.PairConfig storage _pairConfig = _pairsConfig[pairId - 1];
            require(data.cPrices[i] > 0 && data.nextOPrice[i] > 0, "Invalid price");

            uint64 counter =_pairConfig.counter;
            IBetStruct.PairsCRound storage pcr = pairsCR[pairId][counter];
            require(pcr.cPrice == 0 && pcr.oPrice > 0, "Invalid counter");

            uint64 nCTime = data.nextOTimes[i] + data.nextPeriodSeconds[i];

            {
                uint256 cTime = pcr.cTime;

                require(
                    block.timestamp > cTime &&
                    data.nextOTimes[i] >= cTime,
                    "Invalid cTime");

                require(
                    cTime + data.nextSIntervalsSeconds[i] < nCTime - data.nextEIntervalsSeconds[i],
                    "Invalid next time" );
            }

            if(!_checkSignatureForClose(pairId, counter, _hashCloseData(data, i))) {continue;}

            pcr.cPrice = data.cPrices[i];
            counters[i] = counter;
            _pairConfig.counter = counter + 1;

            unchecked {
                if(pcr.fTotal > 0 && pcr.rTotal > 0) {
                    if(pcr.oPrice < data.cPrices[i]) {
                        accChips[_pairsConfig[pairId - 1].chip] += pcr.fTotal / 10;

                    }else if(pcr.oPrice > data.cPrices[i]) {
                        accChips[_pairsConfig[pairId - 1].chip] += pcr.rTotal / 10;
                    }
                }
            }

            if(_pairConfig.status == 1) {
                IBetStruct.PairsCRound storage nextPcr = pairsCR[pairId][counter + 1];
                nextPcr.oPrice = data.nextOPrice[i];
                nextPcr.sInterval = data.nextSIntervalsSeconds[i];
                nextPcr.eInterval = data.nextEIntervalsSeconds[i];
                nextPcr.oTime = data.nextOTimes[i];
                nextPcr.cTime = nCTime;
            }

        }

        emit CloseEvent(data.ids, counters);
    }

    function setRTotal(uint256 _id, uint64 _counter, uint256 _amount, uint256 _bonusAmount) public onlyRole(PAIRCR_MANAGER) {
        pairsCR[_id][_counter].rTotal = _amount;
        pairsCR[_id][_counter].rTotalBonus += _bonusAmount;
    }

    function setFTotal(uint256 _id, uint64 _counter, uint256 _amount, uint256 _bonusAmount) public onlyRole(PAIRCR_MANAGER) {
        pairsCR[_id][_counter].fTotal = _amount;
        pairsCR[_id][_counter].fTotalBonus += _bonusAmount;
    }

    function setAccChip(address _chip, uint256 _amount) public onlyRole(PAIRCR_MANAGER) {
        accChips[_chip] = _amount;
    }

    function grantRole(bytes32 role, address account) public virtual override onlyRole(DEFAULT_ADMIN_ROLE) {
        require(!hasRole(role, account), "Duplicate");

        if(role == CLOSE_MANAGER) {
            unchecked {
                closeManagers++;
            }
        }

        _grantRole(role, account);
    }

    function revokeRole(bytes32 role, address account) public virtual override onlyRole(DEFAULT_ADMIN_ROLE) {
        require(hasRole(role, account), "Not exist");
        _revokeRole(role, account);
        if(role == CLOSE_MANAGER) {
            unchecked {
                closeManagers--;
            }
        }
    }

    // ======================== private/internal function ===================================

    function _hashCloseData(ClosingData memory data, uint256 _index) private pure returns(bytes32) {
        bytes32 hash =  keccak256(abi.encodePacked(
                data.cPrices[_index],
                data.nextOPrice[_index],
                data.nextOTimes[_index],
                data.nextPeriodSeconds[_index],
                data.nextSIntervalsSeconds[_index],
                data.nextEIntervalsSeconds[_index]
            )
        );

        return hash;
    }

    function _checkSignatureForClose(uint256 _pairId, uint64 _counter, bytes32 _hash) internal returns(bool) {
        bytes32 key = keccak256(abi.encode(_pairId,_counter, _hash));

        require(!closeSignatures[key].hasSigned[msg.sender], "Duplicate sign");

        closeSignatures[key].hasSigned[msg.sender] = true;

        unchecked {
            closeSignatures[key].hashAmount++;
        }

        if( closeSignatures[key].hashAmount * 10e3 >= closeManagers * 2 * 10e3 / 3) {return true;}

        return false;
    }

    function _authorizeUpgrade(address) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}

    function initialize() external initializer {
        __UUPSUpgradeable_init();
        __AccessControl_init();
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }
}