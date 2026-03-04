import { Contract, Signer, keccak256, solidityPacked, getBytes } from 'quais';
import { QNNS_ABI, QNNS_CONTRACT_ADDRESS } from './constants';
import { getReadOnlyProvider } from './wallet';

// ============ Types ============

export interface NameCore {
  name: string;
  lockAmount: bigint;
  auctionId: bigint;
  expiresAt: bigint;
  quaiAddress: string;
  qiPaymentCode: string;
}

export interface NameProfile {
  avatar: string;
  displayName: string;
  description: string;
  url: string;
  twitter: string;
  github: string;
  discord: string;
  telegram: string;
  nostrPubkey: string;
  contentHash: string;
}

export interface FullNameData extends NameCore, NameProfile {}

export interface AuctionData {
  nameHash: string;
  name: string;
  initiator: string;
  highestBidder: string;
  highestBid: bigint;
  startTime: number;
  endTime: number;
  finalized: boolean;
}

export interface MarketplaceBid {
  bidder: string;
  amount: bigint;
  timestamp: number;
}

// ============ Contract Helpers ============

function getReadContract(): Contract {
  const provider = getReadOnlyProvider();
  return new Contract(QNNS_CONTRACT_ADDRESS, QNNS_ABI, provider);
}

function getWriteContract(signer: Signer): Contract {
  return new Contract(QNNS_CONTRACT_ADDRESS, QNNS_ABI, signer);
}

// ============ Read — Name Data ============

export async function hashName(name: string): Promise<string> {
  const contract = getReadContract();
  return await contract.hashName(name.toLowerCase());
}

export function hashNameLocal(name: string): string {
  return keccak256(solidityPacked(['string'], [name.toLowerCase()]));
}

export async function isAvailable(name: string): Promise<boolean> {
  const contract = getReadContract();
  return await contract.isAvailable(name.toLowerCase());
}

export async function isRegistered(nameHash: string): Promise<boolean> {
  const contract = getReadContract();
  return await contract.isRegistered(nameHash);
}

export async function isReserved(name: string): Promise<boolean> {
  const contract = getReadContract();
  return await contract.isReserved(name.toLowerCase());
}

export async function isBlocked(name: string): Promise<boolean> {
  const contract = getReadContract();
  return await contract.isBlocked(name.toLowerCase());
}

