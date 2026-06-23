// Mainnet module loader defaults. The legacy redirect module remains listed
// for explicit testing, but the primary example should be a static-site module
// that stores and renders bytes from contract state.
export const QNS_MAINNET_REDIRECT_MODULE_ADDRESS = '0x0033971a7f17EDde345904F6D823996e1aaB8658';
export const QNS_MAINNET_MARKDOWN_MODULE_ADDRESS = '0x006D6ca9F508531a686b83Bd370b7CA009891569';
export const QNS_MAINNET_EXAMPLE_MODULE_ADDRESS = '0x002BA558B2adea163F8d78B2d44ABec15622EdB6';
export const QNS_MAINNET_QNNS_ADDRESS = '0x001d4668f5621ee6211C396243faFe163A057516';
export const QNS_MAINNET_NAME_RESOLVER_ADDRESS = '0x004Aa57E161510Fc07Ad84b9269405Dcb9aC97A6';
export const QNS_MAINNET_ANCHOR_REGISTRY_ADDRESS = '0x000041d9d377ab357DD36e3205C9fB53fda40CC7';
export const QNS_MAINNET_LAUNCH_NAME = 'moduleexample';
export const QNS_MAINNET_QNNS_DEPLOY_BLOCK = 8652267;
export const QNS_MAINNET_SUBGRAPH_URL = 'https://graph.quai.network/subgraphs/name/qns/qnns';
export const QNS_MAINNET_IPFS_GATEWAY_URL = 'https://ipfs.qu.ai/ipfs/';

export const QNNS_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_QNNS_CONTRACT || process.env.NEXT_PUBLIC_QNS_CONTRACT || QNS_MAINNET_QNNS_ADDRESS;
export const QNNS_EVENT_SCAN_START_BLOCK = Number(process.env.NEXT_PUBLIC_QNNS_EVENT_SCAN_START_BLOCK || QNS_MAINNET_QNNS_DEPLOY_BLOCK);
export const QNS_ANCHOR_REGISTRY_ADDRESS = process.env.NEXT_PUBLIC_QNS_ANCHOR_REGISTRY || QNS_MAINNET_ANCHOR_REGISTRY_ADDRESS;
export const QNS_EXAMPLE_MODULE_ADDRESS = process.env.NEXT_PUBLIC_QNS_EXAMPLE_MODULE || QNS_MAINNET_EXAMPLE_MODULE_ADDRESS;
export const QNS_SUBGRAPH_URL = process.env.NEXT_PUBLIC_QNS_SUBGRAPH_URL || QNS_MAINNET_SUBGRAPH_URL;
export const QNS_IPFS_GATEWAY_URL = process.env.NEXT_PUBLIC_QNS_IPFS_GATEWAY_URL || QNS_MAINNET_IPFS_GATEWAY_URL;

export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://rpc.quai.network/cyprus1';

export const GRACE_PERIOD_SECONDS = 30 * 24 * 3600; // 30 days
export const ONE_YEAR_SECONDS = 365 * 24 * 3600;

