import { Address, BigInt, Bytes, ethereum } from '@graphprotocol/graph-ts';
import {
  AuctionBid,
  AuctionFinalized,
  AuctionStarted,
  ContentHashUpdated,
  MarketplaceBidAccepted,
  NameAssigned,
  NameBlocked,
  NameExpired,
  NameRegistered,
  NameReleased,
  NameRenewed,
  NameRenewedFromLock,
  NameRevoked,
  NostrPubkeyUpdated,
  QiPaymentCodeUpdated,
  QuaiAddressUpdated,
  Transfer,
} from '../../generated/QNNS/QNNS';
import { Account, Auction, Domain, DomainEvent } from '../../generated/schema';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const ONE_YEAR_SECONDS = 31536000;

function eventId(event: ethereum.Event): string {
  return event.transaction.hash.toHexString() + '-' + event.logIndex.toString();
}

function accountId(address: Address): string {
  return address.toHexString();
}

function getOrCreateAccount(address: Address): Account {
  const id = accountId(address);
  let account = Account.load(id);
  if (account == null) {
    account = new Account(id);
    account.save();
  }
  return account;
}

function leftPad64(hex: string): string {
  let body = hex.startsWith('0x') ? hex.slice(2) : hex;
  while (body.length < 64) {
    body = '0' + body;
  }
  return '0x' + body;
}

function tokenIdToNameHash(tokenId: BigInt): string {
  return leftPad64(tokenId.toHexString());
}

function bytesFromId(id: string): Bytes {
  return Bytes.fromHexString(id) as Bytes;
}

function getOrCreateDomain(id: string, event: ethereum.Event): Domain {
  let domain = Domain.load(id);
  if (domain == null) {
    domain = new Domain(id);
    domain.nameHash = bytesFromId(id);
    domain.active = false;
    domain.lockAmount = BigInt.zero();
    domain.expiresAt = BigInt.zero();
    domain.createdAt = event.block.timestamp;
    domain.createdBlock = event.block.number;
    domain.updatedAt = event.block.timestamp;
    domain.updatedBlock = event.block.number;
    domain.transferCount = 0;
  }
  return domain;
}

function touch(domain: Domain, event: ethereum.Event): void {
  domain.updatedAt = event.block.timestamp;
  domain.updatedBlock = event.block.number;
}

function saveDomainEvent(kind: string, nameHash: Bytes, account: Account | null, event: ethereum.Event): void {
  const id = eventId(event);
  const nameHashId = nameHash.toHexString();
  const domainEvent = new DomainEvent(id);
  domainEvent.domain = nameHashId;
  domainEvent.nameHash = nameHash;
  domainEvent.kind = kind;
  domainEvent.account = account == null ? null : account.id;
  domainEvent.blockNumber = event.block.number;
  domainEvent.timestamp = event.block.timestamp;
  domainEvent.txHash = event.transaction.hash;
  domainEvent.save();
}

function deactivateDomain(nameHash: Bytes, event: ethereum.Event): void {
  const id = nameHash.toHexString();
  const domain = getOrCreateDomain(id, event);
  domain.owner = null;
  domain.active = false;
  domain.lockAmount = BigInt.zero();
  domain.expiresAt = BigInt.zero();
  touch(domain, event);
  domain.save();
}

export function handleTransfer(event: Transfer): void {
  const id = tokenIdToNameHash(event.params.tokenId);
  const domain = getOrCreateDomain(id, event);
  const to = event.params.to.toHexString();

  domain.tokenId = event.params.tokenId;
  domain.transferCount = domain.transferCount + 1;
  if (to == ZERO_ADDRESS) {
    domain.owner = null;
    domain.active = false;
  } else {
    const owner = getOrCreateAccount(event.params.to);
    domain.owner = owner.id;
    domain.active = true;
  }
  touch(domain, event);
  domain.save();
}

export function handleNameRegistered(event: NameRegistered): void {
  const id = event.params.nameHash.toHexString();
  const owner = getOrCreateAccount(event.params.owner);
  const domain = getOrCreateDomain(id, event);

  domain.name = event.params.name;
  domain.owner = owner.id;
  domain.active = true;
  domain.lockAmount = event.params.lockAmount;
  domain.auctionId = BigInt.zero();
  domain.expiresAt = event.block.timestamp.plus(BigInt.fromI32(ONE_YEAR_SECONDS));
  touch(domain, event);
  domain.save();
  saveDomainEvent('NameRegistered', event.params.nameHash, owner, event);
}

export function handleAuctionStarted(event: AuctionStarted): void {
  const auctionId = event.params.auctionId.toString();
  const initiator = getOrCreateAccount(event.params.initiator);
  const auction = new Auction(auctionId);

  auction.auctionId = event.params.auctionId;
  auction.nameHash = event.params.nameHash;
  auction.name = event.params.name;
  auction.initiator = initiator.id;
  auction.highestBidder = initiator.id;
  auction.highestBid = event.params.openingBid;
  auction.startTime = event.block.timestamp;
  auction.endTime = event.params.endTime;
  auction.finalized = false;
  auction.save();
  saveDomainEvent('AuctionStarted', event.params.nameHash, initiator, event);
}

