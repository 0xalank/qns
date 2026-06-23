import {
  Contract,
  getAddress,
  getBytes,
  isAddress,
  toUtf8Bytes,
  toUtf8String,
} from 'quais';
import { QNS_IPFS_GATEWAY_URL } from './constants';
import { getReadOnlyProvider } from './wallet';

export const NFT_AVATAR_PREFIX = 'qns-avatar:v1:nft:quai:erc721:';

const ERC721_AVATAR_ABI = [
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function tokenURI(uint256 tokenId) view returns (string)',
] as const;

export interface NftAvatarRef {
  kind: 'erc721';
  chain: 'quai';
  collection: string;
  tokenId: string;
  encoded: string;
}

export type ResolvedAvatar =
  | { kind: 'empty' }
  | { kind: 'image'; imageUrl: string }
  | {
      kind: 'nft';
      ref: NftAvatarRef;
      owner?: string;
      tokenUri?: string;
      imageUrl?: string;
      verified: boolean;
      error?: string;
    }
  | { kind: 'error'; error: string };

interface NftMetadata {
  image?: string;
  image_url?: string;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }

  if (typeof btoa === 'function') return btoa(binary);
  return Buffer.from(bytes).toString('base64');
}

function sameAddress(a?: string, b?: string): boolean {
  if (!a || !b || !isAddress(a) || !isAddress(b)) return false;
  return getAddress(a).toLowerCase() === getAddress(b).toLowerCase();
}

function normalizeGateway(gateway: string): string {
  return gateway.endsWith('/') ? gateway : `${gateway}/`;
}

export function resolveContentUri(uri: string, gateway = QNS_IPFS_GATEWAY_URL): string {
  const trimmed = uri.trim();
  if (!trimmed) return trimmed;

  if (trimmed.startsWith('ipfs://')) {
    const path = trimmed.slice('ipfs://'.length).replace(/^ipfs\//, '');
    return `${normalizeGateway(gateway)}${path}`;
  }

  if (trimmed.startsWith('ar://')) {
    return `https://arweave.net/${trimmed.slice('ar://'.length)}`;
  }

  return trimmed;
}

function parseDataJson(uri: string): NftMetadata | null {
  const match = uri.match(/^data:application\/json(?:;charset=[^;,]+)?(;base64)?,(.*)$/i);
  if (!match) return null;

  const raw = match[1] ? atob(match[2]) : decodeURIComponent(match[2]);
  return JSON.parse(raw) as NftMetadata;
}

async function fetchMetadata(tokenUri: string): Promise<NftMetadata> {
  const inline = parseDataJson(tokenUri);
  if (inline) return inline;

  const response = await fetch(resolveContentUri(tokenUri));
  if (!response.ok) {
    throw new Error(`NFT metadata returned ${response.status}`);
  }

  return await response.json() as NftMetadata;
}

export function normalizeNftAvatarInput(collection: string, tokenId: string): NftAvatarRef {
  const trimmedCollection = collection.trim();
  const trimmedTokenId = tokenId.trim();

  if (!isAddress(trimmedCollection)) {
    throw new Error('Enter a valid NFT collection address.');
  }

  if (!/^(0x[0-9a-fA-F]+|[0-9]+)$/.test(trimmedTokenId)) {
    throw new Error('Enter a decimal or hex token ID.');
  }

  const normalizedTokenId = BigInt(trimmedTokenId).toString();
  const normalizedCollection = getAddress(trimmedCollection);
  const encoded = `${NFT_AVATAR_PREFIX}${normalizedCollection}:${normalizedTokenId}`;

  return {
    kind: 'erc721',
    chain: 'quai',
    collection: normalizedCollection,
    tokenId: normalizedTokenId,
    encoded,
  };
}

export function encodeNftAvatarRef(collection: string, tokenId: string): Uint8Array {
  return toUtf8Bytes(normalizeNftAvatarInput(collection, tokenId).encoded);
}

export function decodeNftAvatarRefFromHex(avatarHex?: string): NftAvatarRef | null {
  if (!avatarHex || avatarHex === '0x') return null;

  let raw = '';
  try {
    raw = toUtf8String(getBytes(avatarHex));
  } catch {
    return null;
  }

  if (!raw.startsWith(NFT_AVATAR_PREFIX)) return null;

  const parts = raw.slice(NFT_AVATAR_PREFIX.length).split(':');
  if (parts.length !== 2) return null;

  try {
    return normalizeNftAvatarInput(parts[0], parts[1]);
  } catch {
    return null;
  }
}

export function avatarHexToImageUrl(avatarHex?: string): string | null {
  if (!avatarHex || avatarHex === '0x') return null;
  return `data:image/png;base64,${bytesToBase64(getBytes(avatarHex))}`;
}

export async function resolveNftAvatar(ref: NftAvatarRef, expectedOwner?: string): Promise<ResolvedAvatar> {
  try {
    const contract = new Contract(ref.collection, ERC721_AVATAR_ABI, getReadOnlyProvider());
    const tokenId = BigInt(ref.tokenId);
    const owner = await contract.ownerOf(tokenId);
    const verified = expectedOwner ? sameAddress(owner, expectedOwner) : true;

    let tokenUri: string | undefined;
    let imageUrl: string | undefined;
    let metadataError: string | undefined;

    try {
      tokenUri = String(await contract.tokenURI(tokenId));
      const metadata = await fetchMetadata(tokenUri);
      const image = metadata.image || metadata.image_url;
      imageUrl = image ? resolveContentUri(image) : undefined;
      if (!imageUrl) metadataError = 'NFT metadata does not include an image.';
    } catch (error: any) {
      metadataError = error?.message || 'Could not load NFT metadata.';
    }

    return {
      kind: 'nft',
      ref,
      owner,
      tokenUri,
      imageUrl: verified ? imageUrl : undefined,
      verified,
      error: verified ? metadataError : 'NFT owner does not match this QNS owner.',
    };
  } catch (error: any) {
    return {
      kind: 'nft',
      ref,
      verified: false,
      error: error?.message || 'Could not read NFT ownership.',
    };
  }
}

export async function resolveAvatar(avatarHex?: string, ownerAddress?: string): Promise<ResolvedAvatar> {
  if (!avatarHex || avatarHex === '0x') return { kind: 'empty' };

  const nftRef = decodeNftAvatarRefFromHex(avatarHex);
  if (nftRef) return await resolveNftAvatar(nftRef, ownerAddress);

  try {
    const imageUrl = avatarHexToImageUrl(avatarHex);
    return imageUrl ? { kind: 'image', imageUrl } : { kind: 'empty' };
  } catch (error: any) {
    return { kind: 'error', error: error?.message || 'Could not render avatar.' };
  }
}
