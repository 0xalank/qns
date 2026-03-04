/**
 * QNNS (Quai Network Name Service) SDK Types — v2
 */

// Core name data (matches on-chain NameCore struct)
export interface QNNSNameData {
  name: string;
  lockAmount: bigint;
  auctionId: bigint;
  expiresAt: bigint;
  quaiAddress: string;
  qiPaymentCode: string;         // BIP47 payment code (PM8T...)
}

// Name profile data (matches on-chain NameProfile struct)
export interface QNNSNameProfile {
  avatar: Uint8Array | null;      // On-chain avatar (max 15KB)
  displayName: string;
  description: string;
  url: string;
  twitter: string;
  github: string;
  discord: string;
  telegram: string;
  nostrPubkey: string;            // Nostr public key (hex, 64 chars)
  contentHash: Uint8Array | null; // EIP-1577 content hash (IPFS, Swarm, etc.)
}

// Combined name data for convenience
export interface QNNSFullNameData extends QNNSNameData, QNNSNameProfile {}

// Auction data (matches on-chain Auction struct)
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

// Marketplace bid data
export interface MarketplaceBidData {
  bidder: string;
  amount: bigint;
  timestamp: number;
}

// Auction start params
export interface StartAuctionParams {
  name: string;
  bidAmount: bigint;              // Opening bid in QUAI (wei)
}

// Auction finalization params
export interface FinalizeAuctionParams {
  auctionId: bigint;
  quaiAddress: string;
  qiPaymentCode?: string;
  payment: bigint;                // Lock deposit + first year's fee in QUAI (wei)
}

// Profile update params
export interface ProfileParams {
  displayName: string;
  description: string;
  url: string;
}

export interface SocialsParams {
  twitter: string;
  github: string;
  discord: string;
  telegram: string;
}

// Transaction result
export interface TxResult {
  hash: string;
  blockNumber?: number;
  status: 'pending' | 'confirmed' | 'failed';
}

// Config
export interface SDKConfig {
  qnnsAddress: string;
  rpcUrl: string;
}

// Default configs
export const QUAI_ORCHARD_CONFIG: Partial<SDKConfig> = {
  rpcUrl: 'https://orchard.rpc.quai.network/cyprus1',
};

export const QUAI_MAINNET_CONFIG: Partial<SDKConfig> = {
  rpcUrl: 'https://rpc.quai.network/cyprus1',
};
