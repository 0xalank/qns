/**
 * QNNS (Quai Network Name Service) SDK Client — v2
 *
 * ERC-721 name registry for Quai Network with:
 * - English auction registration (12hr, 1hr anti-snipe)
 * - Yearly renewable names with tiered pricing
 * - 30-day grace period after expiry
 * - Lock deposit (returned on release/expiry)
 * - Built-in marketplace (bid/offer)
 * - 1% deployer fee on auctions + renewals + transfers
 * - Admin-adjustable Qi/Quai exchange rate
 * - IPFS content hash resolution (EIP-1577)
 */

import { quais } from 'quais';
import {
  QNNSNameData,
  QNNSNameProfile,
  QNNSFullNameData,
  AuctionData,
  MarketplaceBidData,
  StartAuctionParams,
  FinalizeAuctionParams,
  ProfileParams,
  SocialsParams,
  TxResult,
  SDKConfig,
} from './types';

const QNNS_ABI = [
  // Auction
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
  'function minAuctionPrice() view returns (uint256)',
  'function minLockAmount() view returns (uint256)',
  'function yearlyPriceQi5Plus() view returns (uint256)',
  'function yearlyPriceQi4Char() view returns (uint256)',
  'function yearlyPriceQi3OrLess() view returns (uint256)',

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
  'function hashName(string name) pure returns (bytes32)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function balanceOf(address owner) view returns (uint256)',

  // Events
  'event AuctionStarted(uint256 indexed auctionId, bytes32 indexed nameHash, string name, address indexed initiator, uint256 openingBid, uint256 endTime)',
  'event AuctionBid(uint256 indexed auctionId, address indexed bidder, uint256 amount, uint256 newEndTime)',
  'event AuctionFinalized(uint256 indexed auctionId, bytes32 indexed nameHash, address indexed winner, uint256 winningBid, uint256 lockAmount)',
  'event NameReleased(bytes32 indexed nameHash, address indexed previousOwner, uint256 lockReturned)',
  'event NameRenewed(bytes32 indexed nameHash, address indexed renewedBy, uint256 newExpiresAt, uint256 feePaid)',
  'event NameRenewedFromLock(bytes32 indexed nameHash, address indexed owner, uint256 newExpiresAt, uint256 feeDeducted)',
  'event NameExpired(bytes32 indexed nameHash, address indexed previousOwner, uint256 lockReturned)',
  'event MarketplaceBidPlaced(bytes32 indexed nameHash, uint256 bidIndex, address indexed bidder, uint256 amount)',
  'event MarketplaceBidCancelled(bytes32 indexed nameHash, uint256 bidIndex, address indexed bidder, uint256 amount)',
  'event MarketplaceBidAccepted(bytes32 indexed nameHash, uint256 bidIndex, address indexed seller, address indexed buyer, uint256 amount)',
  'event ContentHashUpdated(bytes32 indexed nameHash, bytes contentHash)',
];

export class QNNSClient {
  private contract: quais.Contract;
  private provider: quais.Provider;
  private signer?: quais.Signer;

  constructor(config: SDKConfig, signer?: quais.Signer) {
    this.provider = new quais.JsonRpcProvider(config.rpcUrl, undefined, { usePathing: false });
    this.signer = signer;

    const contractSigner = signer || this.provider;
    this.contract = new quais.Contract(config.qnnsAddress, QNNS_ABI, contractSigner);
  }

  connect(signer: quais.Signer): QNNSClient {
    this.signer = signer;
    this.contract = this.contract.connect(signer) as quais.Contract;
    return this;
  }

  // ============ Auction ============

  async startAuction(params: StartAuctionParams): Promise<TxResult> {
    if (!this.signer) throw new Error('Signer required');
    const tx = await this.contract.startAuction(
      params.name.toLowerCase(),
      { value: params.bidAmount }
    );
    const receipt = await tx.wait();
    return {
      hash: receipt.hash,
      blockNumber: receipt.blockNumber,
      status: receipt.status === 1 ? 'confirmed' : 'failed',
    };
  }

  async bid(auctionId: bigint, amount: bigint): Promise<TxResult> {
    if (!this.signer) throw new Error('Signer required');
    const tx = await this.contract.bid(auctionId, { value: amount });
    const receipt = await tx.wait();
    return {
      hash: receipt.hash,
      blockNumber: receipt.blockNumber,
      status: receipt.status === 1 ? 'confirmed' : 'failed',
    };
  }

