import { quais } from 'quais';

export const QNS_ANCHOR_VERSION = 1;
export const QNS_ANCHOR_BYTES = 96;

export const QNS_MODULE_IDS = {
  topologyRedirect: quais.keccak256(quais.toUtf8Bytes('qns.topology.redirect.v1')),
  topologyStaticSite: quais.keccak256(quais.toUtf8Bytes('qns.topology.static-site.v1')),
  rendererRedirect: quais.keccak256(quais.toUtf8Bytes('qns.renderer.redirect.v1')),
  rendererStaticSafe: quais.keccak256(quais.toUtf8Bytes('qns.renderer.static-safe.v1')),
  contentModeNone: quais.ZeroHash,
  mimeTextMarkdown: quais.keccak256(quais.toUtf8Bytes('text/markdown')),
  mimeTextPlain: quais.keccak256(quais.toUtf8Bytes('text/plain')),
  mimeTextHtml: quais.keccak256(quais.toUtf8Bytes('text/html')),
  mimeTextCss: quais.keccak256(quais.toUtf8Bytes('text/css')),
} as const;

export const QNS_ANCHOR_REGISTRY_ABI = [
  'function nameResolver() view returns (address)',
  'function anchorOf(bytes32 nameHash) view returns (bytes)',
  'function decodeAnchor(bytes anchor) pure returns (tuple(uint16 version, uint16 flags, uint64 chainId, address moduleAddress, bytes32 topology, bytes32 manifestHash))',
] as const;

export const QNS_MODULE_ABI = [
  'function moduleVersion() view returns (uint16)',
  'function moduleTopology() view returns (bytes32)',
  'function moduleManifestHash() view returns (bytes32)',
  'function moduleManifest() view returns (bytes)',
  'function resolveRoute(bytes path, bytes query) view returns (bytes32 renderer, bytes payload, bytes32 payloadHash)',
] as const;

export const QNS_STATIC_CONTENT_STORE_ABI = [
  'function getContentChunk(uint256 contentId, uint16 chunkIndex) view returns (bytes)',
] as const;

const MODULE_MANIFEST_V1_ABI =
  'tuple(uint16,bytes32,bytes32,bytes32,string,string,tuple(uint32,bytes32[]),tuple(uint32,uint32,uint32,uint32,uint32),bytes)';

const REDIRECT_MANIFEST_V1_ABI = 'tuple(string,bytes32,uint8,bool)';

const STATIC_SITE_MANIFEST_V1_ABI =
  'tuple(address,string,bytes32,uint8,tuple(string,bytes32,uint32,bytes32,uint256,uint16)[])';

const coder = quais.AbiCoder.defaultAbiCoder();

export interface QNSAnchor {
  version: number;
  flags: number;
  chainId: bigint;
  moduleAddress: string;
  topology: string;
  manifestHash: string;
}

export interface PermissionPolicyV1 {
  flags: number;
  providerMethodIds: string[];
}

export interface ResourceBudgetV1 {
  maxManifestBytes: number;
  maxRoutePayloadBytes: number;
  maxContractReads: number;
  maxTotalLoadedBytes: number;
  maxRenderMillis: number;
}

