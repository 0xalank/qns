/**
 * QNS (Quai Name Service) SDK Client
 *
 * Soulbound name registry for Quai Network with:
 * - Commit-reveal registration (prevents front-running)
 * - One name per address (auto-releases old name)
 * - Quai address + Qi payment code (BIP47)
 * - On-chain avatar, profile, and social links
 * - 2-year inactivity reclaim
 */

import { quais } from 'quais';
import {
  QNSProfile,
  CommitParams,
  RevealParams,
  ProfileParams,
  SocialsParams,
  TxResult,
  SDKConfig,
} from './types';

const QNS_ABI = [
  // Registration (commit-reveal)
  'function commit(bytes32 commitHash)',
  'function reveal(string name, bytes32 secret, address quaiAddress, string qiPaymentCode) payable',

  // Profile management
  'function setQuaiAddress(bytes32 nameHash, address newAddress)',
  'function setQiPaymentCode(bytes32 nameHash, string paymentCode)',
  'function setAvatar(bytes32 nameHash, bytes avatarData)',
  'function setProfile(bytes32 nameHash, string displayName, string description, string url)',
  'function setSocials(bytes32 nameHash, string twitter, string github, string discord, string telegram)',
  'function setNostrPubkey(bytes32 nameHash, string nostrPubkey)',
  'function keepAlive(bytes32 nameHash)',
  'function release(bytes32 nameHash)',

  // Inactivity reclaim
  'function reclaimInactive(bytes32 nameHash)',

  // View functions
  'function getProfile(bytes32 nameHash) view returns (tuple(address owner, address quaiAddress, string qiPaymentCode, bytes avatar, string displayName, string description, string url, string twitter, string github, string discord, string telegram, string nostrPubkey, uint256 registeredAt, uint256 claimableAt, uint256 lastActive))',
  'function getQuaiAddress(bytes32 nameHash) view returns (address)',
  'function getQiPaymentCode(bytes32 nameHash) view returns (string)',
  'function getNostrPubkey(bytes32 nameHash) view returns (string)',
  'function getAvatar(bytes32 nameHash) view returns (bytes)',
  'function getNameOf(address addr) view returns (bytes32)',
  'function isAvailable(string name) view returns (bool)',
  'function isLive(bytes32 nameHash) view returns (bool)',
  'function isInactive(bytes32 nameHash) view returns (bool)',
  'function hashName(string name) pure returns (bytes32)',
  'function registrationFee() view returns (uint256)',

  // Events
  'event NameCommitted(bytes32 indexed commitHash, address indexed committer)',
  'event NameRegistered(bytes32 indexed nameHash, string name, address indexed owner)',
  'event NameReleased(bytes32 indexed nameHash, address indexed previousOwner)',
  'event ProfileUpdated(bytes32 indexed nameHash)',
  'event NostrPubkeyUpdated(bytes32 indexed nameHash, string nostrPubkey)',
  'event Heartbeat(bytes32 indexed nameHash, uint256 timestamp)',
  'event InactiveReclaimed(bytes32 indexed nameHash, address indexed previousOwner)',
];

export class QNSClient {
  private contract: quais.Contract;
  private provider: quais.Provider;
  private signer?: quais.Signer;

  constructor(config: SDKConfig, signer?: quais.Signer) {
    this.provider = new quais.JsonRpcProvider(config.rpcUrl, undefined, { usePathing: false });
    this.signer = signer;

    const contractSigner = signer || this.provider;
    this.contract = new quais.Contract(config.qnsAddress, QNS_ABI, contractSigner);
  }

  connect(signer: quais.Signer): QNSClient {
    this.signer = signer;
    this.contract = this.contract.connect(signer) as quais.Contract;
    return this;
  }

  // ============ Registration (Commit-Reveal) ============

  /**
   * Generate a commit hash for name registration
   */
  generateCommitHash(name: string, owner: string, secret: string): string {
    return quais.keccak256(
      quais.solidityPacked(
        ['string', 'address', 'bytes32'],
        [name.toLowerCase(), owner, secret]
      )
    );
  }

