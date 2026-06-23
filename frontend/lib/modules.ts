import {
  AbiCoder,
  Contract,
  ZeroHash,
  getBytes,
  isAddress,
  keccak256,
  solidityPacked,
  solidityPackedKeccak256,
  toUtf8Bytes,
  toUtf8String,
} from 'quais';
import {
  QNS_ANCHOR_REGISTRY_ADDRESS,
  QNS_EXAMPLE_MODULE_ADDRESS,
} from './constants';
import { getReadOnlyProvider } from './wallet';

export const QNS_ANCHOR_VERSION = 1;
export const QNS_ANCHOR_BYTES = 96;

export const QNS_MODULE_IDS = {
  topologyRedirect: keccak256(toUtf8Bytes('qns.topology.redirect.v1')),
  topologyStaticSite: keccak256(toUtf8Bytes('qns.topology.static-site.v1')),
  rendererRedirect: keccak256(toUtf8Bytes('qns.renderer.redirect.v1')),
  rendererStaticSafe: keccak256(toUtf8Bytes('qns.renderer.static-safe.v1')),
  contentModeNone: ZeroHash,
  mimeTextMarkdown: keccak256(toUtf8Bytes('text/markdown')),
  mimeTextPlain: keccak256(toUtf8Bytes('text/plain')),
  mimeTextHtml: keccak256(toUtf8Bytes('text/html')),
  mimeTextCss: keccak256(toUtf8Bytes('text/css')),
} as const;

export const DEFAULT_MODULE_ADDRESS = QNS_EXAMPLE_MODULE_ADDRESS;
export const DEFAULT_ANCHOR_REGISTRY_ADDRESS = QNS_ANCHOR_REGISTRY_ADDRESS;

const QNS_ANCHOR_REGISTRY_ABI = [
  'function nameResolver() view returns (address)',
  'function anchorOf(bytes32 nameHash) view returns (bytes)',
  'function decodeAnchor(bytes anchor) pure returns (tuple(uint16 version, uint16 flags, uint64 chainId, address moduleAddress, bytes32 topology, bytes32 manifestHash))',
] as const;

const QNS_MODULE_ABI = [
  'function moduleVersion() view returns (uint16)',
  'function moduleTopology() view returns (bytes32)',
  'function moduleManifestHash() view returns (bytes32)',
  'function moduleManifest() view returns (bytes)',
  'function resolveRoute(bytes path, bytes query) view returns (bytes32 renderer, bytes payload, bytes32 payloadHash)',
] as const;

const QNS_STATIC_CONTENT_STORE_ABI = [
  'function getContentChunk(uint256 contentId, uint16 chunkIndex) view returns (bytes)',
] as const;

const MODULE_MANIFEST_V1_ABI =
  'tuple(uint16,bytes32,bytes32,bytes32,string,string,tuple(uint32,bytes32[]),tuple(uint32,uint32,uint32,uint32,uint32),bytes)';
const REDIRECT_MANIFEST_V1_ABI = 'tuple(string,bytes32,uint8,bool)';
const STATIC_SITE_MANIFEST_V1_ABI =
  'tuple(address,string,bytes32,uint8,tuple(string,bytes32,uint32,bytes32,uint256,uint16)[])';

const coder = AbiCoder.defaultAbiCoder();

export interface QNSAnchor {
  version: number;
  flags: number;
  chainId: bigint;
  moduleAddress: string;
  topology: string;
  manifestHash: string;
}

export interface ModuleManifestV1 {
  version: number;
  topology: string;
  rendererId: string;
  contentMode: string;
  title: string;
  defaultRoute: string;
  permissionPolicy: {
    flags: number;
    providerMethodIds: string[];
  };
  resourceBudget: {
    maxManifestBytes: number;
    maxRoutePayloadBytes: number;
    maxContractReads: number;
    maxTotalLoadedBytes: number;
    maxRenderMillis: number;
  };
  topologyData: string;
}

export interface RedirectManifestV1 {
  targetUrl: string;
  targetContentHash: string;
  mode: number;
  preservePath: boolean;
}

export interface StaticFileRefV1 {
  path: string;
  mimeType: string;
  byteLength: number;
  contentHash: string;
  contentId: bigint;
  chunkCount: number;
}

export interface StaticSiteManifestV1 {
  contentStore: string;
  entryPath: string;
  rootHash: string;
  htmlPolicy: number;
  files: StaticFileRefV1[];
}