export interface ModuleManifestV1 {
  version: number;
  topology: string;
  rendererId: string;
  contentMode: string;
  title: string;
  defaultRoute: string;
  permissionPolicy: PermissionPolicyV1;
  resourceBudget: ResourceBudgetV1;
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

export interface LoadedQNSModule {
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

export interface QNSModuleClientConfig {
  rpcUrl: string;
  qnsAnchorRegistryAddress?: string;
}

export function normalizeQNSName(input: string): string {
  let value = String(input || '').trim();

  if (value.toLowerCase().startsWith('qns://')) {
    value = value.slice(6).split(/[/?#]/)[0] || '';
  } else if (/^https?:\/\//i.test(value)) {
    const url = new URL(value);
    if (url.hostname.toLowerCase() === 'qns.app') {
      value = decodeURIComponent(url.pathname.split('/').filter(Boolean)[0] || '');
    }
  }

  if (value.endsWith('.quai')) {
    value = value.slice(0, -5);
  }

  if (value.endsWith('.qns')) {
    value = value.slice(0, -4);
  }

  value = value.toLowerCase();
  const bytes = quais.toUtf8Bytes(value);

  if (bytes.length === 0 || bytes.length > 64 || !/^[a-z0-9_-]+$/.test(value)) {
    throw new Error('Invalid QNS name. Use 1-64 lowercase ASCII letters, numbers, hyphens, or underscores.');
  }

  return value;
}

export function hashQNSName(input: string): string {
  return quais.solidityPackedKeccak256(['string'], [normalizeQNSName(input)]);
}

export function encodeQNSAnchor(anchor: QNSAnchor): string {
  return quais.solidityPacked(
    ['uint16', 'uint16', 'uint64', 'address', 'bytes32', 'bytes32'],
    [
      anchor.version,
      anchor.flags,
      anchor.chainId,
      anchor.moduleAddress,
      anchor.topology,
      anchor.manifestHash,
    ]
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

export class QNSModuleClient {
  private provider: quais.Provider;
  private reader: quais.Provider | quais.Signer;
  private qnsAnchorRegistryAddress?: string;

  constructor(config: QNSModuleClientConfig, signer?: quais.Signer) {
    this.provider = new quais.JsonRpcProvider(config.rpcUrl, undefined, { usePathing: false });
    this.reader = signer || this.provider;
    this.qnsAnchorRegistryAddress = config.qnsAnchorRegistryAddress;
  }

  async loadModuleByAddress(moduleAddress: string, expectedAnchor?: QNSAnchor): Promise<LoadedQNSModule> {
    if (!quais.isAddress(moduleAddress)) throw new Error('Invalid module address.');

    const contract = new quais.Contract(moduleAddress, QNS_MODULE_ABI, this.reader);
    const [moduleVersion, topology, manifestHash, manifestBytes] = await Promise.all([
      contract.moduleVersion(),
      contract.moduleTopology(),
      contract.moduleManifestHash(),
      contract.moduleManifest(),
    ]);
    const computedManifestHash = quais.keccak256(manifestBytes);

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

  async loadModuleByName(nameInput: string, registryAddress = this.qnsAnchorRegistryAddress): Promise<LoadedQNSModule> {
    if (!registryAddress || !quais.isAddress(registryAddress)) {
      throw new Error('A valid QNS anchor registry address is required.');
    }

    const name = normalizeQNSName(nameInput);
    const nameHash = hashQNSName(name);
    const registry = new quais.Contract(registryAddress, QNS_ANCHOR_REGISTRY_ABI, this.reader);
    const anchorBytes = await registry.anchorOf(nameHash);
    if (!anchorBytes || anchorBytes === '0x') throw new Error('No QNS module anchor found for this name.');

    const anchor = decodeQNSAnchor(anchorBytes);
    const loaded = await this.loadModuleByAddress(anchor.moduleAddress, anchor);
    return {
      ...loaded,
      anchor,
      name,
      nameHash,
    };
  }

  async readStaticFile(staticSite: StaticSiteManifestV1, file: StaticFileRefV1): Promise<Uint8Array> {
    if (!quais.isAddress(staticSite.contentStore)) throw new Error('Invalid static content store address.');
    const store = new quais.Contract(staticSite.contentStore, QNS_STATIC_CONTENT_STORE_ABI, this.reader);
    const chunks: Uint8Array[] = [];
    for (let i = 0; i < file.chunkCount; i++) {
      chunks.push(quais.getBytes(await store.getContentChunk(file.contentId, i)));
    }
    const out = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
    let offset = 0;
    for (const chunk of chunks) {
      out.set(chunk, offset);
      offset += chunk.length;
    }

    if (out.length !== file.byteLength) throw new Error('Static file byte length mismatch.');
    if (quais.keccak256(out).toLowerCase() !== file.contentHash.toLowerCase()) {
      throw new Error('Static file content hash mismatch.');
    }
    return out;
  }
}
