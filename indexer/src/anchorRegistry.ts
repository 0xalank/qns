import { Address, Bytes } from '@graphprotocol/graph-ts';
import { AnchorSet, AnchorCleared } from '../../generated/QNSAnchorRegistry/QNSAnchorRegistry';
import { Account, Publication } from '../../generated/schema';

function getOrCreateAccount(address: Address): Account {
  const id = address.toHexString();
  let account = Account.load(id);
  if (account == null) {
    account = new Account(id);
    account.save();
  }
  return account;
}

// 96-byte packed anchor: version(2) + flags(2) + chainId(8) + address(20) + topology(32) + manifestHash(32).
// The module address is the 20 bytes starting at offset 12.
function moduleFromAnchor(anchor: Bytes): Bytes {
  if (anchor.length < 32) return Bytes.empty();
  return Bytes.fromUint8Array(anchor.subarray(12, 32));
}

export function handleAnchorSet(event: AnchorSet): void {
  const id = event.params.nameHash.toHexString();
  let pub = Publication.load(id);
  if (pub == null) {
    pub = new Publication(id);
    pub.nameHash = event.params.nameHash;
    pub.createdAt = event.block.timestamp;
    pub.createdBlock = event.block.number;
  }
  const owner = getOrCreateAccount(event.params.owner);
  pub.owner = owner.id;
  pub.domain = id; // Domain id is the same nameHash hex (set by the QNNS data source)
  pub.moduleAddress = moduleFromAnchor(event.params.anchor);
  pub.topology = event.params.topology;
  pub.manifestHash = event.params.manifestHash;
  pub.active = true;
  pub.updatedAt = event.block.timestamp;
  pub.updatedBlock = event.block.number;
  pub.save();
}

export function handleAnchorCleared(event: AnchorCleared): void {
  const id = event.params.nameHash.toHexString();
  const pub = Publication.load(id);
  if (pub == null) return;
  pub.active = false;
  pub.updatedAt = event.block.timestamp;
  pub.updatedBlock = event.block.number;
  pub.save();
}