export function handleAuctionBid(event: AuctionBid): void {
  const auction = Auction.load(event.params.auctionId.toString());
  if (auction == null) return;

  const bidder = getOrCreateAccount(event.params.bidder);
  auction.highestBidder = bidder.id;
  auction.highestBid = event.params.amount;
  auction.endTime = event.params.newEndTime;
  auction.save();
}

export function handleAuctionFinalized(event: AuctionFinalized): void {
  const id = event.params.nameHash.toHexString();
  const winner = getOrCreateAccount(event.params.winner);
  const domain = getOrCreateDomain(id, event);
  const auction = Auction.load(event.params.auctionId.toString());

  if (auction != null) {
    domain.name = auction.name;
    auction.finalized = true;
    auction.winner = winner.id;
    auction.save();
  }

  domain.owner = winner.id;
  domain.active = true;
  domain.lockAmount = event.params.lockAmount;
  domain.auctionId = event.params.auctionId;
  domain.expiresAt = event.block.timestamp.plus(BigInt.fromI32(ONE_YEAR_SECONDS));
  touch(domain, event);
  domain.save();
  saveDomainEvent('AuctionFinalized', event.params.nameHash, winner, event);
}

export function handleNameRenewed(event: NameRenewed): void {
  const domain = getOrCreateDomain(event.params.nameHash.toHexString(), event);
  const account = getOrCreateAccount(event.params.renewedBy);
  domain.expiresAt = event.params.newExpiresAt;
  domain.active = true;
  touch(domain, event);
  domain.save();
  saveDomainEvent('NameRenewed', event.params.nameHash, account, event);
}

export function handleNameRenewedFromLock(event: NameRenewedFromLock): void {
  const domain = getOrCreateDomain(event.params.nameHash.toHexString(), event);
  const account = getOrCreateAccount(event.params.owner);
  domain.expiresAt = event.params.newExpiresAt;
  domain.lockAmount = domain.lockAmount.minus(event.params.feeDeducted);
  domain.active = true;
  touch(domain, event);
  domain.save();
  saveDomainEvent('NameRenewedFromLock', event.params.nameHash, account, event);
}

export function handleNameReleased(event: NameReleased): void {
  const account = getOrCreateAccount(event.params.previousOwner);
  deactivateDomain(event.params.nameHash, event);
  saveDomainEvent('NameReleased', event.params.nameHash, account, event);
}

export function handleNameExpired(event: NameExpired): void {
  const account = getOrCreateAccount(event.params.previousOwner);
  deactivateDomain(event.params.nameHash, event);
  saveDomainEvent('NameExpired', event.params.nameHash, account, event);
}

export function handleNameRevoked(event: NameRevoked): void {
  const account = getOrCreateAccount(event.params.previousOwner);
  deactivateDomain(event.params.nameHash, event);
  saveDomainEvent('NameRevoked', event.params.nameHash, account, event);
}

export function handleNameAssigned(event: NameAssigned): void {
  const owner = getOrCreateAccount(event.params.newOwner);
  const domain = getOrCreateDomain(event.params.nameHash.toHexString(), event);
  domain.owner = owner.id;
  domain.active = true;
  domain.lockAmount = event.transaction.value;
  domain.expiresAt = event.block.timestamp.plus(BigInt.fromI32(ONE_YEAR_SECONDS));
  touch(domain, event);
  domain.save();
  saveDomainEvent('NameAssigned', event.params.nameHash, owner, event);
}

export function handleNameBlocked(event: NameBlocked): void {
  deactivateDomain(event.params.nameHash, event);
  saveDomainEvent('NameBlocked', event.params.nameHash, null, event);
}

export function handleQuaiAddressUpdated(event: QuaiAddressUpdated): void {
  const domain = getOrCreateDomain(event.params.nameHash.toHexString(), event);
  domain.quaiAddress = event.params.quaiAddress;
  touch(domain, event);
  domain.save();
}

export function handleQiPaymentCodeUpdated(event: QiPaymentCodeUpdated): void {
  const domain = getOrCreateDomain(event.params.nameHash.toHexString(), event);
  domain.qiPaymentCode = event.params.paymentCode;
  touch(domain, event);
  domain.save();
}

export function handleNostrPubkeyUpdated(event: NostrPubkeyUpdated): void {
  const domain = getOrCreateDomain(event.params.nameHash.toHexString(), event);
  domain.nostrPubkey = event.params.nostrPubkey;
  touch(domain, event);
  domain.save();
}

export function handleContentHashUpdated(event: ContentHashUpdated): void {
  const domain = getOrCreateDomain(event.params.nameHash.toHexString(), event);
  domain.contentHash = event.params.contentHash;
  touch(domain, event);
  domain.save();
}

export function handleMarketplaceBidAccepted(event: MarketplaceBidAccepted): void {
  const buyer = getOrCreateAccount(event.params.buyer);
  const domain = getOrCreateDomain(event.params.nameHash.toHexString(), event);
  domain.owner = buyer.id;
  domain.active = true;
  touch(domain, event);
  domain.save();
  saveDomainEvent('MarketplaceBidAccepted', event.params.nameHash, buyer, event);
}
