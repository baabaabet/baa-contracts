// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.14;

import "../lib/openzeppelin-contracts-upgradeable/contracts/proxy/utils/Initializable.sol";
import "../lib/openzeppelin-contracts-upgradeable/contracts/proxy/utils/UUPSUpgradeable.sol";
import "../lib/openzeppelin-contracts-upgradeable/contracts/access/AccessControlUpgradeable.sol";
import "../lib/openzeppelin-contracts-upgradeable/contracts/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "../lib/openzeppelin-contracts-upgradeable/contracts/utils/StringsUpgradeable.sol";
import "../lib/ERC721A-Upgradeable/contracts/ERC721AUpgradeable.sol";
import "../lib/ERC721A-Upgradeable/contracts//ERC721A__Initializable.sol";

import "./interface/IBetUpCore.sol";
import "./interface/IBetStruct.sol";
import "./interface/IERC20BurnAndMintUpgradeable.sol";

contract BetUpSheep is Initializable, UUPSUpgradeable, AccessControlUpgradeable, ERC721AUpgradeable  {
    using SafeERC20Upgradeable for IERC20BurnAndMintUpgradeable;
    using StringsUpgradeable for uint256;
    bytes32 public constant FREE_MINT_ROLE = keccak256("FREE_MINT_ROLE");

    address public daoTokenAddress;
    address public betCoreAddress;
    uint256 public mintLimit;
    string public baseURIExtended;
    uint256 public rate;

    // @dev Mapping from tokenId to property
    mapping(uint256 => Property) private _properties;

    // @dev Mapping from level to config
    mapping(uint256 => LevelConfig) public levelConfig;

    // @dev Mapping from player address to level snapshots
    mapping(address => Player) public playersSnapshot;

    struct Player {
        // @dev account's level snapshot composite with 0|1 at each uint1
        uint256 snapshot;

        // @dev Mapping from level to amount of level tokenId
        mapping(uint256 => uint256) amount;
    }

    struct LevelConfig {
        // @dev the number of category of level
        uint8 categoryAmount;
        // @dev the number of category of each category
        uint256 categoryItemAmount;
        // @dev the number of rare property limitation of each random property
        uint256 rareItemLimitAmount;
    }

    struct Property {
        // @dev current level
        uint256 level;
        // @dev mapping from level to serial
        mapping(uint256 => uint256) serial;
    }

    struct PropertiesType {
        uint256 level;
        uint256 serial;
        uint256 categoryAmount;
    }

    event CreateCardEvent(
        uint256 starkTokenId,
        uint256 amount
    );

    event UpgradeCardEvent(
        address owner,
        uint256 tokenId,
        uint256 levelBefore,
        uint256 levelAfter
    );

    event UpdateRate(
        uint256 beforeRate,
        uint256 afterRate
    );

    // ====================== query function  ======================

    // @dev get value at position(n) of s
    function getBit(uint256 s, uint256 n) public pure returns(bool) {
        uint256 base = 256 - n;
        uint256 res =  (s & (1 << base )) >> base;

        return res == 1 ? true: false;
    }

    function checkMaxLevel(uint256 _maxLevel, address _account) external view returns(bool result) {
        uint256 snapshot = playersSnapshot[_account].snapshot;

        if(_maxLevel == 0 && _getLastIndexBits(snapshot) == 0) {
            result = true;
        }else if(_getLastIndexBits(snapshot) == 2 ** (256 - _maxLevel)) {
            result = true;
        }

        return result;
    }

    function getLastIndexBits(uint256 x) external pure returns(uint256){
        return _getLastIndexBits(x);
    }

    function _getLastIndexBits(uint256 x) private pure returns(uint256) {
        if(x == 0) {
            return 0;
        }
        return x & (~(x-1));
    }

    function getTokenIdLevel(uint256 _tokenId) external view returns(uint256) {
        return _properties[_tokenId].level;
    }

    function getLevelAmounts(address _address, uint256 _maxLevel) external view returns(uint256[] memory){
        uint256 snapshot = playersSnapshot[_address].snapshot;
        uint256[] memory levelAmounts = new uint256[](_maxLevel);

        if(_maxLevel == 0) {return levelAmounts;}

        require(_getLastIndexBits(snapshot) == 2 ** (256 - _maxLevel), "max Level not match account");

        for(uint256 i = 0; i < _maxLevel; i++) {
            uint256 level = i + 1;
            levelAmounts[i] = playersSnapshot[_address].amount[level];
        }

        return levelAmounts;
    }

    function getSerialsOf(uint256 _tokenId) external view returns(PropertiesType[] memory) {
        PropertiesType[] memory _arr = new PropertiesType[](_properties[_tokenId].level);

        for(uint256 i = 0; i < _properties[_tokenId].level ; i++) {
            uint256 _level = i+1;
            uint256 _serial = _properties[_tokenId].serial[_level];

            if (_serial > 0) {
                PropertiesType memory _pt = PropertiesType(
                    _level,
                    _serial,
                    levelConfig[_level].categoryAmount
                );
                _arr[i] = _pt;
            }
        }

        return  _arr;
    }

    function numberMinted(address _owner) external view returns (uint256) {
        return _numberMinted(_owner);
    }

    function tokenURI(uint256 tokenId) public view virtual override returns (string memory) {
        if (!_exists(tokenId)) revert URIQueryForNonexistentToken();

        string memory baseURI = _baseURI();
        return bytes(baseURI).length != 0 ? string(abi.encodePacked(baseURI, _toString(tokenId))) : '';
    }

    function _isAvailableMint(address _address, uint256 consumeCount, uint256 consumeAmount) internal view returns(bool) {
        IBetStruct.PlayerRecord memory player = IBetUpCore(betCoreAddress).playerRecords(_address);

        if(player.cumulative - player.consumption >= consumeCount && player.accAmount * 10 ** 18 >= consumeAmount) {
            return true;
        }
        return false;
    }

    function _isAvailableUpgrade(address _address, uint256 consumeCount, uint256 consumeAmount) internal view returns(bool) {
        IBetStruct.PlayerRecord memory player = IBetUpCore(betCoreAddress).playerRecords(_address);

        if(player.cumulative - player.consumption >= consumeCount
            && IERC20BurnAndMintUpgradeable(daoTokenAddress).balanceOf(_address) >= consumeAmount
        ) {
            return true;
        }
        return false;
    }

    // ====================== transaction function  ======================
    function createCard(uint256 _amount, uint8[] memory _fixedItems ) external {
        require(_fixedItems.length == 3, "invalid _fixedItems length");
        require(levelConfig[1].categoryAmount > 0, "Maxed-out level");

        address _sender = msg.sender;

        if(!hasRole(FREE_MINT_ROLE, _sender)) {
            //@dev check mint condition
            uint256 beforeNumberMinted = _numberMinted(_sender);
            uint256 nextNumberMinted = beforeNumberMinted + _amount;
            require(nextNumberMinted <= mintLimit, "out of mintLimit");
            (uint256 consumeCount, uint256 consumeAmount) =
            IBetUpCore(betCoreAddress).calcMintAmount(beforeNumberMinted, nextNumberMinted);

            require(_isAvailableMint(_sender, consumeCount, consumeAmount), "condition is not met");
            IBetUpCore(betCoreAddress).recordPlayerConsumption(_sender, consumeCount);
        }

        _mintWithLevel(_amount, _fixedItems, _sender);
    }

    function upgradeCard(uint256 _tokenId, uint256 _afterLevel) external {
        address owner = msg.sender;
        require(ownerOf(_tokenId) == owner, "Lack of cards");

        Property storage pp = _properties[_tokenId];

        uint256 _beforeLevel = pp.level;
        require(_afterLevel > _beforeLevel, "Invalid level");
        require(levelConfig[_afterLevel].categoryAmount > 0, "Maxed-out level");

        (uint256 consumeCount, uint256 consumeAmount) =
            IBetUpCore(betCoreAddress).calcUpgradeAmount(_beforeLevel, _afterLevel);
        require(_isAvailableUpgrade(owner, consumeCount, consumeAmount), "condition is not met");

        IERC20BurnAndMintUpgradeable(daoTokenAddress).safeTransferFrom(owner, address(this), consumeAmount);
        IERC20BurnAndMintUpgradeable(daoTokenAddress).burn(consumeAmount);

        _properties[_tokenId].level = _afterLevel;

        (
        uint256 _serial,
        uint256 _newLevelRareItemAmount
        ) = _updateSerial(
            _beforeLevel,
            _afterLevel,
            uint256(keccak256(
                abi.encodePacked(
                    owner,
                    pp.serial[_beforeLevel],
                    blockhash(block.number -1),
                    block.timestamp,
                    _tokenId
                )
            )),
            _tokenId
        );

        _properties[_tokenId].serial[_afterLevel] = _serial;
        levelConfig[_afterLevel].rareItemLimitAmount = _newLevelRareItemAmount;

        IBetUpCore(betCoreAddress).recordPlayerConsumption(owner, consumeCount);

        _afterTokenUpgraded(_beforeLevel, _afterLevel);

        emit UpgradeCardEvent(owner, _tokenId, _beforeLevel, _afterLevel);
    }

    // ====================== admin function  ======================

    function updateDaoTokenAddress(address _newToken) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_newToken != address(0), "Invalid address");
        daoTokenAddress = _newToken;
    }

    function updateBetCore(address _address) external  onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_address != address(0), "Invalid address");
        betCoreAddress = _address;
    }

    /*
        @dev _index  [1,32]
        @dev _amount ≥ preAmount
    */
    function updateItemAmount(
        uint256 _level,
        uint256 _index,
        uint256 _amount
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        LevelConfig memory lc = levelConfig[_level];
        require(_index > 0 &&_index <= lc.categoryAmount, "Invalid _index");

        uint256 z = (lc.categoryAmount - _index) * 8;
        uint256 _preAmount = (lc.categoryItemAmount & (0xff << z)) >> z;
        require(_amount > _preAmount && _amount < 255, "invalid _amount");
        //  (s & (~(0xff << 8)) ) | (6 << 8)
        levelConfig[_level].categoryItemAmount =  (lc.categoryItemAmount & (~(0xff << z)) ) | (_amount << z);
    }

    function updateRate(uint256 _rate) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_rate <= 1000 && _rate > 0, "invalid _rate");
        uint256 before = rate;
        rate = _rate;
        emit UpdateRate(before, rate);
    }

    function setBaseURI(string memory _baseURIExtended) external onlyRole(DEFAULT_ADMIN_ROLE) {
        baseURIExtended = _baseURIExtended;
    }

    function setLevelConfig(
        uint256 _level,
        uint8 _categoryAmount,
        uint8[] memory _categoryItemAmounts,
        uint8[] memory _limitAmount
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        uint256 categoryLen = _categoryItemAmounts.length;

        require(categoryLen == _limitAmount.length, "params length not match");
        require(_categoryAmount >=3 && _categoryAmount == categoryLen, "Invalid categoryAmount");

        LevelConfig memory lc = levelConfig[_level];
        lc.categoryAmount = _categoryAmount;

        uint256 _categoryItemAmountStr = 0;
        uint256 _itemLimitAmountStr = 0;
        for(uint256 i = 0; i < _categoryAmount; i++) {
            _categoryItemAmountStr = _categoryItemAmountStr << 8 | _categoryItemAmounts[i];

            uint8 __limitAmount =  _limitAmount[i];
            if(i >= 3) {
                require(__limitAmount > 0, "Invalid _limitAmount");
            }
            _itemLimitAmountStr = _itemLimitAmountStr << 8 | __limitAmount;
        }

        lc.categoryItemAmount = _categoryItemAmountStr;
        lc.rareItemLimitAmount = _itemLimitAmountStr;

        levelConfig[_level] = lc;

    }

    // ============================== private/internal function ==============================

    function _mintWithLevel(uint256 _amount, uint8[] memory _fixedItems, address _sender) internal {
        uint256 startTokenId = ERC721AStorage.layout()._currentIndex;
        for(uint256 i = 0; i < _amount; i++) {
            uint256 _tokenId = startTokenId + i;

            _properties[_tokenId].level = 1;

            (
            uint256 _serial,
            uint256 _newRareItemLimitAmount
            ) = _setSerials(
                1,
                _fixedItems,
                uint256(
                    keccak256(abi.encodePacked(blockhash(block.number -1), block.timestamp, _tokenId))
                )
            );

            _properties[_tokenId].serial[1] = _serial;
            levelConfig[1].rareItemLimitAmount = _newRareItemLimitAmount;

        }

        _mint(_sender, _amount);

        emit CreateCardEvent(startTokenId, _amount);
    }


    function _setSerials(
        uint256 _level,
        uint8[] memory _fixedItems,
        uint256 _random
    ) private view returns(uint256, uint256) {
        LevelConfig memory lc = levelConfig[_level];

        uint256 _newLevelRareItemAmount = 0;
        uint256 _serial = 0;

        for(uint256 i = 0 ; i < lc.categoryAmount; i++) {
            if(i < 3) {
                uint8 index = _fixedItems[i];
                require(
                    index <= ((lc.categoryItemAmount >> 8 * (lc.categoryAmount - (i+1)))) & 0xff
                    && index > 0,
                    "invalid fixed number"
                );

                _serial = _serial << 8 | index;
            }else {
                (uint256 _limitAmount, uint256 _itemRandomNumber) = _genSerial(lc, i, _random);

                _serial = _serial << 8 | uint256(_itemRandomNumber);
                _newLevelRareItemAmount = _newLevelRareItemAmount << 8 | _limitAmount;
            }
        }

        return (_serial, _newLevelRareItemAmount);
    }

    function _checkRate(uint256 _random) internal view returns(bool){
        uint256 _randomRate = uint256(keccak256(abi.encodePacked(_random)));
        bool hasRate = _randomRate % 1000 < rate ? true : false;
        return hasRate;
    }

    function _updateSerial(
        uint256 _beforeLevel,
        uint256 _afterLevel,
        uint256 _random,
        uint256 _tokenId
    ) internal view returns(uint256 _newLevelRareItemAmount, uint256 _serial){
        LevelConfig memory alc = levelConfig[_afterLevel];
        uint256 beforeCategoryAmount = levelConfig[_beforeLevel].categoryAmount;
        uint256 beforeSerial = _properties[_tokenId].serial[_beforeLevel];

        for(uint256 i = 0; i < alc.categoryAmount; i++) {
            uint256 itemRandomNumber = 0;
            uint256 limitAmount = 0;

            if(i < 3) {
                itemRandomNumber = (beforeSerial >> (8 * (beforeCategoryAmount - (i+1)))) & 0xff;
            }else {
                (uint256 _limitAmount, uint256 _itemRandomNumber) = _genSerial(alc, i, _random);
                limitAmount = _limitAmount;
                itemRandomNumber = _itemRandomNumber;
            }

            _serial = _serial << 8 | uint256(itemRandomNumber);
            _newLevelRareItemAmount = _newLevelRareItemAmount << 8 | limitAmount;
        }

        return (_serial, _newLevelRareItemAmount);
    }


    function _genSerial(LevelConfig memory lc, uint256 i, uint256 _random ) private view returns(uint256, uint256 ) {
        uint256 base = 8 * (lc.categoryAmount - (i+1));
        uint256 itemAmount = (lc.categoryItemAmount >> base) & 0xff;
        uint256 itemLimitAmount = (lc.rareItemLimitAmount >>  base) & 0xff;
        uint256 _itemRandomNumber = (_random >> i) % itemAmount + 1;

        if(_itemRandomNumber == 1) {
            if(itemLimitAmount > 0 && _checkRate(_random) ) {
                itemLimitAmount -=1;
            }else {
                uint256 _flag = _random & 0xfffff;
                do {
                    _itemRandomNumber =  _flag++ % itemAmount + 1;
                }while(_itemRandomNumber == 1);
            }
        }

        return (itemLimitAmount, _itemRandomNumber);
    }


    function _afterTokenUpgraded(
        uint256 _beforeLevel,
        uint256 _afterLevel
    ) internal {

        address owner = msg.sender;
    unchecked {
        playersSnapshot[owner].amount[_beforeLevel]--;
        playersSnapshot[owner].amount[_afterLevel]++;

        uint256 snapshot = playersSnapshot[owner].snapshot;
        if(playersSnapshot[owner].amount[_beforeLevel] == 0) {
            snapshot = snapshot ^( 1 << 256 - _beforeLevel);
        }

        if(playersSnapshot[owner].amount[_afterLevel] == 1) {
            snapshot = snapshot ^( 1 << 256 - _afterLevel );
        }

        playersSnapshot[owner].snapshot = snapshot;
    }
    }

    function _afterTokenTransfers(
        address from,
        address to,
        uint256 startTokenId,
        uint256 quantity
    ) internal virtual override{

        for(uint256 i = 0; i < quantity; i++) {
            uint256 level = _properties[startTokenId + i].level;
            // mint
            if(from == address(0)) {
                uint256 snapshot = playersSnapshot[to].snapshot;

                if(!getBit(snapshot, level)) {
                    playersSnapshot[to].snapshot = snapshot | (1 << 256 - level);
                }
            unchecked {
                playersSnapshot[to].amount[level]++;
            }

                // transfer
            }else if(from !=address(0) && to != address(0)) {
                Player storage _fromSnapshot = playersSnapshot[from];
                Player storage _toSnapshot = playersSnapshot[to];

                // from
                if(_fromSnapshot.amount[level] - 1 == 0) {
                    _fromSnapshot.snapshot = _fromSnapshot.snapshot ^ (1 << 256 - level);
                }


                // to
                if(_toSnapshot.amount[level] == 0) {
                    _toSnapshot.snapshot = _toSnapshot.snapshot | (1<< 256 - level);
                }

            unchecked {
                _fromSnapshot.amount[level]--;
                _toSnapshot.amount[level]++;
            }
            }

        }

    }

    function _baseURI() internal view  virtual override returns (string memory) {
        return baseURIExtended;
    }

    function _startTokenId() internal view virtual override returns (uint256) {
        return 1;
    }

    function _authorizeUpgrade(address) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}

    function supportsInterface(bytes4 interfaceId)
    public
    view
    virtual
    override(AccessControlUpgradeable, ERC721AUpgradeable)
    returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    function initialize(
        address _daoTokenAddress,
        address _betCoreAddress,
        uint256 _mintLimit,
        string memory _baseUri
    ) external initializer initializerERC721A {
        require(_daoTokenAddress != address(0), "Invalid address");
        require(_mintLimit > 0 , "Invalid _mintLimit");

        __UUPSUpgradeable_init();
        __AccessControl_init();
        __ERC721A_init("Baa Baa Bet Sheep", "SHEEP");
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);

        daoTokenAddress = _daoTokenAddress;
        betCoreAddress = _betCoreAddress;
        mintLimit = _mintLimit;
        baseURIExtended = _baseUri;

        rate = 200;
    }
}