  async finalizeAuction(params: FinalizeAuctionParams): Promise<TxResult> {
    if (!this.signer) throw new Error('Signer required');
    const tx = await this.contract.finalizeAuction(
      params.auctionId,
      params.quaiAddress,
      params.qiPaymentCode || '',
      { value: params.payment }
    );
    const receipt = await tx.wait();
    return {
      hash: receipt.hash,
      blockNumber: receipt.blockNumber,
      status: receipt.status === 1 ? 'confirmed' : 'failed',
    };
  }

  // ============ Renewal ============

  async renew(name: string, payment: bigint): Promise<TxResult> {
    if (!this.signer) throw new Error('Signer required');
    const nameHash = await this.hashName(name);
    const tx = await this.contract.renew(nameHash, { value: payment });
    const receipt = await tx.wait();
    return { hash: receipt.hash, blockNumber: receipt.blockNumber, status: receipt.status === 1 ? 'confirmed' : 'failed' };
  }

  async renewFromLock(name: string): Promise<TxResult> {
    if (!this.signer) throw new Error('Signer required');
    const nameHash = await this.hashName(name);
    const tx = await this.contract.renewFromLock(nameHash);
    const receipt = await tx.wait();
    return { hash: receipt.hash, blockNumber: receipt.blockNumber, status: receipt.status === 1 ? 'confirmed' : 'failed' };
  }

  // ============ Expiry ============

  async expireName(name: string): Promise<TxResult> {
    if (!this.signer) throw new Error('Signer required');
    const nameHash = await this.hashName(name);
    const tx = await this.contract.expireName(nameHash);
    const receipt = await tx.wait();
    return { hash: receipt.hash, blockNumber: receipt.blockNumber, status: receipt.status === 1 ? 'confirmed' : 'failed' };
  }

  // ============ Ownership & Lock ============

  async release(name: string): Promise<TxResult> {
    if (!this.signer) throw new Error('Signer required');
    const nameHash = await this.hashName(name);
    const tx = await this.contract.release(nameHash);
    const receipt = await tx.wait();
    return { hash: receipt.hash, blockNumber: receipt.blockNumber, status: receipt.status === 1 ? 'confirmed' : 'failed' };
  }

  async transferName(name: string, to: string, fee: bigint): Promise<TxResult> {
    if (!this.signer) throw new Error('Signer required');
    const nameHash = await this.hashName(name);
    const tx = await this.contract.transferName(nameHash, to, { value: fee });
    const receipt = await tx.wait();
    return { hash: receipt.hash, blockNumber: receipt.blockNumber, status: receipt.status === 1 ? 'confirmed' : 'failed' };
  }

  // ============ Marketplace ============

  async placeMarketplaceBid(name: string, amount: bigint): Promise<TxResult> {
    if (!this.signer) throw new Error('Signer required');
    const nameHash = await this.hashName(name);
    const tx = await this.contract.placeBid(nameHash, { value: amount });
    const receipt = await tx.wait();
    return { hash: receipt.hash, blockNumber: receipt.blockNumber, status: receipt.status === 1 ? 'confirmed' : 'failed' };
  }

  async cancelMarketplaceBid(name: string, bidIndex: number): Promise<TxResult> {
    if (!this.signer) throw new Error('Signer required');
    const nameHash = await this.hashName(name);
    const tx = await this.contract.cancelBid(nameHash, bidIndex);
    const receipt = await tx.wait();
    return { hash: receipt.hash, blockNumber: receipt.blockNumber, status: receipt.status === 1 ? 'confirmed' : 'failed' };
  }

  async acceptMarketplaceBid(name: string, bidIndex: number): Promise<TxResult> {
    if (!this.signer) throw new Error('Signer required');
    const nameHash = await this.hashName(name);
    const tx = await this.contract.acceptBid(nameHash, bidIndex);
    const receipt = await tx.wait();
    return { hash: receipt.hash, blockNumber: receipt.blockNumber, status: receipt.status === 1 ? 'confirmed' : 'failed' };
  }

  // ============ Profile Management ============

  async setQuaiAddress(name: string, newAddress: string): Promise<TxResult> {
    if (!this.signer) throw new Error('Signer required');
    const nameHash = await this.hashName(name);
    const tx = await this.contract.setQuaiAddress(nameHash, newAddress);
    const receipt = await tx.wait();
    return { hash: receipt.hash, blockNumber: receipt.blockNumber, status: receipt.status === 1 ? 'confirmed' : 'failed' };
  }