export const QNNS_ABI = [
  // Instant Registration (7+ chars)
  'function register(string name, address quaiAddress, string qiPaymentCode) payable',

  // Auction (1-6 chars)
  'function startAuction(string name) payable',
  'function bid(uint256 auctionId) payable',
  'function finalizeAuction(uint256 auctionId, address quaiAddress, string qiPaymentCode) payable',

  // Renewal
  'function renew(bytes32 nameHash) payable',
  'function renewFromLock(bytes32 nameHash)',

  // Expiry
  'function expireName(bytes32 nameHash)',

  // Ownership & Lock
  'function release(bytes32 nameHash)',
  'function transferName(bytes32 nameHash, address to) payable',

  // Marketplace
  'function placeBid(bytes32 nameHash) payable',
  'function cancelBid(bytes32 nameHash, uint256 bidIndex)',
  'function acceptBid(bytes32 nameHash, uint256 bidIndex)',

  // Profile management
  'function setQuaiAddress(bytes32 nameHash, address newAddress)',
  'function setQiPaymentCode(bytes32 nameHash, string paymentCode)',
  'function setAvatar(bytes32 nameHash, bytes avatarData)',
  'function setProfile(bytes32 nameHash, string displayName, string description, string url)',
  'function setSocials(bytes32 nameHash, string twitter, string github, string discord, string telegram)',
  'function setNostrPubkey(bytes32 nameHash, string nostrPubkey)',
  'function setContentHash(bytes32 nameHash, bytes contentHash)',

  // View — Name data (split into core + profile)
  'function getNameData(bytes32 nameHash) view returns (tuple(string name, uint256 lockAmount, uint256 auctionId, uint256 expiresAt, address quaiAddress, string qiPaymentCode))',
  'function getNameProfile(bytes32 nameHash) view returns (tuple(bytes avatar, string displayName, string description, string url, string twitter, string github, string discord, string telegram, string nostrPubkey, bytes contentHash))',
  'function getQuaiAddress(bytes32 nameHash) view returns (address)',
  'function getQiPaymentCode(bytes32 nameHash) view returns (string)',
  'function getNostrPubkey(bytes32 nameHash) view returns (string)',
  'function getAvatar(bytes32 nameHash) view returns (bytes)',
  'function getContentHash(bytes32 nameHash) view returns (bytes)',

  // View — Pricing
  'function getYearlyPriceQuai(bytes32 nameHash) view returns (uint256)',
  'function getYearlyPriceQuaiByLength(uint256 len) view returns (uint256)',
  'function quaiPerQi() view returns (uint256)',
  'function minLockAmount() view returns (uint256)',
  'function registrationFee7Plus() view returns (uint256)',
  'function auctionFloor4to6() view returns (uint256)',
  'function auctionFloor1to3() view returns (uint256)',
  'function getAuctionFloor(uint256 nameLen) view returns (uint256)',
  'function getRegistrationFee(uint256 nameLen) view returns (uint256)',

  // View — Expiry
  'function isExpired(bytes32 nameHash) view returns (bool)',
  'function isInGracePeriod(bytes32 nameHash) view returns (bool)',
  'function isActive(bytes32 nameHash) view returns (bool)',
  'function getExpiresAt(bytes32 nameHash) view returns (uint256)',
  'function getTimeUntilExpiry(bytes32 nameHash) view returns (uint256)',

  // View — Auction & Marketplace
  'function getAuction(uint256 auctionId) view returns (tuple(bytes32 nameHash, string name, address initiator, address highestBidder, uint256 highestBid, uint256 startTime, uint256 endTime, bool finalized))',
  'function getMarketplaceBids(bytes32 nameHash) view returns (tuple(address bidder, uint256 amount, uint256 timestamp)[])',
  'function getMarketplaceBid(bytes32 nameHash, uint256 bidIndex) view returns (tuple(address bidder, uint256 amount, uint256 timestamp))',

  // View — General
  'function isAvailable(string name) view returns (bool)',
  'function isRegistered(bytes32 nameHash) view returns (bool)',
  'function isReserved(string name) view returns (bool)',
  'function isBlocked(string name) view returns (bool)',
  'function hashName(string name) pure returns (bytes32)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function balanceOf(address owner) view returns (uint256)',
  'function name() view returns (string)',
  'function symbol() view returns (string)',

  // Events
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
  'event NameRegistered(bytes32 indexed nameHash, string name, address indexed owner, uint256 fee, uint256 lockAmount)',
  'event AuctionStarted(uint256 indexed auctionId, bytes32 indexed nameHash, string name, address indexed initiator, uint256 openingBid, uint256 endTime)',
  'event AuctionBid(uint256 indexed auctionId, address indexed bidder, uint256 amount, uint256 newEndTime)',
  'event AuctionFinalized(uint256 indexed auctionId, bytes32 indexed nameHash, address indexed winner, uint256 winningBid, uint256 lockAmount)',
  'event NameReleased(bytes32 indexed nameHash, address indexed previousOwner, uint256 lockReturned)',
  'event NameRenewed(bytes32 indexed nameHash, address indexed renewedBy, uint256 newExpiresAt, uint256 feePaid)',
  'event NameExpired(bytes32 indexed nameHash, address indexed previousOwner, uint256 lockReturned)',
  'event MarketplaceBidPlaced(bytes32 indexed nameHash, uint256 bidIndex, address indexed bidder, uint256 amount)',
  'event MarketplaceBidCancelled(bytes32 indexed nameHash, uint256 bidIndex, address indexed bidder, uint256 amount)',
  'event MarketplaceBidAccepted(bytes32 indexed nameHash, uint256 bidIndex, address indexed seller, address indexed buyer, uint256 amount)',
  'event ContentHashUpdated(bytes32 indexed nameHash, bytes contentHash)',
];

// Backward-compatible aliases for the older QNS client module.
export const QNS_CONTRACT_ADDRESS = QNNS_CONTRACT_ADDRESS;
export const QNS_ABI = QNNS_ABI;