  /**
   * Generate a random secret for commit-reveal
   */
  generateSecret(): string {
    return quais.hexlify(quais.randomBytes(32));
  }

  /**
   * Step 1: Commit to a name (hides the name from front-runners)
   */
  async commit(params: CommitParams, ownerAddress: string): Promise<TxResult> {
    if (!this.signer) throw new Error('Signer required');

    const commitHash = this.generateCommitHash(params.name, ownerAddress, params.secret);
    const tx = await this.contract.commit(commitHash);
    const receipt = await tx.wait();

    return {
      hash: receipt.hash,
      blockNumber: receipt.blockNumber,
      status: receipt.status === 1 ? 'confirmed' : 'failed',
    };
  }

  /**
   * Step 2: Reveal and register the name (must wait 1min after commit, within 24hr)
   */
  async reveal(params: RevealParams): Promise<TxResult> {
    if (!this.signer) throw new Error('Signer required');

    const fee = await this.getRegistrationFee();
    const tx = await this.contract.reveal(
      params.name.toLowerCase(),
      params.secret,
      params.quaiAddress,
      params.qiPaymentCode || '',
      { value: fee }
    );
    const receipt = await tx.wait();

    return {
      hash: receipt.hash,
      blockNumber: receipt.blockNumber,
      status: receipt.status === 1 ? 'confirmed' : 'failed',
    };
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

  async keepAlive(name: string): Promise<TxResult> {
    if (!this.signer) throw new Error('Signer required');
    const nameHash = await this.hashName(name);
    const tx = await this.contract.keepAlive(nameHash);
    const receipt = await tx.wait();
    return { hash: receipt.hash, blockNumber: receipt.blockNumber, status: receipt.status === 1 ? 'confirmed' : 'failed' };
  }

  async release(name: string): Promise<TxResult> {
    if (!this.signer) throw new Error('Signer required');
    const nameHash = await this.hashName(name);
    const tx = await this.contract.release(nameHash);
    const receipt = await tx.wait();
    return { hash: receipt.hash, blockNumber: receipt.blockNumber, status: receipt.status === 1 ? 'confirmed' : 'failed' };
  }

  // ============ Inactivity Reclaim ============

  async reclaimInactive(name: string): Promise<TxResult> {
    if (!this.signer) throw new Error('Signer required');
    const nameHash = await this.hashName(name);
    const tx = await this.contract.reclaimInactive(nameHash);
    const receipt = await tx.wait();
    return { hash: receipt.hash, blockNumber: receipt.blockNumber, status: receipt.status === 1 ? 'confirmed' : 'failed' };
  }

  // ============ View Functions ============

  async hashName(name: string): Promise<string> {
    return await this.contract.hashName(name.toLowerCase());
  }

  async isAvailable(name: string): Promise<boolean> {
    return await this.contract.isAvailable(name.toLowerCase());
  }

  async getRegistrationFee(): Promise<bigint> {
    return await this.contract.registrationFee();
  }

  async getProfile(name: string): Promise<QNSProfile | null> {
    const nameHash = await this.hashName(name);
    const p = await this.contract.getProfile(nameHash);

    if (p.owner === quais.ZeroAddress) {
      return null;
    }

    return {
      owner: p.owner,
      quaiAddress: p.quaiAddress,
      qiPaymentCode: p.qiPaymentCode,
      avatar: p.avatar && p.avatar !== '0x' ? quais.getBytes(p.avatar) : null,
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

  async getNameOf(address: string): Promise<string> {
    return await this.contract.getNameOf(address);
  }

  async isLive(name: string): Promise<boolean> {
    const nameHash = await this.hashName(name);
    return await this.contract.isLive(nameHash);
  }

  async isInactive(name: string): Promise<boolean> {
    const nameHash = await this.hashName(name);
    return await this.contract.isInactive(nameHash);
  }
}