  async setQiPaymentCode(name: string, paymentCode: string): Promise<TxResult> {
    if (!this.signer) throw new Error('Signer required');
    const nameHash = await this.hashName(name);
    const tx = await this.contract.setQiPaymentCode(nameHash, paymentCode);
    const receipt = await tx.wait();
    return { hash: receipt.hash, blockNumber: receipt.blockNumber, status: receipt.status === 1 ? 'confirmed' : 'failed' };
  }

  async setAvatar(name: string, imageData: Uint8Array): Promise<TxResult> {
    if (!this.signer) throw new Error('Signer required');
    if (imageData.length > 15360) throw new Error('Avatar too large (max 15KB)');
    const nameHash = await this.hashName(name);
    const tx = await this.contract.setAvatar(nameHash, imageData);
    const receipt = await tx.wait();
    return { hash: receipt.hash, blockNumber: receipt.blockNumber, status: receipt.status === 1 ? 'confirmed' : 'failed' };
  }

  async setProfile(name: string, params: ProfileParams): Promise<TxResult> {
    if (!this.signer) throw new Error('Signer required');
    const nameHash = await this.hashName(name);
    const tx = await this.contract.setProfile(nameHash, params.displayName, params.description, params.url);
    const receipt = await tx.wait();
    return { hash: receipt.hash, blockNumber: receipt.blockNumber, status: receipt.status === 1 ? 'confirmed' : 'failed' };
  }

  async setSocials(name: string, params: SocialsParams): Promise<TxResult> {
    if (!this.signer) throw new Error('Signer required');
    const nameHash = await this.hashName(name);
    const tx = await this.contract.setSocials(nameHash, params.twitter, params.github, params.discord, params.telegram);
    const receipt = await tx.wait();
    return { hash: receipt.hash, blockNumber: receipt.blockNumber, status: receipt.status === 1 ? 'confirmed' : 'failed' };
  }

  async setNostrPubkey(name: string, nostrPubkey: string): Promise<TxResult> {
    if (!this.signer) throw new Error('Signer required');
    const nameHash = await this.hashName(name);
    const tx = await this.contract.setNostrPubkey(nameHash, nostrPubkey);
    const receipt = await tx.wait();
    return { hash: receipt.hash, blockNumber: receipt.blockNumber, status: receipt.status === 1 ? 'confirmed' : 'failed' };
  }

  async setContentHash(name: string, contentHash: Uint8Array): Promise<TxResult> {
    if (!this.signer) throw new Error('Signer required');
    const nameHash = await this.hashName(name);
    const tx = await this.contract.setContentHash(nameHash, contentHash);
    const receipt = await tx.wait();
    return { hash: receipt.hash, blockNumber: receipt.blockNumber, status: receipt.status === 1 ? 'confirmed' : 'failed' };
  }

  // ============ View — Name Data ============

  async hashName(name: string): Promise<string> {
    return await this.contract.hashName(name.toLowerCase());
  }

  async isAvailable(name: string): Promise<boolean> {
    return await this.contract.isAvailable(name.toLowerCase());
  }

  async isRegistered(name: string): Promise<boolean> {
    const nameHash = await this.hashName(name);
    return await this.contract.isRegistered(nameHash);
  }

  async getNameData(name: string): Promise<QNNSNameData | null> {
    const nameHash = await this.hashName(name);
    const nc = await this.contract.getNameData(nameHash);

    if (!nc.name) return null;

    return {
      name: nc.name,
      lockAmount: nc.lockAmount,
      auctionId: nc.auctionId,
      expiresAt: nc.expiresAt,
      quaiAddress: nc.quaiAddress,
      qiPaymentCode: nc.qiPaymentCode,
    };
  }

  async getNameProfile(name: string): Promise<QNNSNameProfile | null> {
    const nameHash = await this.hashName(name);
    const registered = await this.contract.isRegistered(nameHash);
    if (!registered) return null;

    const np = await this.contract.getNameProfile(nameHash);

    return {
      avatar: np.avatar && np.avatar !== '0x' ? quais.getBytes(np.avatar) : null,
      displayName: np.displayName,
      description: np.description,
      url: np.url,
      twitter: np.twitter,
      github: np.github,
      discord: np.discord,
      telegram: np.telegram,
      nostrPubkey: np.nostrPubkey,
      contentHash: np.contentHash && np.contentHash !== '0x' ? quais.getBytes(np.contentHash) : null,
    };
  }

