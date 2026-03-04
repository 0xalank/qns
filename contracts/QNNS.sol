// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/**
 * @title QNNS - Quai Network Name Service (v2)
 * @notice ERC-721 name registry for Quai Network with English auctions,
 *         yearly renewable names with tiered pricing, admin-adjustable
 *         exchange rate, built-in marketplace, and enforced deployer fees.
 *
 * Key features:
 * - ERC-721 NFT (transferable, multiple per address)
 * - English auction registration (12hr default, 1hr anti-snipe)
 * - Yearly renewal with tiered pricing (3-char, 4-char, 5+ char)
 * - 30-day grace period after expiry
 * - Lock deposit (returned on release/expiry)
 * - Built-in marketplace (bid/offer)
 * - 1% deployer fee on auction wins + marketplace trades + direct transfers
 * - Admin-adjustable Qi/Quai exchange rate
 */
contract QNNS is ERC721 {
    // ============ Types ============

    struct Auction {
        bytes32 nameHash;
        string name;
        address initiator;
        address highestBidder;
        uint256 highestBid;
        uint256 startTime;
        uint256 endTime;
        bool finalized;
    }

    struct MarketplaceBid {
        address bidder;
        uint256 amount;
        uint256 timestamp;
    }

    /// @notice Core name registration data
    struct NameCore {
        string name;
        uint256 lockAmount;
        uint256 auctionId;
        uint256 expiresAt;
        address quaiAddress;
        string qiPaymentCode;
    }

    /// @notice Name profile data (display info, socials, content)
    struct NameProfile {
        bytes avatar;
        string displayName;
        string description;
        string url;
        string twitter;
        string github;
        string discord;
        string telegram;
        string nostrPubkey;
        bytes contentHash;
    }

    // ============ Constants ============

    uint256 public constant MAX_AVATAR_SIZE = 15360;      // 15KB
    uint256 public constant DEPLOYER_FEE_BPS = 100;       // 1% = 100 basis points
    uint256 public constant GRACE_PERIOD = 30 days;

    // ============ State ============

    address public deployer;
    address public admin;
    address public burnAddress;

    uint256 public auctionDuration;
    uint256 public antiSnipeWindow;
    uint256 public minLockAmount;            // Flat QUAI minimum lock

    // Flat fee for instant registration (7+ chars)
    uint256 public registrationFee7Plus;     // 200e18 (200 QUAI)

    // Auction floors by tier
    uint256 public auctionFloor4to6;         // 1000e18 (1000 QUAI)
    uint256 public auctionFloor1to3;         // 5000e18 (5000 QUAI)

    // Exchange rate: how many QUAI equal 1 Qi (18 decimals)
    uint256 public quaiPerQi;

    // Tiered yearly pricing in Qi (18 decimals)
    uint256 public yearlyPriceQi5Plus;       // 5+ char names
    uint256 public yearlyPriceQi4Char;       // 4 char names
    uint256 public yearlyPriceQi3OrLess;     // 3 or fewer char names

    uint256 public nextAuctionId;

    /// @notice Auction data by auction ID
    mapping(uint256 => Auction) public auctions;

    /// @notice Active auction ID for a name hash (0 if none)
    mapping(bytes32 => uint256) public nameToActiveAuction;

    /// @notice Core name data (name, lock, expiry, addresses) by name hash
    mapping(bytes32 => NameCore) public nameCore;

    /// @notice Profile data (avatar, socials, etc.) by name hash
    mapping(bytes32 => NameProfile) internal _nameProfile;

    /// @notice Whether a name is currently registered
    mapping(bytes32 => bool) public isRegistered;

    /// @notice Admin-reserved names
    mapping(bytes32 => bool) public reserved;

    /// @notice Permanently blocked names
    mapping(bytes32 => bool) public blocked;

    /// @notice Marketplace bids for a name
    mapping(bytes32 => MarketplaceBid[]) internal _marketplaceBids;

    /// @dev Flag to skip transfer fee during marketplace trades
    bool private _inMarketplaceTransfer;

    // ============ Events ============

    event AuctionStarted(uint256 indexed auctionId, bytes32 indexed nameHash, string name, address indexed initiator, uint256 openingBid, uint256 endTime);
    event AuctionBid(uint256 indexed auctionId, address indexed bidder, uint256 amount, uint256 newEndTime);
    event AuctionFinalized(uint256 indexed auctionId, bytes32 indexed nameHash, address indexed winner, uint256 winningBid, uint256 lockAmount);
    event NameRegistered(bytes32 indexed nameHash, string name, address indexed owner, uint256 fee, uint256 lockAmount);
    event NameReleased(bytes32 indexed nameHash, address indexed previousOwner, uint256 lockReturned);
    event NameRenewed(bytes32 indexed nameHash, address indexed renewedBy, uint256 newExpiresAt, uint256 feePaid);
    event NameRenewedFromLock(bytes32 indexed nameHash, address indexed owner, uint256 newExpiresAt, uint256 feeDeducted);
    event NameExpired(bytes32 indexed nameHash, address indexed previousOwner, uint256 lockReturned);
    event NameRevoked(bytes32 indexed nameHash, address indexed previousOwner, string reason);
    event NameAssigned(bytes32 indexed nameHash, address indexed newOwner);
    event QuaiAddressUpdated(bytes32 indexed nameHash, address quaiAddress);
    event QiPaymentCodeUpdated(bytes32 indexed nameHash, string paymentCode);
    event AvatarUpdated(bytes32 indexed nameHash, uint256 avatarSize);
    event ProfileUpdated(bytes32 indexed nameHash);
    event NostrPubkeyUpdated(bytes32 indexed nameHash, string nostrPubkey);
    event ContentHashUpdated(bytes32 indexed nameHash, bytes contentHash);
    event NameReserved(bytes32 indexed nameHash);
    event NameUnreserved(bytes32 indexed nameHash);
    event NameBlocked(bytes32 indexed nameHash);
    event MarketplaceBidPlaced(bytes32 indexed nameHash, uint256 bidIndex, address indexed bidder, uint256 amount);
    event MarketplaceBidCancelled(bytes32 indexed nameHash, uint256 bidIndex, address indexed bidder, uint256 amount);
    event MarketplaceBidAccepted(bytes32 indexed nameHash, uint256 bidIndex, address indexed seller, address indexed buyer, uint256 amount);

    // ============ Errors ============

    error NameAlreadyRegistered();
    error NameNotRegistered();
    error NotOwner();
    error NotAdmin();
    error InsufficientBid();
    error InsufficientPayment();
    error InvalidPaymentCode();
    error AvatarTooLarge();
    error InvalidName();
    error TransferFailed();
    error NameReservedByAdmin();
    error NameIsBlocked();
    error AuctionNotEnded();
    error AuctionAlreadyFinalized();
    error AuctionAlreadyExists();
    error AuctionNotFound();
    error BidTooLow();
    error BidNotFound();
    error NotBidder();
    error TransferFeeRequired();
    error NameNotExpired();
    error InsufficientLockForRenewal();
    error NameTooShortForInstantRegistration();
    error NameTooLongForAuction();

    // ============ Modifiers ============

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    modifier onlyNameOwner(bytes32 nameHash) {
        if (ownerOf(uint256(nameHash)) != msg.sender) revert NotOwner();
        _;
    }

    // ============ Constructor ============

    constructor(
        uint256 _registrationFee7Plus,
        uint256 _auctionFloor4to6,
        uint256 _auctionFloor1to3,
        uint256 _minLockAmount,
        uint256 _quaiPerQi,
        uint256 _yearlyPriceQi5Plus,
        uint256 _yearlyPriceQi4Char,
        uint256 _yearlyPriceQi3OrLess
    ) ERC721("Quai Network Name Service", "QNNS") {
        deployer = msg.sender;
        admin = msg.sender;
        burnAddress = address(0xdead);
        auctionDuration = 1 days;
        antiSnipeWindow = 30 minutes;
        registrationFee7Plus = _registrationFee7Plus;
        auctionFloor4to6 = _auctionFloor4to6;
        auctionFloor1to3 = _auctionFloor1to3;
        minLockAmount = _minLockAmount;
        quaiPerQi = _quaiPerQi;
        yearlyPriceQi5Plus = _yearlyPriceQi5Plus;
        yearlyPriceQi4Char = _yearlyPriceQi4Char;
        yearlyPriceQi3OrLess = _yearlyPriceQi3OrLess;
        nextAuctionId = 1;
    }

    // ============ Pricing ============

    function getYearlyPriceQuai(bytes32 nameHash) public view returns (uint256) {
        uint256 nameLen = bytes(nameCore[nameHash].name).length;
        return getYearlyPriceQuaiByLength(nameLen);
    }

    function getYearlyPriceQuaiByLength(uint256 len) public view returns (uint256) {
        uint256 qiPrice;
        if (len <= 3) {
            qiPrice = yearlyPriceQi3OrLess;
        } else if (len == 4) {
            qiPrice = yearlyPriceQi4Char;
        } else {
            qiPrice = yearlyPriceQi5Plus;
        }
        return (qiPrice * quaiPerQi) / 1e18;
    }

    function getAuctionFloor(uint256 nameLen) public view returns (uint256) {
        if (nameLen <= 3) {
            return auctionFloor1to3;
        } else if (nameLen <= 6) {
            return auctionFloor4to6;
        }
        return 0; // 7+ char names use instant registration
    }

    function getRegistrationFee(uint256 nameLen) public view returns (uint256) {
        if (nameLen >= 7) {
            return registrationFee7Plus;
        }
        return 0; // Short names use auction, not flat fee
    }

    // ============ Instant Registration (7+ chars) ============

    /**
     * @notice Instantly register a name with 7 or more characters
     * @param name The name to register (must be 7+ characters)
     * @param quaiAddress The Quai address to associate with the name
     * @param qiPaymentCode Optional Qi BIP47 payment code
     */
    function register(
        string calldata name,
        address quaiAddress,
        string calldata qiPaymentCode
    ) external payable {
        _validateName(name);

        bytes32 nameHash = keccak256(abi.encodePacked(name));

        if (blocked[nameHash]) revert NameIsBlocked();
        if (reserved[nameHash]) revert NameReservedByAdmin();

        // Only 7+ character names can use instant registration
        uint256 nameLen = bytes(name).length;
        if (nameLen < 7) revert NameTooShortForInstantRegistration();

        // If name is registered, check if it's past grace period
        if (isRegistered[nameHash]) {
            uint256 expiry = nameCore[nameHash].expiresAt;
            if (expiry == 0 || block.timestamp < expiry + GRACE_PERIOD) {
                revert NameAlreadyRegistered();
            }
            // Auto-expire: name is past grace period
            _expireNameInternal(nameHash);
        }

        // Check no active auction for this name
        uint256 existingAuctionId = nameToActiveAuction[nameHash];
        if (existingAuctionId != 0 && !auctions[existingAuctionId].finalized) {
            revert AuctionAlreadyExists();
        }

        if (bytes(qiPaymentCode).length > 0) {
            _validatePaymentCode(qiPaymentCode);
        }

        // Calculate yearly fee by name length
        uint256 yearlyFee = getYearlyPriceQuaiByLength(nameLen);

        // Registration fee + lock deposit + first year's fee required
        if (msg.value < registrationFee7Plus + minLockAmount + yearlyFee) revert InsufficientPayment();

        // Distribute registration fee: 99% burned, 1% deployer
        _distributeFee(registrationFee7Plus);

        // Distribute yearly fee: 99% burned, 1% deployer
        _distributeFee(yearlyFee);

        // Lock amount is remaining value after fees
        uint256 lockDeposit = msg.value - registrationFee7Plus - yearlyFee;

        // Register the name
        isRegistered[nameHash] = true;

        NameCore storage nc = nameCore[nameHash];
        nc.name = name;
        nc.lockAmount = lockDeposit;
        nc.auctionId = 0;
        nc.expiresAt = block.timestamp + 365 days;
        nc.quaiAddress = quaiAddress;
        nc.qiPaymentCode = qiPaymentCode;

        _mint(msg.sender, uint256(nameHash));

        emit NameRegistered(nameHash, name, msg.sender, registrationFee7Plus, lockDeposit);
    }

    // ============ Registration — English Auction (1-6 chars) ============

    function startAuction(string calldata name) external payable {
        _validateName(name);

        bytes32 nameHash = keccak256(abi.encodePacked(name));

        if (blocked[nameHash]) revert NameIsBlocked();
        if (reserved[nameHash]) revert NameReservedByAdmin();

        // Only 1-6 character names go through auction
        uint256 nameLen = bytes(name).length;
        if (nameLen >= 7) revert NameTooLongForAuction();

        // If name is registered, check if it's past grace period
        if (isRegistered[nameHash]) {
            uint256 expiry = nameCore[nameHash].expiresAt;
            if (expiry == 0 || block.timestamp < expiry + GRACE_PERIOD) {
                revert NameAlreadyRegistered();
            }
            // Auto-expire: name is past grace period
            _expireNameInternal(nameHash);
        }

        // Check no active auction for this name
        uint256 existingAuctionId = nameToActiveAuction[nameHash];
        if (existingAuctionId != 0 && !auctions[existingAuctionId].finalized) {
            revert AuctionAlreadyExists();
        }

        // Check minimum bid based on name length tier
        uint256 minBid = getAuctionFloor(nameLen);
        if (msg.value < minBid) revert InsufficientBid();

        uint256 auctionId = nextAuctionId++;
        uint256 endTime = block.timestamp + auctionDuration;

        auctions[auctionId] = Auction({
            nameHash: nameHash,
            name: name,
            initiator: msg.sender,
            highestBidder: msg.sender,
            highestBid: msg.value,
            startTime: block.timestamp,
            endTime: endTime,
            finalized: false
        });

        nameToActiveAuction[nameHash] = auctionId;

        emit AuctionStarted(auctionId, nameHash, name, msg.sender, msg.value, endTime);
    }

    function bid(uint256 auctionId) external payable {
        Auction storage a = auctions[auctionId];
        if (a.startTime == 0) revert AuctionNotFound();
        if (a.finalized) revert AuctionAlreadyFinalized();
        if (block.timestamp >= a.endTime) revert AuctionNotEnded();
        if (msg.value <= a.highestBid) revert BidTooLow();

        address previousBidder = a.highestBidder;
        uint256 previousBid = a.highestBid;

        a.highestBidder = msg.sender;
        a.highestBid = msg.value;

        // Anti-snipe: extend auction if bid is near the end
        if (block.timestamp + antiSnipeWindow >= a.endTime) {
            a.endTime = block.timestamp + antiSnipeWindow;
        }

        if (previousBidder != address(0) && previousBid > 0) {
            (bool success,) = payable(previousBidder).call{value: previousBid}("");
            if (!success) revert TransferFailed();
        }

        emit AuctionBid(auctionId, msg.sender, msg.value, a.endTime);
    }

    function finalizeAuction(
        uint256 auctionId,
        address quaiAddress,
        string calldata qiPaymentCode
    ) external payable {
        Auction storage a = auctions[auctionId];
        if (a.startTime == 0) revert AuctionNotFound();
        if (a.finalized) revert AuctionAlreadyFinalized();
        if (block.timestamp < a.endTime) revert AuctionNotEnded();

        if (bytes(qiPaymentCode).length > 0) {
            _validatePaymentCode(qiPaymentCode);
        }

        // Calculate yearly fee by name length
        uint256 yearlyFee = getYearlyPriceQuaiByLength(bytes(a.name).length);

        // Lock deposit + first year's fee required
        if (msg.value < minLockAmount + yearlyFee) revert InsufficientPayment();

        a.finalized = true;

        bytes32 nameHash = a.nameHash;
        address winner = a.highestBidder;
        uint256 winningBid = a.highestBid;

        // Distribute winning bid: 99% burned, 1% deployer
        _distributeFee(winningBid);

        // Distribute yearly fee: 99% burned, 1% deployer
        _distributeFee(yearlyFee);

        // Lock amount is msg.value minus yearly fee
        uint256 lockDeposit = msg.value - yearlyFee;

        // Register the name
        isRegistered[nameHash] = true;

        NameCore storage nc = nameCore[nameHash];
        nc.name = a.name;
        nc.lockAmount = lockDeposit;
        nc.auctionId = auctionId;
        nc.expiresAt = block.timestamp + 365 days;
        nc.quaiAddress = quaiAddress;
        nc.qiPaymentCode = qiPaymentCode;

        _mint(winner, uint256(nameHash));

        emit AuctionFinalized(auctionId, nameHash, winner, winningBid, lockDeposit);
    }

    // ============ Renewal ============

    function renew(bytes32 nameHash) external payable {
        if (!isRegistered[nameHash]) revert NameNotRegistered();

        uint256 yearlyFee = getYearlyPriceQuai(nameHash);
        if (msg.value < yearlyFee) revert InsufficientPayment();

        _distributeFee(yearlyFee);

        // Refund excess
        uint256 excess = msg.value - yearlyFee;
        if (excess > 0) {
            (bool refundSuccess,) = payable(msg.sender).call{value: excess}("");
            if (!refundSuccess) revert TransferFailed();
        }

        // Extend expiry: stack from current expiry or from now if expired
        NameCore storage nc = nameCore[nameHash];
        uint256 baseTime = nc.expiresAt > block.timestamp ? nc.expiresAt : block.timestamp;
        nc.expiresAt = baseTime + 365 days;

        emit NameRenewed(nameHash, msg.sender, nc.expiresAt, yearlyFee);
    }

    function renewFromLock(bytes32 nameHash) external onlyNameOwner(nameHash) {
        if (!isRegistered[nameHash]) revert NameNotRegistered();

        uint256 yearlyFee = getYearlyPriceQuai(nameHash);
        NameCore storage nc = nameCore[nameHash];

        if (nc.lockAmount < yearlyFee) revert InsufficientLockForRenewal();

        nc.lockAmount -= yearlyFee;
        _distributeFee(yearlyFee);

        uint256 baseTime = nc.expiresAt > block.timestamp ? nc.expiresAt : block.timestamp;
        nc.expiresAt = baseTime + 365 days;

        emit NameRenewedFromLock(nameHash, msg.sender, nc.expiresAt, yearlyFee);
    }

    // ============ Expiry ============

    function expireName(bytes32 nameHash) external {
        if (!isRegistered[nameHash]) revert NameNotRegistered();

        NameCore storage nc = nameCore[nameHash];
        if (nc.expiresAt == 0 || block.timestamp < nc.expiresAt + GRACE_PERIOD) {
            revert NameNotExpired();
        }

        _expireNameInternal(nameHash);
    }

    function _expireNameInternal(bytes32 nameHash) internal {
        address owner = ownerOf(uint256(nameHash));
        uint256 lockAmount = nameCore[nameHash].lockAmount;

        _releaseName(nameHash);

        if (lockAmount > 0) {
            (bool success,) = payable(owner).call{value: lockAmount}("");
            if (!success) revert TransferFailed();
        }

        emit NameExpired(nameHash, owner, lockAmount);
    }

    // ============ Expiry View Functions ============

    function isExpired(bytes32 nameHash) public view returns (bool) {
        if (!isRegistered[nameHash]) return false;
        uint256 expiry = nameCore[nameHash].expiresAt;
        if (expiry == 0) return false;
        return block.timestamp >= expiry + GRACE_PERIOD;
    }

    function isInGracePeriod(bytes32 nameHash) public view returns (bool) {
        if (!isRegistered[nameHash]) return false;
        uint256 expiry = nameCore[nameHash].expiresAt;
        if (expiry == 0) return false;
        return block.timestamp >= expiry && block.timestamp < expiry + GRACE_PERIOD;
    }

    function isActive(bytes32 nameHash) public view returns (bool) {
        if (!isRegistered[nameHash]) return false;
        uint256 expiry = nameCore[nameHash].expiresAt;
        if (expiry == 0) return false;
        return block.timestamp < expiry;
    }

    function getExpiresAt(bytes32 nameHash) external view returns (uint256) {
        return nameCore[nameHash].expiresAt;
    }

    function getTimeUntilExpiry(bytes32 nameHash) external view returns (uint256) {
        uint256 expiry = nameCore[nameHash].expiresAt;
        if (expiry == 0 || block.timestamp >= expiry) return 0;
        return expiry - block.timestamp;
    }

    // ============ Ownership & Lock ============

    function release(bytes32 nameHash) external onlyNameOwner(nameHash) {
        uint256 lockAmount = nameCore[nameHash].lockAmount;
        address owner = ownerOf(uint256(nameHash));

        _releaseName(nameHash);

        if (lockAmount > 0) {
            (bool success,) = payable(owner).call{value: lockAmount}("");
            if (!success) revert TransferFailed();
        }

        emit NameReleased(nameHash, owner, lockAmount);
    }

    // ============ Marketplace — Secondary Trading ============

    function placeBid(bytes32 nameHash) external payable {
        if (!isRegistered[nameHash]) revert NameNotRegistered();
        if (msg.value == 0) revert InsufficientBid();

        uint256 bidIndex = _marketplaceBids[nameHash].length;
        _marketplaceBids[nameHash].push(MarketplaceBid({
            bidder: msg.sender,
            amount: msg.value,
            timestamp: block.timestamp
        }));

        emit MarketplaceBidPlaced(nameHash, bidIndex, msg.sender, msg.value);
    }

    function cancelBid(bytes32 nameHash, uint256 bidIndex) external {
        MarketplaceBid[] storage bids = _marketplaceBids[nameHash];
        if (bidIndex >= bids.length) revert BidNotFound();

        MarketplaceBid storage b = bids[bidIndex];
        if (b.bidder != msg.sender) revert NotBidder();
        if (b.amount == 0) revert BidNotFound();

        uint256 amount = b.amount;
        b.amount = 0;

        (bool success,) = payable(msg.sender).call{value: amount}("");
        if (!success) revert TransferFailed();

        emit MarketplaceBidCancelled(nameHash, bidIndex, msg.sender, amount);
    }

    function acceptBid(bytes32 nameHash, uint256 bidIndex) external onlyNameOwner(nameHash) {
        MarketplaceBid[] storage bids = _marketplaceBids[nameHash];
        if (bidIndex >= bids.length) revert BidNotFound();

        MarketplaceBid storage b = bids[bidIndex];
        if (b.amount == 0) revert BidNotFound();

        address buyer = b.bidder;
        uint256 salePrice = b.amount;
        address seller = ownerOf(uint256(nameHash));

        b.amount = 0;

        // Fee = max(1% of sale, 1% of yearly rate)
        uint256 saleFee = (salePrice * DEPLOYER_FEE_BPS) / 10000;
        uint256 yearlyFloor = (getYearlyPriceQuai(nameHash) * DEPLOYER_FEE_BPS) / 10000;
        uint256 deployerFee = saleFee > yearlyFloor ? saleFee : yearlyFloor;
        if (deployerFee > salePrice) deployerFee = salePrice;

        uint256 sellerProceeds = salePrice - deployerFee;

        if (deployerFee > 0) {
            (bool feeSuccess,) = payable(deployer).call{value: deployerFee}("");
            if (!feeSuccess) revert TransferFailed();
        }

        if (sellerProceeds > 0) {
            (bool sellerSuccess,) = payable(seller).call{value: sellerProceeds}("");
            if (!sellerSuccess) revert TransferFailed();
        }

        _inMarketplaceTransfer = true;
        _transfer(seller, buyer, uint256(nameHash));
        _inMarketplaceTransfer = false;

        emit MarketplaceBidAccepted(nameHash, bidIndex, seller, buyer, salePrice);
    }

    function getMarketplaceBids(bytes32 nameHash) external view returns (MarketplaceBid[] memory) {
        return _marketplaceBids[nameHash];
    }

    function getMarketplaceBid(bytes32 nameHash, uint256 bidIndex) external view returns (MarketplaceBid memory) {
        return _marketplaceBids[nameHash][bidIndex];
    }

    // ============ ERC-721 Transfer Fee Enforcement ============

    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);

        if (from != address(0) && to != address(0) && !_inMarketplaceTransfer) {
            revert TransferFeeRequired();
        }

        return super._update(to, tokenId, auth);
    }

    function transferName(bytes32 nameHash, address to) external payable onlyNameOwner(nameHash) {
        uint256 minFee = getYearlyPriceQuai(nameHash) / 100; // 1% of yearly rate
        if (msg.value < minFee) revert TransferFeeRequired();

        if (msg.value > 0) {
            (bool feeSuccess,) = payable(deployer).call{value: msg.value}("");
            if (!feeSuccess) revert TransferFailed();
        }

        _inMarketplaceTransfer = true;
        _transfer(msg.sender, to, uint256(nameHash));
        _inMarketplaceTransfer = false;
    }

    // ============ Profile Management ============

    function setQuaiAddress(bytes32 nameHash, address newAddress) external onlyNameOwner(nameHash) {
        nameCore[nameHash].quaiAddress = newAddress;
        emit QuaiAddressUpdated(nameHash, newAddress);
    }

    function setQiPaymentCode(bytes32 nameHash, string calldata paymentCode) external onlyNameOwner(nameHash) {
        if (bytes(paymentCode).length > 0) {
            _validatePaymentCode(paymentCode);
        }
        nameCore[nameHash].qiPaymentCode = paymentCode;
        emit QiPaymentCodeUpdated(nameHash, paymentCode);
    }

    function setAvatar(bytes32 nameHash, bytes calldata avatarData) external onlyNameOwner(nameHash) {
        if (avatarData.length > MAX_AVATAR_SIZE) revert AvatarTooLarge();
        _nameProfile[nameHash].avatar = avatarData;
        emit AvatarUpdated(nameHash, avatarData.length);
    }

    function setProfile(
        bytes32 nameHash,
        string calldata displayName,
        string calldata description,
        string calldata url
    ) external onlyNameOwner(nameHash) {
        NameProfile storage np = _nameProfile[nameHash];
        np.displayName = displayName;
        np.description = description;
        np.url = url;
        emit ProfileUpdated(nameHash);
    }

    function setSocials(
        bytes32 nameHash,
        string calldata twitter,
        string calldata github,
        string calldata discord,
        string calldata telegram
    ) external onlyNameOwner(nameHash) {
        NameProfile storage np = _nameProfile[nameHash];
        np.twitter = twitter;
        np.github = github;
        np.discord = discord;
        np.telegram = telegram;
        emit ProfileUpdated(nameHash);
    }

    function setNostrPubkey(bytes32 nameHash, string calldata nostrPubkey) external onlyNameOwner(nameHash) {
        if (bytes(nostrPubkey).length > 0) {
            _validateNostrPubkey(nostrPubkey);
        }
        _nameProfile[nameHash].nostrPubkey = nostrPubkey;
        emit NostrPubkeyUpdated(nameHash, nostrPubkey);
    }

    function setContentHash(bytes32 nameHash, bytes calldata _contentHash) external onlyNameOwner(nameHash) {
        _nameProfile[nameHash].contentHash = _contentHash;
        emit ContentHashUpdated(nameHash, _contentHash);
    }

    // ============ Admin Functions ============

    function adminRevoke(bytes32 nameHash, string calldata reason) external onlyAdmin {
        if (!isRegistered[nameHash]) revert NameNotRegistered();
        address owner = ownerOf(uint256(nameHash));
        uint256 lockAmount = nameCore[nameHash].lockAmount;

        _releaseName(nameHash);

        if (lockAmount > 0) {
            (bool success,) = payable(owner).call{value: lockAmount}("");
            if (!success) revert TransferFailed();
        }

        emit NameRevoked(nameHash, owner, reason);
    }

    function adminAssign(
        bytes32 nameHash,
        string calldata name,
        address to,
        address quaiAddress,
        string calldata qiPaymentCode
    ) external payable onlyAdmin {
        if (blocked[nameHash]) revert NameIsBlocked();

        if (isRegistered[nameHash]) {
            address currentOwner = ownerOf(uint256(nameHash));
            uint256 lockAmount = nameCore[nameHash].lockAmount;
            _releaseName(nameHash);
            if (lockAmount > 0) {
                (bool success,) = payable(currentOwner).call{value: lockAmount}("");
                if (!success) revert TransferFailed();
            }
        }

        if (reserved[nameHash]) {
            reserved[nameHash] = false;
            emit NameUnreserved(nameHash);
        }

        isRegistered[nameHash] = true;

        NameCore storage nc = nameCore[nameHash];
        nc.name = name;
        nc.lockAmount = msg.value;
        nc.expiresAt = block.timestamp + 365 days;
        nc.quaiAddress = quaiAddress;
        nc.qiPaymentCode = qiPaymentCode;

        _mint(to, uint256(nameHash));

        emit NameAssigned(nameHash, to);
    }

    function adminReserve(bytes32[] calldata nameHashes) external onlyAdmin {
        for (uint256 i = 0; i < nameHashes.length; i++) {
            reserved[nameHashes[i]] = true;
            emit NameReserved(nameHashes[i]);
        }
    }

    function adminUnreserve(bytes32[] calldata nameHashes) external onlyAdmin {
        for (uint256 i = 0; i < nameHashes.length; i++) {
            reserved[nameHashes[i]] = false;
            emit NameUnreserved(nameHashes[i]);
        }
    }

    function adminBlock(bytes32[] calldata nameHashes) external onlyAdmin {
        for (uint256 i = 0; i < nameHashes.length; i++) {
            blocked[nameHashes[i]] = true;
            if (isRegistered[nameHashes[i]]) {
                address owner = ownerOf(uint256(nameHashes[i]));
                uint256 lockAmount = nameCore[nameHashes[i]].lockAmount;
                _releaseName(nameHashes[i]);
                if (lockAmount > 0) {
                    (bool success,) = payable(owner).call{value: lockAmount}("");
                    if (!success) revert TransferFailed();
                }
            }
            emit NameBlocked(nameHashes[i]);
        }
    }

    function adminSetRegistrationFee7Plus(uint256 newFee) external onlyAdmin {
        registrationFee7Plus = newFee;
    }

    function adminSetAuctionFloor4to6(uint256 newFloor) external onlyAdmin {
        auctionFloor4to6 = newFloor;
    }

    function adminSetAuctionFloor1to3(uint256 newFloor) external onlyAdmin {
        auctionFloor1to3 = newFloor;
    }

    function adminSetMinLockAmount(uint256 newMin) external onlyAdmin {
        minLockAmount = newMin;
    }

    function adminSetQuaiPerQi(uint256 newRate) external onlyAdmin {
        quaiPerQi = newRate;
    }

    function adminSetYearlyPriceQi5Plus(uint256 newPrice) external onlyAdmin {
        yearlyPriceQi5Plus = newPrice;
    }

    function adminSetYearlyPriceQi4Char(uint256 newPrice) external onlyAdmin {
        yearlyPriceQi4Char = newPrice;
    }

    function adminSetYearlyPriceQi3OrLess(uint256 newPrice) external onlyAdmin {
        yearlyPriceQi3OrLess = newPrice;
    }

    function adminSetAdmin(address newAdmin) external onlyAdmin {
        admin = newAdmin;
    }

    function adminSetAuctionDuration(uint256 newDuration) external onlyAdmin {
        auctionDuration = newDuration;
    }

    function adminSetAntiSnipeWindow(uint256 newWindow) external onlyAdmin {
        antiSnipeWindow = newWindow;
    }

    function adminSetBurnAddress(address newBurnAddress) external onlyAdmin {
        burnAddress = newBurnAddress;
    }

    // ============ View Functions ============

    function getNameData(bytes32 nameHash) external view returns (NameCore memory) {
        return nameCore[nameHash];
    }

    function getNameProfile(bytes32 nameHash) external view returns (NameProfile memory) {
        return _nameProfile[nameHash];
    }

    function getQuaiAddress(bytes32 nameHash) external view returns (address) {
        return nameCore[nameHash].quaiAddress;
    }

    function getQiPaymentCode(bytes32 nameHash) external view returns (string memory) {
        return nameCore[nameHash].qiPaymentCode;
    }

    function getNostrPubkey(bytes32 nameHash) external view returns (string memory) {
        return _nameProfile[nameHash].nostrPubkey;
    }

    function getAvatar(bytes32 nameHash) external view returns (bytes memory) {
        return _nameProfile[nameHash].avatar;
    }

    function getContentHash(bytes32 nameHash) external view returns (bytes memory) {
        return _nameProfile[nameHash].contentHash;
    }

    function getAuction(uint256 auctionId) external view returns (Auction memory) {
        return auctions[auctionId];
    }

    function isAvailable(string calldata name) external view returns (bool) {
        bytes32 nameHash = keccak256(abi.encodePacked(name));
        if (blocked[nameHash]) return false;
        if (reserved[nameHash]) return false;
        if (isRegistered[nameHash]) {
            uint256 expiry = nameCore[nameHash].expiresAt;
            if (expiry == 0 || block.timestamp < expiry + GRACE_PERIOD) {
                return false;
            }
        }
        uint256 auctionId = nameToActiveAuction[nameHash];
        if (auctionId != 0 && !auctions[auctionId].finalized) return false;
        return true;
    }

    function isReserved(string calldata name) external view returns (bool) {
        bytes32 nameHash = keccak256(abi.encodePacked(name));
        return reserved[nameHash];
    }

    function isBlocked(string calldata name) external view returns (bool) {
        bytes32 nameHash = keccak256(abi.encodePacked(name));
        return blocked[nameHash];
    }

    function hashName(string calldata name) external pure returns (bytes32) {
        return keccak256(abi.encodePacked(name));
    }

    // ============ Internal Functions ============

    function _releaseName(bytes32 nameHash) internal {
        _burn(uint256(nameHash));
        isRegistered[nameHash] = false;
        delete nameCore[nameHash];
        delete _nameProfile[nameHash];
    }

    function _distributeFee(uint256 amount) internal {
        uint256 deployerFee = (amount * DEPLOYER_FEE_BPS) / 10000;
        uint256 burnAmt = amount - deployerFee;

        if (deployerFee > 0) {
            (bool feeSuccess,) = payable(deployer).call{value: deployerFee}("");
            if (!feeSuccess) revert TransferFailed();
        }
        if (burnAmt > 0) {
            (bool burnSuccess,) = payable(burnAddress).call{value: burnAmt}("");
            if (!burnSuccess) revert TransferFailed();
        }
    }

    function _validateName(string calldata name) internal pure {
        bytes memory b = bytes(name);
        if (b.length == 0 || b.length > 64) revert InvalidName();

        for (uint256 i = 0; i < b.length; i++) {
            bytes1 char = b[i];
            bool valid = (char >= 0x61 && char <= 0x7a) || // a-z
                         (char >= 0x30 && char <= 0x39) || // 0-9
                         char == 0x2d || // -
                         char == 0x5f;   // _
            if (!valid) revert InvalidName();
        }
    }

    function _validatePaymentCode(string calldata code) internal pure {
        bytes memory b = bytes(code);
        if (b.length < 100 || b.length > 120) revert InvalidPaymentCode();
        if (b[0] != 'P' || b[1] != 'M' || b[2] != '8' || b[3] != 'T') {
            revert InvalidPaymentCode();
        }
    }

    function _validateNostrPubkey(string calldata pubkey) internal pure {
        bytes memory b = bytes(pubkey);
        if (b.length != 64) revert InvalidName();
        for (uint256 i = 0; i < 64; i++) {
            bytes1 c = b[i];
            bool valid = (c >= 0x30 && c <= 0x39) || // 0-9
                         (c >= 0x61 && c <= 0x66);    // a-f
            if (!valid) revert InvalidName();
        }
    }

    receive() external payable {}
}