export interface LoadedModule {
  moduleAddress: string;
  moduleVersion: number;
  topology: string;
  manifestHash: string;
  manifestBytes: string;
  manifest: ModuleManifestV1;
  verified: boolean;
  anchor?: QNSAnchor;
  name?: string;
  nameHash?: string;
}

export interface StaticFileContent {
  file: StaticFileRefV1;
  text: string;
  bytes: Uint8Array;
}

export function normalizeQNSName(input: string): string {
  let value = String(input || '').trim();

  if (value.toLowerCase().startsWith('qns://')) {
    value = value.slice(6).split(/[/?#]/)[0] || '';
  } else if (/^https?:\/\//i.test(value)) {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (host.endsWith('.quai')) {
      value = decodeURIComponent(host.slice(0, -5));
    } else if (host === 'qns.app') {
      value = decodeURIComponent(url.pathname.split('/').filter(Boolean)[0] || '');
    }
  }

  if (value.endsWith('.quai')) value = value.slice(0, -5);
  if (value.endsWith('.qns')) value = value.slice(0, -4);
  value = value.toLowerCase();

  const bytes = toUtf8Bytes(value);
  if (bytes.length === 0 || bytes.length > 64 || !/^[a-z0-9_-]+$/.test(value)) {
    throw new Error('Invalid QNS name. Use 1-64 lowercase ASCII letters, numbers, hyphens, or underscores.');
  }
  return value;
}

export function hashQNSName(input: string): string {
  return solidityPackedKeccak256(['string'], [normalizeQNSName(input)]);
}

export function encodeQNSAnchor(anchor: QNSAnchor): string {
  return solidityPacked(
    ['uint16', 'uint16', 'uint64', 'address', 'bytes32', 'bytes32'],
    [anchor.version, anchor.flags, anchor.chainId, anchor.moduleAddress, anchor.topology, anchor.manifestHash]
  );
}

export function decodeQNSAnchor(anchorBytes: string): QNSAnchor {
  const hex = anchorBytes.startsWith('0x') ? anchorBytes.slice(2) : anchorBytes;
  if (!/^[0-9a-fA-F]*$/.test(hex) || hex.length !== QNS_ANCHOR_BYTES * 2) {
    throw new Error(`Invalid QNS anchor length. Expected ${QNS_ANCHOR_BYTES} bytes.`);
  }

  return {
    version: Number.parseInt(hex.slice(0, 4), 16),
    flags: Number.parseInt(hex.slice(4, 8), 16),
    chainId: BigInt(`0x${hex.slice(8, 24)}`),
    moduleAddress: `0x${hex.slice(24, 64)}`,
    topology: `0x${hex.slice(64, 128)}`,
    manifestHash: `0x${hex.slice(128, 192)}`,
  };
}

export function decodeModuleManifestV1(manifestBytes: string): ModuleManifestV1 {
  const decoded = coder.decode([MODULE_MANIFEST_V1_ABI], manifestBytes)[0] as any;
  const permissionPolicy = decoded[6] as any;
  const resourceBudget = decoded[7] as any;

  return {
    version: Number(decoded[0]),
    topology: decoded[1],
    rendererId: decoded[2],
    contentMode: decoded[3],
    title: decoded[4],
    defaultRoute: decoded[5],
    permissionPolicy: {
      flags: Number(permissionPolicy[0]),
      providerMethodIds: Array.from(permissionPolicy[1] || []),
    },
    resourceBudget: {
      maxManifestBytes: Number(resourceBudget[0]),
      maxRoutePayloadBytes: Number(resourceBudget[1]),
      maxContractReads: Number(resourceBudget[2]),
      maxTotalLoadedBytes: Number(resourceBudget[3]),
      maxRenderMillis: Number(resourceBudget[4]),
    },
    topologyData: decoded[8],
  };
}

export function decodeRedirectManifestV1(topologyData: string): RedirectManifestV1 {
  const decoded = coder.decode([REDIRECT_MANIFEST_V1_ABI], topologyData)[0] as any;
  return {
    targetUrl: decoded[0],
    targetContentHash: decoded[1],
    mode: Number(decoded[2]),
    preservePath: Boolean(decoded[3]),
  };
}

export function decodeStaticSiteManifestV1(topologyData: string): StaticSiteManifestV1 {
  const decoded = coder.decode([STATIC_SITE_MANIFEST_V1_ABI], topologyData)[0] as any;
  return {
    contentStore: decoded[0],
    entryPath: decoded[1],
    rootHash: decoded[2],
    htmlPolicy: Number(decoded[3]),
    files: Array.from(decoded[4] || []).map((file: any) => ({
      path: file[0],
      mimeType: file[1],
      byteLength: Number(file[2]),
      contentHash: file[3],
      contentId: BigInt(file[4]),
      chunkCount: Number(file[5]),
    })),
  };
}

export function moduleTopologyLabel(topology: string): string {
  const lower = topology.toLowerCase();
  if (lower === QNS_MODULE_IDS.topologyRedirect.toLowerCase()) return 'Redirect Module';
  if (lower === QNS_MODULE_IDS.topologyStaticSite.toLowerCase()) return 'Static Site Module';
  return 'Unknown Module';
}

export function rendererLabel(rendererId: string): string {
  const lower = rendererId.toLowerCase();
  if (lower === QNS_MODULE_IDS.rendererRedirect.toLowerCase()) return 'Built-in Redirect Renderer';
  if (lower === QNS_MODULE_IDS.rendererStaticSafe.toLowerCase()) return 'Built-in Static Safe Renderer';
  return 'Unknown Renderer';
}

export async function loadModuleByAddress(moduleAddress: string, expectedAnchor?: QNSAnchor): Promise<LoadedModule> {
  if (!isAddress(moduleAddress)) throw new Error('Invalid module address.');

  const contract = new Contract(moduleAddress, QNS_MODULE_ABI, getReadOnlyProvider());
  const [moduleVersion, topology, manifestHash, manifestBytes] = await Promise.all([
    contract.moduleVersion(),
    contract.moduleTopology(),
    contract.moduleManifestHash(),
    contract.moduleManifest(),
  ]);
  const computedManifestHash = keccak256(manifestBytes);

  if (computedManifestHash.toLowerCase() !== String(manifestHash).toLowerCase()) {
    throw new Error('Module manifest hash does not match moduleManifest().');
  }
  if (expectedAnchor) {
    if (expectedAnchor.version !== Number(moduleVersion)) throw new Error('Anchor version does not match module version.');
    if (expectedAnchor.moduleAddress.toLowerCase() !== moduleAddress.toLowerCase()) {
      throw new Error('Anchor module address does not match loaded module.');
    }
    if (expectedAnchor.topology.toLowerCase() !== String(topology).toLowerCase()) {
      throw new Error('Anchor topology does not match loaded module.');
    }
    if (expectedAnchor.manifestHash.toLowerCase() !== String(manifestHash).toLowerCase()) {
      throw new Error('Anchor manifest hash does not match loaded module.');
    }
  }

  return {
    moduleAddress,
    moduleVersion: Number(moduleVersion),
    topology: String(topology),
    manifestHash: String(manifestHash),
    manifestBytes,
    manifest: decodeModuleManifestV1(manifestBytes),
    verified: true,
    anchor: expectedAnchor,
  };
}

export async function loadModuleByName(nameInput: string, registryAddress = DEFAULT_ANCHOR_REGISTRY_ADDRESS): Promise<LoadedModule> {
  if (!registryAddress || !isAddress(registryAddress)) {
    throw new Error('A valid QNS anchor registry address is required.');
  }

  const name = normalizeQNSName(nameInput);
  const nameHash = hashQNSName(name);
  const registry = new Contract(registryAddress, QNS_ANCHOR_REGISTRY_ABI, getReadOnlyProvider());
  const anchorBytes = await registry.anchorOf(nameHash);
  if (!anchorBytes || anchorBytes === '0x') throw new Error('No QNS module anchor found for this name.');

  const anchor = decodeQNSAnchor(anchorBytes);
  const loaded = await loadModuleByAddress(anchor.moduleAddress, anchor);
  return {
    ...loaded,
    anchor,
    name,
    nameHash,
  };
}

export async function readStaticFile(staticSite: StaticSiteManifestV1, file: StaticFileRefV1): Promise<StaticFileContent> {
  if (!isAddress(staticSite.contentStore)) throw new Error('Invalid static content store address.');

  const store = new Contract(staticSite.contentStore, QNS_STATIC_CONTENT_STORE_ABI, getReadOnlyProvider());
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < file.chunkCount; i++) {
    chunks.push(getBytes(await store.getContentChunk(file.contentId, i)));
  }

  const bytes = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }

  if (bytes.length !== file.byteLength) throw new Error('Static file byte length mismatch.');
  if (keccak256(bytes).toLowerCase() !== file.contentHash.toLowerCase()) {
    throw new Error('Static file content hash mismatch.');
  }

  return {
    file,
    bytes,
    text: toUtf8String(bytes),
  };
}