  async getFullNameData(name: string): Promise<QNNSFullNameData | null> {
    const [nameData, profile] = await Promise.all([
      this.getNameData(name),
      this.getNameProfile(name),
    ]);

    if (!nameData) return null;

    return {
      ...nameData,
      ...(profile || {
        avatar: null,
        displayName: '',
        description: '',
        url: '',
        twitter: '',
        github: '',
        discord: '',
        telegram: '',
        nostrPubkey: '',
        contentHash: null,
      }),
    };
  }

  async getQuaiAddress(name: string): Promise<string> {
    const nameHash = await this.hashName(name);
    return await this.contract.getQuaiAddress(nameHash);
  }

  async getQiPaymentCode(name: string): Promise<string> {
    const nameHash = await this.hashName(name);
    return await this.contract.getQiPaymentCode(nameHash);
  }

  async getNostrPubkey(name: string): Promise<string> {
    const nameHash = await this.hashName(name);
    return await this.contract.getNostrPubkey(nameHash);
  }

  async getAvatar(name: string): Promise<Uint8Array | null> {
    const nameHash = await this.hashName(name);
    const data = await this.contract.getAvatar(nameHash);
    if (!data || data === '0x') return null;
    return quais.getBytes(data);
  }

  async getContentHash(name: string): Promise<Uint8Array | null> {
    const nameHash = await this.hashName(name);
    const data = await this.contract.getContentHash(nameHash);
    if (!data || data === '0x') return null;
    return quais.getBytes(data);
  }

  // ============ View — Pricing ============

  async getYearlyPriceQuai(name: string): Promise<bigint> {
    const nameHash = await this.hashName(name);
    return await this.contract.getYearlyPriceQuai(nameHash);
  }

  async getYearlyPriceQuaiByLength(len: number): Promise<bigint> {
    return await this.contract.getYearlyPriceQuaiByLength(len);
  }

  async getQuaiPerQi(): Promise<bigint> {
    return await this.contract.quaiPerQi();
  }

  async getMinAuctionPrice(): Promise<bigint> {
    return await this.contract.minAuctionPrice();
  }

  async getMinLockAmount(): Promise<bigint> {
    return await this.contract.minLockAmount();
  }

  // ============ View — Expiry ============

  async isExpired(name: string): Promise<boolean> {
    const nameHash = await this.hashName(name);
    return await this.contract.isExpired(nameHash);
  }

  async isInGracePeriod(name: string): Promise<boolean> {
    const nameHash = await this.hashName(name);
    return await this.contract.isInGracePeriod(nameHash);
  }

  async isActive(name: string): Promise<boolean> {
    const nameHash = await this.hashName(name);
    return await this.contract.isActive(nameHash);
  }

  async getExpiresAt(name: string): Promise<bigint> {
    const nameHash = await this.hashName(name);
    return await this.contract.getExpiresAt(nameHash);
  }

  async getTimeUntilExpiry(name: string): Promise<bigint> {
    const nameHash = await this.hashName(name);
    return await this.contract.getTimeUntilExpiry(nameHash);
  }

  // ============ View — Auction & Marketplace ============

  async getAuction(auctionId: bigint): Promise<AuctionData> {
    const a = await this.contract.getAuction(auctionId);
    return {
      nameHash: a.nameHash,
      name: a.name,
      initiator: a.initiator,
      highestBidder: a.highestBidder,
      highestBid: a.highestBid,
      startTime: Number(a.startTime),
      endTime: Number(a.endTime),
      finalized: a.finalized,
    };
  }

  async getMarketplaceBids(name: string): Promise<MarketplaceBidData[]> {
    const nameHash = await this.hashName(name);
    const bids = await this.contract.getMarketplaceBids(nameHash);
    return bids.map((b: any) => ({
      bidder: b.bidder,
      amount: b.amount,
      timestamp: Number(b.timestamp),
    }));
  }

  async ownerOf(name: string): Promise<string> {
    const nameHash = await this.hashName(name);
    return await this.contract.ownerOf(BigInt(nameHash));
  }

  async balanceOf(address: string): Promise<bigint> {
    return await this.contract.balanceOf(address);
  }
}
