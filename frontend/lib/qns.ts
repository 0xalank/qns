import { Contract, Signer, keccak256, solidityPacked, randomBytes, hexlify, formatQuai as fmtQuai, getBytes, ZeroAddress } from 'quais';
import { QNS_ABI, QNS_CONTRACT_ADDRESS } from './constants';
import { getReadOnlyProvider } from './wallet';

export interface QNSProfile {
  owner: string;
  quaiAddress: string;
  qiPaymentCode: string;
  avatar: string;
  displayName: string;
  description: string;
  url: string;
  twitter: string;
  github: string;
  discord: string;
  telegram: string;
  nostrPubkey: string;
  registeredAt: number;
  claimableAt: number;
  lastActive: number;
}

// Read-only contract instance (no wallet needed)
function getReadContract(): Contract {
  const provider = getReadOnlyProvider();
  return new Contract(QNS_CONTRACT_ADDRESS, QNS_ABI, provider);
}

// Write contract instance (requires signer)
function getWriteContract(signer: Signer): Contract {
  return new Contract(QNS_CONTRACT_ADDRESS, QNS_ABI, signer);
}

// ============ Read Functions ============

export async function hashName(name: string): Promise<string> {
  const contract = getReadContract();
  return await contract.hashName(name.toLowerCase());
}

export async function isAvailable(name: string): Promise<boolean> {
  const contract = getReadContract();
  return await contract.isAvailable(name.toLowerCase());
}

export async function getRegistrationFee(): Promise<bigint> {
  const contract = getReadContract();
  return await contract.registrationFee();
}

export async function getProfile(name: string): Promise<QNSProfile | null> {
  const contract = getReadContract();
  const nameHash = await contract.hashName(name.toLowerCase());
  const p = await contract.getProfile(nameHash);

  if (p.owner === ZeroAddress) return null;

  return {
    owner: p.owner,
    quaiAddress: p.quaiAddress,
    qiPaymentCode: p.qiPaymentCode,
    avatar: p.avatar,
    displayName: p.displayName,
    description: p.description,
    url: p.url,
    twitter: p.twitter,
    github: p.github,
    discord: p.discord,
    telegram: p.telegram,
    nostrPubkey: p.nostrPubkey,
    registeredAt: Number(p.registeredAt),
    claimableAt: Number(p.claimableAt),
    lastActive: Number(p.lastActive),
  };
}

export async function getNameOf(address: string): Promise<string> {
  const contract = getReadContract();
  return await contract.getNameOf(address);
}

export async function isLive(name: string): Promise<boolean> {
  const contract = getReadContract();
  const nameHash = await contract.hashName(name.toLowerCase());
  return await contract.isLive(nameHash);
}

// ============ Write Functions ============

export function generateSecret(): string {
  return hexlify(randomBytes(32));
}

export function generateCommitHash(name: string, owner: string, secret: string): string {
  return keccak256(
    solidityPacked(
      ['string', 'address', 'bytes32'],
      [name.toLowerCase(), owner, secret]
    )
  );
}

export async function commit(signer: Signer, commitHash: string) {
  const contract = getWriteContract(signer);
  const tx = await contract.commit(commitHash);
  return await tx.wait();
}

export async function reveal(
  signer: Signer,
  name: string,
  secret: string,
  quaiAddress: string,
  qiPaymentCode: string,
  fee: bigint
) {
  const contract = getWriteContract(signer);
  const tx = await contract.reveal(
    name.toLowerCase(),
    secret,
    quaiAddress,
    qiPaymentCode,
    { value: fee }
  );
  return await tx.wait();
}

export async function setProfile(
  signer: Signer,
  name: string,
  displayName: string,
  description: string,
  url: string
) {
  const contract = getWriteContract(signer);
  const nameHash = await hashName(name);
  const tx = await contract.setProfile(nameHash, displayName, description, url);
  return await tx.wait();
}

export async function setSocials(
  signer: Signer,
  name: string,
  twitter: string,
  github: string,
  discord: string,
  telegram: string
) {
  const contract = getWriteContract(signer);
  const nameHash = await hashName(name);
  const tx = await contract.setSocials(nameHash, twitter, github, discord, telegram);
  return await tx.wait();
}

export async function setAvatar(signer: Signer, name: string, avatarData: Uint8Array) {
  const contract = getWriteContract(signer);
  const nameHash = await hashName(name);
  const tx = await contract.setAvatar(nameHash, avatarData);
  return await tx.wait();
}

export async function setQuaiAddress(signer: Signer, name: string, newAddress: string) {
  const contract = getWriteContract(signer);
  const nameHash = await hashName(name);
  const tx = await contract.setQuaiAddress(nameHash, newAddress);
  return await tx.wait();
}

export async function setQiPaymentCode(signer: Signer, name: string, paymentCode: string) {
  const contract = getWriteContract(signer);
  const nameHash = await hashName(name);
  const tx = await contract.setQiPaymentCode(nameHash, paymentCode);
  return await tx.wait();
}

export async function setNostrPubkey(signer: Signer, name: string, nostrPubkey: string) {
  const contract = getWriteContract(signer);
  const nameHash = await hashName(name);
  const tx = await contract.setNostrPubkey(nameHash, nostrPubkey);
  return await tx.wait();
}

export async function keepAlive(signer: Signer, name: string) {
  const contract = getWriteContract(signer);
  const nameHash = await hashName(name);
  const tx = await contract.keepAlive(nameHash);
  return await tx.wait();
}

export async function releaseName(signer: Signer, name: string) {
  const contract = getWriteContract(signer);
  const nameHash = await hashName(name);
  const tx = await contract.release(nameHash);
  return await tx.wait();
}

// ============ Events ============

export async function getRecentRegistrations(count: number = 20): Promise<Array<{ name: string; owner: string; nameHash: string; blockNumber: number }>> {
  const contract = getReadContract();
  const filter = contract.filters.NameRegistered();
  const events = await contract.queryFilter(filter, -10000);

  return events
    .slice(-count)
    .reverse()
    .map((e: any) => ({
      nameHash: e.args[0],
      name: e.args[1],
      owner: e.args[2],
      blockNumber: e.blockNumber,
    }));
}