export async function getNameData(nameHash: string): Promise<NameCore | null> {
  const contract = getReadContract();
  const nc = await contract.getNameData(nameHash);
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

export async function getNameProfile(nameHash: string): Promise<NameProfile | null> {
  const contract = getReadContract();
  const registered = await contract.isRegistered(nameHash);
  if (!registered) return null;
  const np = await contract.getNameProfile(nameHash);
  return {
    avatar: np.avatar,
    displayName: np.displayName,
    description: np.description,
    url: np.url,
    twitter: np.twitter,
    github: np.github,
    discord: np.discord,
    telegram: np.telegram,
    nostrPubkey: np.nostrPubkey,
    contentHash: np.contentHash,
  };
}

export async function getFullNameData(nameHash: string): Promise<FullNameData | null> {
  const [core, profile] = await Promise.all([
    getNameData(nameHash),
    getNameProfile(nameHash),
  ]);
  if (!core) return null;
  return {
    ...core,
    ...(profile || {
      avatar: '0x',
      displayName: '',
      description: '',
      url: '',
      twitter: '',
      github: '',
      discord: '',
      telegram: '',
      nostrPubkey: '',
      contentHash: '0x',
    }),
  };
}

export async function ownerOf(nameHash: string): Promise<string> {
  const contract = getReadContract();
  return await contract.ownerOf(BigInt(nameHash));
}

export async function balanceOf(address: string): Promise<bigint> {
  const contract = getReadContract();
  return await contract.balanceOf(address);
}

// ============ Read — Pricing ============

export async function getMinLockAmount(): Promise<bigint> {
  const contract = getReadContract();
  return await contract.minLockAmount();
}

export async function getRegistrationFee7Plus(): Promise<bigint> {
  const contract = getReadContract();
  return await contract.registrationFee7Plus();
}

export async function getAuctionFloor4to6(): Promise<bigint> {
  const contract = getReadContract();
  return await contract.auctionFloor4to6();
}

export async function getAuctionFloor1to3(): Promise<bigint> {
  const contract = getReadContract();
  return await contract.auctionFloor1to3();
}

export async function getAuctionFloor(nameLen: number): Promise<bigint> {
  const contract = getReadContract();
  return await contract.getAuctionFloor(nameLen);
}

export async function getRegistrationFee(nameLen: number): Promise<bigint> {
  const contract = getReadContract();
  return await contract.getRegistrationFee(nameLen);
}

export async function getYearlyPriceQuai(nameHash: string): Promise<bigint> {
  const contract = getReadContract();
  return await contract.getYearlyPriceQuai(nameHash);
}

export async function getYearlyPriceQuaiByLength(len: number): Promise<bigint> {
  const contract = getReadContract();
  return await contract.getYearlyPriceQuaiByLength(len);
}

// ============ Read — Expiry ============

export async function isActive(nameHash: string): Promise<boolean> {
  const contract = getReadContract();
  return await contract.isActive(nameHash);
}

export async function isInGracePeriod(nameHash: string): Promise<boolean> {
  const contract = getReadContract();
  return await contract.isInGracePeriod(nameHash);
}

export async function isExpired(nameHash: string): Promise<boolean> {
  const contract = getReadContract();
  return await contract.isExpired(nameHash);
}

export async function getExpiresAt(nameHash: string): Promise<bigint> {
  const contract = getReadContract();
  return await contract.getExpiresAt(nameHash);
}

export async function getTimeUntilExpiry(nameHash: string): Promise<bigint> {
  const contract = getReadContract();
  return await contract.getTimeUntilExpiry(nameHash);
}

// ============ Read — Auction ============

export async function getAuction(auctionId: bigint): Promise<AuctionData> {
  const contract = getReadContract();
  const a = await contract.getAuction(auctionId);
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

// ============ Read — Marketplace ============

export async function getMarketplaceBids(nameHash: string): Promise<MarketplaceBid[]> {
  const contract = getReadContract();
  const bids = await contract.getMarketplaceBids(nameHash);
  return bids.map((b: any) => ({
    bidder: b.bidder,
    amount: b.amount,
    timestamp: Number(b.timestamp),
  }));
}

// ============ Write — Instant Registration (7+ chars) ============

export async function register(
  signer: Signer,
  name: string,
  quaiAddress: string,
  qiPaymentCode: string,
  payment: bigint
) {
  const contract = getWriteContract(signer);
  const tx = await contract.register(name.toLowerCase(), quaiAddress, qiPaymentCode, { value: payment });
  return await tx.wait();
}

// ============ Write — Auction (1-6 chars) ============

export async function startAuction(signer: Signer, name: string, bidAmount: bigint) {
  const contract = getWriteContract(signer);
  const tx = await contract.startAuction(name.toLowerCase(), { value: bidAmount });
  return await tx.wait();
}

export async function bid(signer: Signer, auctionId: bigint, amount: bigint) {
  const contract = getWriteContract(signer);
  const tx = await contract.bid(auctionId, { value: amount });
  return await tx.wait();
}

export async function finalizeAuction(
  signer: Signer,
  auctionId: bigint,
  quaiAddress: string,
  qiPaymentCode: string,
  payment: bigint
) {
  const contract = getWriteContract(signer);
  const tx = await contract.finalizeAuction(auctionId, quaiAddress, qiPaymentCode, { value: payment });
  return await tx.wait();
}

// ============ Write — Renewal ============

export async function renew(signer: Signer, nameHash: string, payment: bigint) {
  const contract = getWriteContract(signer);
  const tx = await contract.renew(nameHash, { value: payment });
  return await tx.wait();
}

export async function renewFromLock(signer: Signer, nameHash: string) {
  const contract = getWriteContract(signer);
  const tx = await contract.renewFromLock(nameHash);
  return await tx.wait();
}

// ============ Write — Ownership ============

export async function releaseName(signer: Signer, nameHash: string) {
  const contract = getWriteContract(signer);
  const tx = await contract.release(nameHash);
  return await tx.wait();
}

export async function transferName(signer: Signer, nameHash: string, to: string, fee: bigint) {
  const contract = getWriteContract(signer);
  const tx = await contract.transferName(nameHash, to, { value: fee });
  return await tx.wait();
}

// ============ Write — Marketplace ============

export async function placeBid(signer: Signer, nameHash: string, amount: bigint) {
  const contract = getWriteContract(signer);
  const tx = await contract.placeBid(nameHash, { value: amount });
  return await tx.wait();
}

export async function cancelBid(signer: Signer, nameHash: string, bidIndex: number) {
  const contract = getWriteContract(signer);
  const tx = await contract.cancelBid(nameHash, bidIndex);
  return await tx.wait();
}

export async function acceptBid(signer: Signer, nameHash: string, bidIndex: number) {
  const contract = getWriteContract(signer);
  const tx = await contract.acceptBid(nameHash, bidIndex);
  return await tx.wait();
}

// ============ Write — Profile ============

export async function setProfile(signer: Signer, nameHash: string, displayName: string, description: string, url: string) {
  const contract = getWriteContract(signer);
  const tx = await contract.setProfile(nameHash, displayName, description, url);
  return await tx.wait();
}

export async function setSocials(signer: Signer, nameHash: string, twitter: string, github: string, discord: string, telegram: string) {
  const contract = getWriteContract(signer);
  const tx = await contract.setSocials(nameHash, twitter, github, discord, telegram);
  return await tx.wait();
}

export async function setAvatar(signer: Signer, nameHash: string, avatarData: Uint8Array) {
  const contract = getWriteContract(signer);
  const tx = await contract.setAvatar(nameHash, avatarData);
  return await tx.wait();
}

export async function setQuaiAddress(signer: Signer, nameHash: string, newAddress: string) {
  const contract = getWriteContract(signer);
  const tx = await contract.setQuaiAddress(nameHash, newAddress);
  return await tx.wait();
}

export async function setQiPaymentCode(signer: Signer, nameHash: string, paymentCode: string) {
  const contract = getWriteContract(signer);
  const tx = await contract.setQiPaymentCode(nameHash, paymentCode);
  return await tx.wait();
}

export async function setNostrPubkey(signer: Signer, nameHash: string, nostrPubkey: string) {
  const contract = getWriteContract(signer);
  const tx = await contract.setNostrPubkey(nameHash, nostrPubkey);
  return await tx.wait();
}

export async function setContentHash(signer: Signer, nameHash: string, contentHash: Uint8Array) {
  const contract = getWriteContract(signer);
  const tx = await contract.setContentHash(nameHash, contentHash);
  return await tx.wait();
}

// ============ Events ============

export async function getRecentAuctions(count: number = 20): Promise<Array<{ auctionId: bigint; nameHash: string; name: string; initiator: string; blockNumber: number }>> {
  const contract = getReadContract();
  const filter = contract.filters.AuctionStarted();
  const events = await contract.queryFilter(filter, -10000);

  return events
    .slice(-count)
    .reverse()
    .map((e: any) => ({
      auctionId: e.args[0],
      nameHash: e.args[1],
      name: e.args[2],
      initiator: e.args[3],
      blockNumber: e.blockNumber,
    }));
}

export async function getRecentFinalizations(count: number = 20): Promise<Array<{ auctionId: bigint; nameHash: string; winner: string; blockNumber: number }>> {
  const contract = getReadContract();
  const filter = contract.filters.AuctionFinalized();
  const events = await contract.queryFilter(filter, -10000);

  return events
    .slice(-count)
    .reverse()
    .map((e: any) => ({
      auctionId: e.args[0],
      nameHash: e.args[1],
      winner: e.args[2],
      blockNumber: e.blockNumber,
    }));
}

/**
 * Get all names owned by an address.
 * Uses AuctionFinalized events to find names won by this address,
 * then verifies current ownership via ownerOf.
 */
export async function getNamesOwnedBy(address: string): Promise<string[]> {
  const contract = getReadContract();

  // First check if user has any balance
  const balance = await contract.balanceOf(address);
  console.log('[getNamesOwnedBy] Balance for', address, ':', balance.toString());
  if (balance === BigInt(0)) {
    return [];
  }

  // Query AuctionFinalized events where this address won
  const finalizedFilter = contract.filters.AuctionFinalized(null, null, address);
  const finalized = await contract.queryFilter(finalizedFilter, -100000);
  console.log('[getNamesOwnedBy] AuctionFinalized events:', finalized.length);

  // Also query Transfer events TO this address (for marketplace purchases)
  const transferFilter = contract.filters.Transfer(null, address);
  const transfers = await contract.queryFilter(transferFilter, -100000);
  console.log('[getNamesOwnedBy] Transfer events:', transfers.length);

  // Collect unique nameHashes
  const nameHashes = new Set<string>();

  for (const e of finalized) {
    const nameHash = (e as any).args[1]; // bytes32 nameHash
    console.log('[getNamesOwnedBy] Finalized nameHash:', nameHash);
    nameHashes.add(nameHash);
  }

  for (const e of transfers) {
    const tokenId = (e as any).args[2];
    // tokenId is the uint256 version of nameHash
    const nameHash = '0x' + BigInt(tokenId).toString(16).padStart(64, '0');
    console.log('[getNamesOwnedBy] Transfer nameHash:', nameHash);
    nameHashes.add(nameHash);
  }

  // Verify current ownership
  const owned: string[] = [];
  for (const nameHash of nameHashes) {
    try {
      const tokenId = BigInt(nameHash);
      const owner = await contract.ownerOf(tokenId);
      if (owner.toLowerCase() === address.toLowerCase()) {
        owned.push(nameHash);
      }
    } catch {
      // Token doesn't exist or was burned
    }
  }

  return owned;
}
