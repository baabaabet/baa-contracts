// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.14;

import  "../lib/openzeppelin-contracts-upgradeable/contracts/proxy/utils/Initializable.sol";
import  "../lib/openzeppelin-contracts-upgradeable/contracts/proxy/utils/UUPSUpgradeable.sol";
import  "../lib/openzeppelin-contracts-upgradeable/contracts/access/AccessControlUpgradeable.sol";
import  "../lib/openzeppelin-contracts-upgradeable/contracts/token/ERC20/extensions/IERC20MetadataUpgradeable.sol";
import  "../lib/openzeppelin-contracts-upgradeable/contracts/token/ERC20/utils/SafeERC20Upgradeable.sol";

import "./interface/IBetUpCore.sol";
import "./interface/IBetUpSheep.sol";
import "./interface/IBetUpDAOToken.sol";

contract BetUpEvents is Initializable, UUPSUpgradeable, AccessControlUpgradeable {
    using SafeERC20Upgradeable for IERC20MetadataUpgradeable;

    bytes32 public constant GOVERNANCE_ROLE = keccak256("GOVERNANCE_ROLE");
    bytes32 public constant OPEN_COEFFICIENT = keccak256("OPEN_COEFFICIENT_ROLE");
    bytes32 public constant OPEN_ROLE = keccak256("OPEN_ROLE");
    uint16 public constant INVALID_ID = 65535;

    // @dev openCoefficient * 10 ** 18
    uint24 public openCoefficient;
    uint32 public resolveDeadlineSecond;
    // @dev the reward fee for creator
    uint16 public createRewardsRatio;

    address public betUpSheep;
    address public betUpCore;
    address public betUpDaoToken;

    // @dev the valid chip address Mapping from chip address to chip status
    // 0 - no-existent
    // 1- valid
    // 2- invalid
    mapping(address => uint8) public validChips;

    // @dev the pairID number that automatically increase from 1
    uint256 public pairIDCounter;

    // @dev mapping from `pairID` to `Pair information`
    mapping(uint256 => Pair) public pairs;
    mapping(uint256 => InnerPair) public innerPairs;

    // @dev Mapping from `bytes32(pairID,_resultID)` to the number of resultID which has been set by resolver
    mapping(bytes32 => uint256) public resultCounter;

    // @dev Mapping from `bytes32(pairID,resolver)` to the Resolver struct
    mapping(bytes32 => Resolver) public pairsResolver;

    // @dev mapping from `bytes32(pairID, resultID, address)` to `amount`
    mapping(bytes32 => Player) public players;

    // @dev mapping from `bytes32(pairID,_resultID)` to `amount`
    mapping(bytes32 => OptionVolume) public optionsVolume;

    struct InnerPair {
        uint256 total;              //--256  @dev the total number of the stacked amount
        uint64 startAt;             // @dev the time of creation time
        uint64 deadlineAt;          // @dev resolve events before this time
        uint16 resultID;            // @dev resultID means the order number of options' item and it start from 1
        uint24 openAmount;
    }

    struct Pair {
        uint64 resolutionAt;        // @dev the time of start to resolute the event
        address creator;            // @dev the account which created the event
        uint32 resolverQty;         //--256 @dev the number of the resolvers
        uint64 endStackAt;          // @dev the time of ending stack(at least by 2 days )
        address chip;               // @dev the token address
        uint8 optionsQty;           // @dev the number of options  the max number of options only supports 2^8 -1
        uint16 creationRatio;       // @dev the percentage of creation reward for creator
        bool paused;                // @dev pause claim
        bool claimedReward;         // @dev the number of creationFee which has been withdrew
        bool claimedToVault;        //--251 @dev
    }

    struct Resolver {
        bool isResolver;
        bool claimed;
        uint16 resultID;
    }

    struct Player {
        uint256 amount;
        uint256 amountWithBonus;
    }

    struct OptionVolume {
        uint256 amount;
        uint256 amountWithBonus;
    }

    event AddChipsEvent(
        address[] chips
    );

    event InvalidChipEvent(
        address chip,
        uint8 status
    );

    event CreateEventEvent(
        uint256 pairID
    );

    event StackEvent(
        uint256 parID,
        uint256 resultID,
        uint256 amount
    );

    event CloseEvent(
        uint256 pairID,
        uint16 resultId
    );

    event ClaimEvent(
        uint256 pairID,
        uint16 resultID,
        uint256 refund,
        uint256 reward
    );

    event WithdrawFeeEvent(
        uint256 pairID,
        uint256 amount
    );

    event WithdrawToVaultEvent(
        uint256 pairID,
        uint256 amount
    );

    event EditCreationFee(
        uint256 prior,
        uint256 next
    );

    event PausePairEvent(
        uint256 pairID,
        bool status
    );

    error InvalidResolver(address);
    error InvalidPairID(uint256);
    error InvalidResultID(uint16);
    error InvalidAmount(uint256);
    error PairPaused(uint256);

    /*
        @dev create an custom bet event
        @parmas details a base64 json string which look like as follow:
            {
                title: "...",
                detail: "...",
                icon: "http://..."
                type: ["crypto" | "sports" | "politics" | "others"]
                sourceUrl: "..."
            }
    */
    function open(
        uint64 _endStackAt,
        uint64 _resolutionAt,
        address _chip,
        uint8 _optionsQty,
        address[] memory _resolvers,
        string calldata _details,
        string calldata _type
    ) external {
        address sender = msg.sender;
        uint24 _openCoefficient = 0;
        if(!hasRole(OPEN_ROLE, sender)) {
            _openCoefficient = openCoefficient;
            IERC20MetadataUpgradeable(betUpDaoToken).safeTransferFrom(
                sender,
                address(this),
                uint256(openCoefficient) * (10**18));
        }

        require(_optionsQty >= 2 && _optionsQty < 256, "invalid _optionsQty");
        require( _endStackAt > block.timestamp && _resolutionAt > _endStackAt, "invalid time");

        uint256 resolversLen = _resolvers.length;
        require(resolversLen & 1 == 1, "invalid _resolvers");
        require(_chip != address(0) && validChips[_chip] == 1, "invalid _chip");

        pairs[pairIDCounter].resolutionAt = _resolutionAt;
        pairs[pairIDCounter].creator = sender;
        pairs[pairIDCounter].resolverQty = uint32(resolversLen);
        pairs[pairIDCounter].endStackAt = _endStackAt;
        pairs[pairIDCounter].chip = _chip;
        pairs[pairIDCounter].optionsQty = _optionsQty;
        pairs[pairIDCounter].creationRatio = createRewardsRatio;
        innerPairs[pairIDCounter].openAmount = _openCoefficient;
        innerPairs[pairIDCounter].deadlineAt = _resolutionAt + resolveDeadlineSecond;
        innerPairs[pairIDCounter].startAt = uint64(block.timestamp);

        for(uint256 i = 0; i < resolversLen; i++) {
            address _resolver = _resolvers[i];
            if(_resolver == address(0)) revert InvalidResolver(_resolver);

            bytes32 pairsResolverID = keccak256(abi.encodePacked(pairIDCounter, _resolver));
            if(pairsResolver[pairsResolverID].isResolver) revert InvalidResolver(_resolver);
            pairsResolver[pairsResolverID].isResolver = true;
        }

        emit CreateEventEvent(pairIDCounter);
        pairIDCounter++;
    }

    // @dev close：set the result of the bet event
    function close(uint256 _pairID,  uint16 _resultID, bool _isInvalid) external {
        Pair memory pair = pairs[_pairID];
        InnerPair memory innerPair = innerPairs[_pairID];
        address sender = msg.sender;

        if(pair.paused) revert PairPaused(_pairID);
        bytes32 pairResolverID = keccak256(abi.encodePacked(_pairID, sender));
        Resolver memory pairResolver = pairsResolver[pairResolverID];

        require(_resultID <= pair.optionsQty && _resultID > 0, "invalid _resultID");
        require(pairResolver.isResolver, "unauthorized");
        require(pairResolver.resultID == 0, "resolved already");
        require(innerPair.resultID == 0, "pair resolved");
        require(block.timestamp > pair.resolutionAt && block.timestamp < innerPair.deadlineAt, "outdated");

        uint16 __resultID = _resultID;

        if(!_isInvalid) {
            require(_resultID > 0 && _resultID <= pair.optionsQty, "invalid _resultID" );
        }else {
            __resultID = INVALID_ID;
        }

        bytes32 resultCounterID = keccak256(abi.encodePacked(_pairID, __resultID));
        uint256 priorResultCount = resultCounter[resultCounterID];
        uint256 nextResultCount = priorResultCount + 1;

        if(nextResultCount * 10e3 >= pair.resolverQty * 2 *  10e3 / 3 ) {
            innerPairs[_pairID].resultID =  __resultID;
        }

        pairsResolver[pairResolverID].resultID = __resultID;
        resultCounter[resultCounterID]++;

        emit CloseEvent(_pairID, __resultID);
    }

    function stack(uint256 _pairID, uint16 _resultID, uint256 _amount) external  {
        Pair memory pair = pairs[_pairID];
        InnerPair memory innerPair = innerPairs[_pairID];

        if( pair.optionsQty == 0) revert InvalidPairID(_pairID);
        if(pair.paused) revert PairPaused(_pairID);
        require(block.timestamp < pair.endStackAt, "Invalid stack time");
        if( _resultID > pair.optionsQty || _resultID == 0) revert InvalidResultID(_resultID);
        if(_amount == 0) revert InvalidAmount(_amount);

        address sender = msg.sender;
        IERC20MetadataUpgradeable(pair.chip).safeTransferFrom(sender, address(this), _amount);

        uint256 bonus = IBetUpCore(betUpCore).calcIncentiveBonus(innerPair.startAt, pair.endStackAt, _amount);
        bytes32 playerKey = keccak256(abi.encodePacked(_pairID,_resultID,sender));
        players[playerKey].amount += _amount;
        players[playerKey].amountWithBonus += bonus;
        optionsVolume[keccak256(abi.encodePacked(_pairID,_resultID))].amount += _amount;
        optionsVolume[keccak256(abi.encodePacked(_pairID,_resultID))].amountWithBonus += bonus;
        innerPairs[_pairID].total +=  _amount;

        uint256 decimal =  IERC20MetadataUpgradeable(pair.chip).decimals();
        IBetUpCore(betUpCore).setPlayerRecord(sender, _amount, decimal);

        emit StackEvent(_pairID, _resultID, _amount);
    }

    function claim(uint256 _pairID, uint16 _resultID, uint256 _maxLevel) external  {
        Pair memory pair = pairs[_pairID];
        if (pair.optionsQty == 0) revert InvalidPairID(_pairID);
        if(pair.paused) revert PairPaused(_pairID);

        require(block.timestamp > pair.endStackAt, "ongoing");

        address sender = msg.sender;
        bytes32 playerID = keccak256(abi.encodePacked(_pairID,_resultID,sender));
        Player memory player =  players[playerID];
        if (player.amount == 0 ) revert InvalidResultID(_resultID);

        (uint256 refund, uint256 reward) = _getReward(
            _pairID,
            _maxLevel,
            sender,
            _resultID,
            pair,
            player
        );

        players[playerID].amount = 0;
        require(refund > 0 || reward > 0, "nothing be withdrew");
        if (refund > 0) IERC20MetadataUpgradeable(pair.chip).safeTransfer(sender, refund);
        if (reward > 0 ) IBetUpDAOToken(betUpDaoToken).mint(msg.sender, reward);

        emit ClaimEvent(_pairID, _resultID, refund, reward);
    }

    function claimCreationRewards(uint256 _pairID) external {
        Pair memory pair = pairs[_pairID];
        InnerPair memory innerPair = innerPairs[_pairID];
        address receiver = msg.sender;

        if(pair.creator != receiver) revert InvalidPairID(_pairID);
        if(pair.paused) revert PairPaused(_pairID);
        require(innerPair.resultID > 0 && innerPair.resultID < 256 , "invalid resultID");
        require(pair.claimedReward == false, "claimed");
        require(pair.creationRatio > 0, "isInvalid");

        uint256 op = optionsVolume[keccak256(abi.encodePacked(_pairID, innerPair.resultID))].amount;
        if(op == 0 || op == innerPair.total) revert InvalidPairID(_pairID);
        uint256 subTotal = innerPair.total - op;

        uint256 fee = subTotal * 10 * pair.creationRatio/1000000 ;
        require(fee > 0 && subTotal != innerPair.total, "No rewards available");

        pairs[_pairID].claimedReward = true;

        IERC20MetadataUpgradeable(pair.chip).safeTransfer(receiver, fee);
        if(innerPair.openAmount > 0) IERC20MetadataUpgradeable(betUpDaoToken)
        .safeTransfer(receiver, uint256(innerPair.openAmount) * 10 ** 18);
        emit WithdrawFeeEvent(_pairID, fee);
    }

    // @dev Support for two-digit decimals
    function setCreationFee(uint16 _createFee ) external onlyRole(GOVERNANCE_ROLE) {
        require(_createFee <= 10000, "invalid _createFee");
        uint16 _prior = createRewardsRatio;
        createRewardsRatio = _createFee;
        emit EditCreationFee(_prior, createRewardsRatio);
    }

    function setResultID(uint256 _pairID, uint16 _resultID, bool _isInValid) external  onlyRole(GOVERNANCE_ROLE) {
        Pair memory pair = pairs[_pairID];
        require(pair.optionsQty > 0, "Invalid pair");
        require(_resultID <= pair.optionsQty && _resultID > 0, "Invalid _resultID");

        uint16 __resultID = _isInValid ? INVALID_ID : _resultID;
        innerPairs[_pairID].resultID =  __resultID;
        emit CloseEvent(_pairID, __resultID);
    }

    function pausePair(uint256 _pairID, bool _status) external onlyRole(GOVERNANCE_ROLE) {
        require(pairs[_pairID].paused != _status, "duplicate");
        pairs[_pairID].paused = _status;
        emit PausePairEvent(_pairID, _status);
    }

    function setOpenCoefficient(uint24 _num) external onlyRole(OPEN_COEFFICIENT) {
        openCoefficient = _num;
    }

    function setResolveDeadlineSecond(uint32 _spam) external onlyRole(OPEN_COEFFICIENT) {
        resolveDeadlineSecond =_spam ;
    }

    function withdrawToVault(uint256[] memory pairIDs) external onlyRole(DEFAULT_ADMIN_ROLE) {
        address receiver = msg.sender;
        for(uint256 i = 0; i < pairIDs.length; i++) {
            uint256 pairID = pairIDs[i];
            Pair memory pair = pairs[pairID];
            InnerPair memory innerPair = innerPairs[pairID];

            if(pair.paused) revert PairPaused(pairID);
            require(pair.claimedToVault == false , "Invalid pair");
            require(innerPair.resultID > 0 && innerPair.resultID != INVALID_ID, "Invalid resultID");
            uint256 op = optionsVolume[keccak256(abi.encodePacked(pairID, innerPair.resultID))].amount;
            if (op == innerPair.total || op == 0 ) revert InvalidPairID(pairID);

            uint256 subTotal = (innerPair.total - op);
            uint256 availableAmount = (subTotal * (10000  - pair.creationRatio)) / (10*10000);
            pairs[pairID].claimedToVault = true;
            IERC20MetadataUpgradeable(pair.chip).safeTransfer(receiver, availableAmount);

            emit WithdrawToVaultEvent(pairID, availableAmount);
        }
    }

    // @dev don't edit the address content which has been added already.
    function addChips(address[] memory _chips) external onlyRole(DEFAULT_ADMIN_ROLE) {
        for(uint256 i = 0; i < _chips.length; i++) {
            address chip = _chips[i];
            require(validChips[chip] == 0, "duplicate");
            require(chip.code.length > 0, "invalid address");
            validChips[chip] = 1;
        }

        emit AddChipsEvent(_chips);
    }

    function updateChip(address _chip, uint8 _status) external onlyRole(DEFAULT_ADMIN_ROLE) {
        uint8 status = validChips[_chip];
        require(_status == 1 || _status == 2, "Invalid _status");
        require(status > 0 && status != _status, "invalid _chip");
        validChips[_chip] = _status;

        emit InvalidChipEvent(_chip, _status);
    }

    function getRewardOf(
        uint256 _pairID,
        uint16 _resultID,
        uint256 _maxLevel,
        address _receiver
    ) external view returns(uint256, uint256){
        Pair memory pair = pairs[_pairID];
        bytes32 playerID = keccak256(abi.encodePacked(_pairID, _resultID, _receiver));
        (uint256 refund, uint256 reward) = _getReward(
            _pairID,
            _maxLevel,
            _receiver,
            _resultID,
            pair,
            players[playerID]
        );
        return (refund, reward);
    }

    /*
       @dev claim: claim the principle and the benefits
       R = (9 * P * (T-OP)) / (10 * OP)
       R = rewards
       P = player amount
       OP = the number of same result of P
       T = total volume
    */
    function _getReward(
        uint256 _pairID,
        uint256 _maxLevel,
        address _receiver,
        uint16 _resultID,
        Pair memory pair,
        Player memory _player
    ) internal view returns(uint256 refund, uint256 reward) {
        require(IBetUpSheep(betUpSheep).checkMaxLevel(_maxLevel, _receiver), "Invalid _maxLevel");
        InnerPair memory innerPair = innerPairs[_pairID];
        (uint256 winPer, uint256 losePer) = IBetUpCore(betUpCore).calcDaoAmountPerUnit(_maxLevel);
        uint256 op = optionsVolume[keccak256(abi.encodePacked(_pairID,_resultID))].amount;
        uint256 _chipDecimal = IERC20MetadataUpgradeable(pairs[_pairID].chip).decimals();

        uint256 pairOp =  optionsVolume[keccak256(abi.encodePacked(_pairID,innerPair.resultID))].amount;

        if(_player.amount == 0) return (refund,reward);

        if(innerPair.resultID == INVALID_ID) {
            refund = _player.amount;
        }else if(innerPair.resultID > 0 ) {

            if(innerPair.resultID == _resultID) {
                if(pairOp == 0 || pairOp == innerPair.total) {
                    refund = _player.amount;
                }else {
                    refund = _player.amount +  ((9 * _player.amountWithBonus *(innerPair.total - op)) / (10 * optionsVolume[keccak256(abi.encodePacked(_pairID,_resultID))].amountWithBonus));
                    reward = winPer * _player.amount  /(10 ** _chipDecimal);
                }

            }else {
                if(pairOp == 0 || pairOp == innerPair.total) {
                    refund = _player.amount;
                }else {
                    reward = losePer * _player.amount / 10 ** _chipDecimal;
                }
            }


        }else if(
            (block.timestamp > innerPair.deadlineAt && innerPair.resultID == 0) ||
            (block.timestamp > pair.endStackAt && !_notOneSide(_pairID, pair.optionsQty))
        )  {
            refund = _player.amount;
        }

        return (refund, reward);
    }

    function _notOneSide(uint256 _pairID, uint256 _optionsQty ) internal view returns(bool notOneSide){
        uint256 flag;
        for(uint256 i = 1; i <= _optionsQty; i++) {
            uint256 opAmount = optionsVolume[keccak256(abi.encodePacked(_pairID,uint16(i)))].amount;
            if(flag == 2) {
                notOneSide = true;
                break;
            }
            if(opAmount > 0) flag++;
        }

        return notOneSide;
    }

    function updateBetSheep(address _addr) external onlyRole(DEFAULT_ADMIN_ROLE) {
        betUpSheep = _addr;
    }

    function _authorizeUpgrade(address) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}

    function initialize(
        address _betUpSheep,
        address _betUpCore,
        address _betUpDaoToken
    ) external initializer {
        __AccessControl_init();
        __UUPSUpgradeable_init();
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);

        // @dev initialize the number of pairID
        pairIDCounter = 1;
        // @dev initialized the number of openCoefficient which could be set by community
        //  @dev equal to 1000 * 10**18
        openCoefficient = 1000;
        // @dev initialize the number of resolveDeadlineSecond which could be set by community (at least 12 hs)
        resolveDeadlineSecond = 24 hours;
        // @Dev initialize the number of createRewardsRatio which could be set by community
        createRewardsRatio = 5000;

        betUpSheep = _betUpSheep;
        betUpCore = _betUpCore;
        betUpDaoToken = _betUpDaoToken;
    }
}