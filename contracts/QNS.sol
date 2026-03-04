// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title QNS - Quai Name Service
 * @notice Soulbound name registry for Quai Network
 * @dev
 * - Soulbound: names cannot be transferred (no secondary market)
 * - One name per address: registering a new name releases the old one
 * - Commit-reveal: prevents front-running
 * - Heartbeat: 2-year inactivity reclaim
 * - Admin: can revoke, reassign, reserve, and block names
 * - 48hr claim period before name goes live
 * - On-chain avatar (128x128, max 15KB)
 * - Quai address + Qi payment code (BIP47)
 * - Nostr pubkey for decentralized messaging
 */
contract QNS {
    // ============ Types ============

    struct Profile {
        address owner;
        address quaiAddress;        // Quai address for receiving payments
        string qiPaymentCode;       // BIP47 payment code for Qi
        bytes avatar;               // On-chain avatar (max 15KB)
        string displayName;
        string description;
        string url;
        string twitter;
        string github;
        string discord;
        string telegram;
        string nostrPubkey;         // Nostr public key (hex, 64 chars)
        uint256 registeredAt;       // When the name was registered
        uint256 claimableAt;        // When the name becomes active (48hr after registration)
        uint256 lastActive;         // Last heartbeat timestamp
    }

    struct Commitment {
        address committer;
        uint256 timestamp;
    }

    // ============ State ============

    /// @notice Mapping from name hash to profile
    mapping(bytes32 => Profile) public profiles;

    /// @notice Mapping from name hash to registered status
    mapping(bytes32 => bool) public isRegistered;

    /// @notice Mapping from address to their name hash (one name per address)
    mapping(address => bytes32) public addressToName;

    /// @notice Commit-reveal: commitment hash to commitment data
    mapping(bytes32 => Commitment) public commitments;

    /// @notice Reserved names (admin-only registration)
    mapping(bytes32 => bool) public reserved;

    /// @notice Blocked names (cannot be registered at all)
    mapping(bytes32 => bool) public blocked;

    /// @notice Admin address
    address public admin;

    /// @notice Fee collector address
    address public feeCollector;

    /// @notice Registration fee (500 QUAI)
    uint256 public registrationFee;

    // ============ Constants ============

    uint256 public constant MAX_AVATAR_SIZE = 15360;        // 15KB
    uint256 public constant CLAIM_PERIOD = 48 hours;        // Pending period before name goes live
    uint256 public constant INACTIVITY_PERIOD = 730 days;   // ~2 years
    uint256 public constant MIN_COMMIT_AGE = 1 minutes;     // Minimum time between commit and reveal
    uint256 public constant MAX_COMMIT_AGE = 24 hours;      // Maximum time between commit and reveal

    // ============ Events ============

    event NameCommitted(bytes32 indexed commitHash, address indexed committer);
    event NameRegistered(bytes32 indexed nameHash, string name, address indexed owner);
    event NameReleased(bytes32 indexed nameHash, address indexed previousOwner);
    event NameRevoked(bytes32 indexed nameHash, address indexed previousOwner, string reason);
    event NameAssigned(bytes32 indexed nameHash, address indexed newOwner);
    event QuaiAddressUpdated(bytes32 indexed nameHash, address quaiAddress);
    event QiPaymentCodeUpdated(bytes32 indexed nameHash, string paymentCode);
    event AvatarUpdated(bytes32 indexed nameHash, uint256 avatarSize);
    event ProfileUpdated(bytes32 indexed nameHash);
    event NostrPubkeyUpdated(bytes32 indexed nameHash, string nostrPubkey);
    event Heartbeat(bytes32 indexed nameHash, uint256 timestamp);
    event InactiveReclaimed(bytes32 indexed nameHash, address indexed previousOwner);
    event NameReserved(bytes32 indexed nameHash);
    event NameBlocked(bytes32 indexed nameHash);
    event NameUnreserved(bytes32 indexed nameHash);

    // ============ Errors ============

    error NameAlreadyRegistered();
    error NameNotRegistered();
    error NotOwner();
    error InsufficientFee();
    error InvalidPaymentCode();
    error AvatarTooLarge();
    error InvalidName();
    error TransferFailed();
    error NameReservedByAdmin();
    error NameIsBlocked();
    error NotAdmin();
    error CommitmentTooNew();
    error CommitmentTooOld();
    error CommitmentNotFound();
    error InvalidCommitment();
    error NameStillActive();
    error NameNotLiveYet();
    error AlreadyHasName();

    // ============ Modifiers ============

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    modifier onlyNameOwner(bytes32 nameHash) {
        if (profiles[nameHash].owner != msg.sender) revert NotOwner();
        _;
    }

    modifier nameIsLive(bytes32 nameHash) {
        if (!isRegistered[nameHash]) revert NameNotRegistered();
        if (block.timestamp < profiles[nameHash].claimableAt) revert NameNotLiveYet();
        _;
    }

    // ============ Constructor ============

    constructor(address _feeCollector, uint256 _registrationFee) {
        admin = msg.sender;
        feeCollector = _feeCollector;
        registrationFee = _registrationFee;
    }

    // ============ Registration (Commit-Reveal) ============

    /**
     * @notice Step 1: Commit to a name registration (hides the name)
     * @param commitHash keccak256(abi.encodePacked(name, owner, secret))
     */
    function commit(bytes32 commitHash) external {
        commitments[commitHash] = Commitment({
            committer: msg.sender,
            timestamp: block.timestamp
        });
        emit NameCommitted(commitHash, msg.sender);
    }

    /**
     * @notice Step 2: Reveal and register the name
     * @param name The human-readable name to register
     * @param secret The secret used in the commitment
     * @param quaiAddress Address for receiving Quai payments
     * @param qiPaymentCode BIP47 payment code for Qi
     */
    function reveal(
        string calldata name,
        bytes32 secret,
        address quaiAddress,
        string calldata qiPaymentCode
    ) external payable {
        _validateName(name);

        bytes32 nameHash = keccak256(abi.encodePacked(name));

        // Check blocked and reserved
        if (blocked[nameHash]) revert NameIsBlocked();
        if (reserved[nameHash]) revert NameReservedByAdmin();

        // Check not already registered
        if (isRegistered[nameHash]) revert NameAlreadyRegistered();

        // Verify commitment
        bytes32 commitHash = keccak256(abi.encodePacked(name, msg.sender, secret));
        Commitment storage c = commitments[commitHash];
        if (c.timestamp == 0) revert CommitmentNotFound();
        if (block.timestamp < c.timestamp + MIN_COMMIT_AGE) revert CommitmentTooNew();
        if (block.timestamp > c.timestamp + MAX_COMMIT_AGE) revert CommitmentTooOld();

        // Check fee
        if (msg.value < registrationFee) revert InsufficientFee();

        // Validate Qi payment code
        if (bytes(qiPaymentCode).length > 0) {
            _validatePaymentCode(qiPaymentCode);
        }

        // If sender already has a name, release it
        bytes32 existingName = addressToName[msg.sender];
        if (existingName != bytes32(0) && isRegistered[existingName]) {
            _releaseName(existingName);
        }

        // Register (set fields via storage pointer to avoid stack-too-deep)
        Profile storage p = profiles[nameHash];
        p.owner = msg.sender;
        p.quaiAddress = quaiAddress;
        p.qiPaymentCode = qiPaymentCode;
        p.registeredAt = block.timestamp;
        p.claimableAt = block.timestamp + CLAIM_PERIOD;
        p.lastActive = block.timestamp;

        isRegistered[nameHash] = true;
        addressToName[msg.sender] = nameHash;

        // Clean up commitment
        delete commitments[commitHash];

        // Forward fees
        if (msg.value > 0 && feeCollector != address(0)) {
            (bool success, ) = feeCollector.call{value: msg.value}("");
            if (!success) revert TransferFailed();
        }

        emit NameRegistered(nameHash, name, msg.sender);
    }

    // ============ Profile Management ============

    /**
     * @notice Update Quai address
     */
    function setQuaiAddress(
        bytes32 nameHash,
        address newAddress
    ) external onlyNameOwner(nameHash) nameIsLive(nameHash) {
        profiles[nameHash].quaiAddress = newAddress;
        _touch(nameHash);
        emit QuaiAddressUpdated(nameHash, newAddress);
    }

    /**
     * @notice Update Qi payment code
     */
    function setQiPaymentCode(
        bytes32 nameHash,
        string calldata paymentCode
    ) external onlyNameOwner(nameHash) nameIsLive(nameHash) {
        if (bytes(paymentCode).length > 0) {
            _validatePaymentCode(paymentCode);
        }
        profiles[nameHash].qiPaymentCode = paymentCode;
        _touch(nameHash);
        emit QiPaymentCodeUpdated(nameHash, paymentCode);
    }

    /**
     * @notice Set on-chain avatar (max 15KB)
     */
    function setAvatar(
        bytes32 nameHash,
        bytes calldata avatarData
    ) external onlyNameOwner(nameHash) nameIsLive(nameHash) {
        if (avatarData.length > MAX_AVATAR_SIZE) revert AvatarTooLarge();
        profiles[nameHash].avatar = avatarData;
        _touch(nameHash);
        emit AvatarUpdated(nameHash, avatarData.length);
    }

    /**
     * @notice Update profile text fields
     */
    function setProfile(
        bytes32 nameHash,
        string calldata displayName,
        string calldata description,
        string calldata url
    ) external onlyNameOwner(nameHash) nameIsLive(nameHash) {
        Profile storage p = profiles[nameHash];
        p.displayName = displayName;
        p.description = description;
        p.url = url;
        _touch(nameHash);
        emit ProfileUpdated(nameHash);
    }

    /**
     * @notice Update social links
     */
    function setSocials(
        bytes32 nameHash,
        string calldata twitter,
        string calldata github,
        string calldata discord,
        string calldata telegram
    ) external onlyNameOwner(nameHash) nameIsLive(nameHash) {
        Profile storage p = profiles[nameHash];
        p.twitter = twitter;
        p.github = github;
        p.discord = discord;
        p.telegram = telegram;
        _touch(nameHash);
        emit ProfileUpdated(nameHash);
    }

    /**
     * @notice Update Nostr public key (hex-encoded, 64 chars)
     */
    function setNostrPubkey(
        bytes32 nameHash,
        string calldata nostrPubkey
    ) external onlyNameOwner(nameHash) nameIsLive(nameHash) {
        if (bytes(nostrPubkey).length > 0) {
            _validateNostrPubkey(nostrPubkey);
        }
        profiles[nameHash].nostrPubkey = nostrPubkey;
        _touch(nameHash);
        emit NostrPubkeyUpdated(nameHash, nostrPubkey);
    }

    /**
     * @notice Heartbeat - prove you're still active
     */
    function keepAlive(bytes32 nameHash) external onlyNameOwner(nameHash) {
        _touch(nameHash);
    }

    /**
     * @notice Voluntarily release your name
     */
    function release(bytes32 nameHash) external onlyNameOwner(nameHash) {
        _releaseName(nameHash);
    }

    // ============ Inactivity Reclaim ============

    /**
     * @notice Reclaim an inactive name (no interaction for 2 years)
     * @dev Anyone can call this for any name that has been inactive
     */
    function reclaimInactive(bytes32 nameHash) external {
        if (!isRegistered[nameHash]) revert NameNotRegistered();

        Profile storage p = profiles[nameHash];
        if (block.timestamp < p.lastActive + INACTIVITY_PERIOD) {
            revert NameStillActive();
        }

        address previousOwner = p.owner;
        _releaseName(nameHash);
        emit InactiveReclaimed(nameHash, previousOwner);
    }

    // ============ Admin Functions ============

    /**
     * @notice Admin: revoke a name with reason
     */
    function adminRevoke(bytes32 nameHash, string calldata reason) external onlyAdmin {
        if (!isRegistered[nameHash]) revert NameNotRegistered();
        address previousOwner = profiles[nameHash].owner;
        _releaseName(nameHash);
        emit NameRevoked(nameHash, previousOwner, reason);
    }

    /**
     * @notice Admin: assign a name directly (for reserved names or reassignment)
     */
    function adminAssign(
        bytes32 nameHash,
        string calldata name,
        address to,
        address quaiAddress,
        string calldata qiPaymentCode
    ) external onlyAdmin {
        if (blocked[nameHash]) revert NameIsBlocked();

        // If already registered, release it first
        if (isRegistered[nameHash]) {
            _releaseName(nameHash);
        }

        // If target already has a name, release it
        bytes32 existingName = addressToName[to];
        if (existingName != bytes32(0) && isRegistered[existingName]) {
            _releaseName(existingName);
        }

        // Remove reserved flag if set
        if (reserved[nameHash]) {
            reserved[nameHash] = false;
            emit NameUnreserved(nameHash);
        }

        // Set fields via storage pointer to avoid stack-too-deep
        Profile storage prof = profiles[nameHash];
        prof.owner = to;
        prof.quaiAddress = quaiAddress;
        prof.qiPaymentCode = qiPaymentCode;
        prof.registeredAt = block.timestamp;
        prof.claimableAt = block.timestamp; // No claim period for admin assignments
        prof.lastActive = block.timestamp;

        isRegistered[nameHash] = true;
        addressToName[to] = nameHash;

        emit NameAssigned(nameHash, to);
        emit NameRegistered(nameHash, name, to);
    }

    /**
     * @notice Admin: reserve names (prevents public registration)
     */
    function adminReserve(bytes32[] calldata nameHashes) external onlyAdmin {
        for (uint i = 0; i < nameHashes.length; i++) {
            reserved[nameHashes[i]] = true;
            emit NameReserved(nameHashes[i]);
        }
    }

    /**
     * @notice Admin: unreserve names
     */
    function adminUnreserve(bytes32[] calldata nameHashes) external onlyAdmin {
        for (uint i = 0; i < nameHashes.length; i++) {
            reserved[nameHashes[i]] = false;
            emit NameUnreserved(nameHashes[i]);
        }
    }

    /**
     * @notice Admin: block names permanently
     */
    function adminBlock(bytes32[] calldata nameHashes) external onlyAdmin {
        for (uint i = 0; i < nameHashes.length; i++) {
            blocked[nameHashes[i]] = true;
            // If registered, release it
            if (isRegistered[nameHashes[i]]) {
                _releaseName(nameHashes[i]);
            }
            emit NameBlocked(nameHashes[i]);
        }
    }

    /**
     * @notice Admin: update registration fee
     */
    function adminSetFee(uint256 newFee) external onlyAdmin {
        registrationFee = newFee;
    }

    /**
     * @notice Admin: update fee collector
     */
    function adminSetFeeCollector(address newCollector) external onlyAdmin {
        feeCollector = newCollector;
    }

    /**
     * @notice Admin: transfer admin role
     */
    function adminSetAdmin(address newAdmin) external onlyAdmin {
        admin = newAdmin;
    }

    // ============ View Functions ============

    function getProfile(bytes32 nameHash) external view returns (Profile memory) {
        return profiles[nameHash];
    }

    function getQuaiAddress(bytes32 nameHash) external view returns (address) {
        return profiles[nameHash].quaiAddress;
    }

    function getQiPaymentCode(bytes32 nameHash) external view returns (string memory) {
        return profiles[nameHash].qiPaymentCode;
    }

    function getNostrPubkey(bytes32 nameHash) external view returns (string memory) {
        return profiles[nameHash].nostrPubkey;
    }

    function getAvatar(bytes32 nameHash) external view returns (bytes memory) {
        return profiles[nameHash].avatar;
    }

    function getNameOf(address addr) external view returns (bytes32) {
        return addressToName[addr];
    }

    function isAvailable(string calldata name) external view returns (bool) {
        bytes32 nameHash = keccak256(abi.encodePacked(name));
        if (blocked[nameHash]) return false;
        if (reserved[nameHash]) return false;
        return !isRegistered[nameHash];
    }

    function isLive(bytes32 nameHash) external view returns (bool) {
        if (!isRegistered[nameHash]) return false;
        return block.timestamp >= profiles[nameHash].claimableAt;
    }

    function isInactive(bytes32 nameHash) external view returns (bool) {
        if (!isRegistered[nameHash]) return false;
        return block.timestamp >= profiles[nameHash].lastActive + INACTIVITY_PERIOD;
    }

    function hashName(string calldata name) external pure returns (bytes32) {
        return keccak256(abi.encodePacked(name));
    }

    // ============ Internal Functions ============

    function _touch(bytes32 nameHash) internal {
        profiles[nameHash].lastActive = block.timestamp;
        emit Heartbeat(nameHash, block.timestamp);
    }

    function _releaseName(bytes32 nameHash) internal {
        Profile storage p = profiles[nameHash];
        address previousOwner = p.owner;

        // Clear reverse lookup
        if (addressToName[previousOwner] == nameHash) {
            delete addressToName[previousOwner];
        }

        // Clear profile
        delete profiles[nameHash];
        isRegistered[nameHash] = false;

        emit NameReleased(nameHash, previousOwner);
    }

    function _validateName(string calldata name) internal pure {
        bytes memory b = bytes(name);
        if (b.length == 0 || b.length > 64) revert InvalidName();

        for (uint i = 0; i < b.length; i++) {
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
        // Nostr public keys are 64 hex characters (32 bytes)
        if (b.length != 64) revert InvalidName(); // reuse error for simplicity
        for (uint i = 0; i < 64; i++) {
            bytes1 c = b[i];
            bool valid = (c >= 0x30 && c <= 0x39) || // 0-9
                         (c >= 0x61 && c <= 0x66);    // a-f
            if (!valid) revert InvalidName();
        }
    }
}
