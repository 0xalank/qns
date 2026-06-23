const fs = require("fs");
const path = require("path");
require("dotenv").config();

const {
  AbiCoder,
  Contract,
  JsonRpcProvider,
  getBytes,
  isAddress,
  keccak256,
  solidityPacked,
  toUtf8String,
} = require("quais");

const DEFAULT_RPC_URL = "https://rpc.quai.network/cyprus1";
const ANCHOR_BYTES = 96;

const ANCHOR_REGISTRY_ABI = [
  "function anchorOf(bytes32 nameHash) view returns (bytes)",
];

const QNS_MODULE_ABI = [
  "function moduleVersion() view returns (uint16)",
  "function moduleTopology() view returns (bytes32)",
  "function moduleManifestHash() view returns (bytes32)",
  "function moduleManifest() view returns (bytes)",
  "function resolveRoute(bytes path, bytes query) view returns (bytes32 renderer, bytes payload, bytes32 payloadHash)",
];

const QNS_STATIC_CONTENT_STORE_ABI = [
  "function getContentChunk(uint256 contentId, uint16 chunkIndex) view returns (bytes)",
];

const MODULE_MANIFEST_V1_ABI =
  "tuple(uint16,bytes32,bytes32,bytes32,string,string,tuple(uint32,bytes32[]),tuple(uint32,uint32,uint32,uint32,uint32),bytes)";

const REDIRECT_MANIFEST_V1_ABI = "tuple(string,bytes32,uint8,bool)";

const STATIC_SITE_MANIFEST_V1_ABI =
  "tuple(address,string,bytes32,uint8,tuple(string,bytes32,uint32,bytes32,uint256,uint16)[])";

const TOPOLOGIES = {
  redirect:
    "0xe83c66cbf3d417805e6d19d933996a5e7a030118d14a87ed657885a5af454fd6",
  staticSite:
    "0x79844e650577da7b679098174ff1e92bab7cad7249e559505c0daf6b2734a6a0",
};

const RENDERERS = {
  redirect:
    "0x8624f1122126df1c20b0efc11b03f06e0e3f8e04c2900ce39f8e5ab78bc43e25",
  staticSafe:
    "0x22fd625d7fddc14a58d287fa9c2cc7641e7df64e1fbeb66c781c50f245018712",
};

function deploymentPath() {
  return path.join(__dirname, "..", "deployments", "qns-modules-mainnetCyprus1-9.json");
}

function readDeployment() {
  const file = deploymentPath();
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function normalizeName(input) {
  let value = String(input || "").trim();

  if (value.toLowerCase().startsWith("qns://")) {
    value = value.slice(6).split(/[/?#]/)[0] || "";
  } else if (/^https?:\/\//i.test(value)) {
    const url = new URL(value);
    if (url.hostname.toLowerCase() === "qns.app") {
      value = decodeURIComponent(url.pathname.split("/").filter(Boolean)[0] || "");
    }
  }

  if (value.endsWith(".qns")) value = value.slice(0, -4);
  value = value.toLowerCase();

  if (!/^[a-z0-9_-]{1,64}$/.test(value)) {
    throw new Error(
      "Invalid QNS name. Use 1-64 lowercase ASCII letters, numbers, hyphens, or underscores."
    );
  }

  return value;
}

function hashName(name) {
  return keccak256(solidityPacked(["string"], [normalizeName(name)]));
}

function decodeAnchor(anchorBytes) {
  const hex = anchorBytes.startsWith("0x") ? anchorBytes.slice(2) : anchorBytes;
  if (!/^[0-9a-fA-F]*$/.test(hex) || hex.length !== ANCHOR_BYTES * 2) {
    throw new Error(`Invalid QNS anchor. Expected ${ANCHOR_BYTES} bytes.`);
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

function topologyLabel(topology) {
  const lower = String(topology).toLowerCase();
  if (lower === TOPOLOGIES.redirect) return "redirect";
  if (lower === TOPOLOGIES.staticSite) return "static-site";
  return "unknown";
}

function rendererLabel(renderer) {
  const lower = String(renderer).toLowerCase();
  if (lower === RENDERERS.redirect) return "redirect";
  if (lower === RENDERERS.staticSafe) return "static-safe";
  return "unknown";
}

function decodeManifest(manifestBytes) {
  const coder = AbiCoder.defaultAbiCoder();
  const decoded = coder.decode([MODULE_MANIFEST_V1_ABI], manifestBytes)[0];
  const permissions = decoded[6];
  const budget = decoded[7];
  const base = {
    version: Number(decoded[0]),
    topology: decoded[1],
    topologyLabel: topologyLabel(decoded[1]),
    rendererId: decoded[2],
    rendererLabel: rendererLabel(decoded[2]),
    contentMode: decoded[3],
    title: decoded[4],
    defaultRoute: decoded[5],
    permissionPolicy: {
      flags: Number(permissions[0]),
      providerMethodIds: Array.from(permissions[1] || []),
    },
    resourceBudget: {
      maxManifestBytes: Number(budget[0]),
      maxRoutePayloadBytes: Number(budget[1]),
      maxContractReads: Number(budget[2]),
      maxTotalLoadedBytes: Number(budget[3]),
      maxRenderMillis: Number(budget[4]),
    },
  };

  if (base.topologyLabel === "redirect") {
    const redirect = coder.decode([REDIRECT_MANIFEST_V1_ABI], decoded[8])[0];
    return {
      ...base,
      redirect: {
        targetUrl: redirect[0],
        targetContentHash: redirect[1],
        mode: Number(redirect[2]),
        preservePath: Boolean(redirect[3]),
      },
    };
  }

  if (base.topologyLabel === "static-site") {
    const staticSite = coder.decode([STATIC_SITE_MANIFEST_V1_ABI], decoded[8])[0];
    return {
      ...base,
      staticSite: {
        contentStore: staticSite[0],
        entryPath: staticSite[1],
        rootHash: staticSite[2],
        htmlPolicy: Number(staticSite[3]),
        files: Array.from(staticSite[4] || []).map((file) => ({
          path: file[0],
          mimeType: file[1],
          byteLength: Number(file[2]),
          contentHash: file[3],
          contentId: file[4].toString(),
          chunkCount: Number(file[5]),
        })),
      },
    };
  }

  return base;
}

async function loadModule(provider, moduleAddress, expectedAnchor) {
  if (!isAddress(moduleAddress)) throw new Error("Invalid module address.");

  const module = new Contract(moduleAddress, QNS_MODULE_ABI, provider);
  const [moduleVersion, topology, manifestHash, manifestBytes] =
    await Promise.all([
      module.moduleVersion(),
      module.moduleTopology(),
      module.moduleManifestHash(),
      module.moduleManifest(),
    ]);
  const computedManifestHash = keccak256(getBytes(manifestBytes));

  if (computedManifestHash.toLowerCase() !== String(manifestHash).toLowerCase()) {
    throw new Error("Module manifest hash mismatch.");
  }

  if (expectedAnchor) {
    if (expectedAnchor.version !== Number(moduleVersion)) {
      throw new Error("Anchor version does not match module version.");
    }
    if (
      expectedAnchor.moduleAddress.toLowerCase() !==
      String(moduleAddress).toLowerCase()
    ) {
      throw new Error("Anchor module address does not match module address.");
    }
    if (expectedAnchor.topology.toLowerCase() !== String(topology).toLowerCase()) {
      throw new Error("Anchor topology does not match module topology.");
    }
    if (
      expectedAnchor.manifestHash.toLowerCase() !==
      String(manifestHash).toLowerCase()
    ) {
      throw new Error("Anchor manifest hash does not match module manifest hash.");
    }
  }

  return {
    moduleAddress,
    moduleVersion: Number(moduleVersion),
    topology,
    manifestHash,
    manifest: decodeManifest(manifestBytes),
    verified: true,
  };
}

async function readStaticFile(provider, staticSite, entry) {
  if (!isAddress(staticSite.contentStore)) throw new Error("Invalid static content store address.");

  const store = new Contract(staticSite.contentStore, QNS_STATIC_CONTENT_STORE_ABI, provider);
  const chunks = [];
  for (let i = 0; i < entry.chunkCount; i++) {
    chunks.push(getBytes(await store.getContentChunk(entry.contentId, i)));
  }

  const byteLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }

  if (bytes.length !== entry.byteLength) {
    throw new Error(`Static file byte length mismatch. Expected ${entry.byteLength}, got ${bytes.length}.`);
  }

  const computedHash = keccak256(bytes);
  if (computedHash.toLowerCase() !== entry.contentHash.toLowerCase()) {
    throw new Error("Static file content hash mismatch.");
  }

  return {
    path: entry.path,
    mimeType: entry.mimeType,
    byteLength: bytes.length,
    contentHash: entry.contentHash,
    computedHash,
    chunkCount: entry.chunkCount,
    text: toUtf8String(bytes),
  };
}

async function readStaticFiles(provider, staticSite) {
  if (!staticSite.files.length) throw new Error("Static-site manifest has no files.");
  return Promise.all(
    staticSite.files.map((entry) => readStaticFile(provider, staticSite, entry))
  );
}

function stringify(value) {
  return JSON.stringify(
    value,
    (_key, inner) => (typeof inner === "bigint" ? inner.toString() : inner),
    2
  );
}

async function main() {
  const deployment = readDeployment();
  const rpcUrl = process.env.MAINNET_RPC_URL || DEFAULT_RPC_URL;
  const nameInput = process.env.QNS_NAME || "";
  const registryAddress =
    process.env.QNS_ANCHOR_REGISTRY_ADDRESS ||
    process.env.QNS_MAINNET_ANCHOR_REGISTRY_ADDRESS ||
    deployment?.qnsAnchorRegistryAddress ||
    "";
  const explicitModuleAddress = process.env.MODULE_ADDRESS || "";
  if (
    !explicitModuleAddress &&
    !nameInput &&
    deployment?.selectedModule === "fixed-redirect" &&
    process.env.ALLOW_LEGACY_REDIRECT !== "true"
  ) {
    throw new Error(
      "Deployment file points to the legacy redirect-only module. Deploy QNSFixedStaticSiteModule, set MODULE_ADDRESS to a static module, or set ALLOW_LEGACY_REDIRECT=true for explicit redirect testing."
    );
  }
  let moduleAddress = explicitModuleAddress || deployment?.selectedModuleAddress;
  let anchor = null;
  let name = null;
  let nameHash = null;

  const provider = new JsonRpcProvider(rpcUrl, undefined, { usePathing: false });
  const network = await provider.getNetwork();
  if (network.chainId !== 9n) {
    throw new Error(`Refusing non-mainnet load. Expected chainId 9, got ${network.chainId.toString()}.`);
  }

  if (nameInput) {
    if (!registryAddress || !isAddress(registryAddress)) {
      throw new Error("Set QNS_ANCHOR_REGISTRY_ADDRESS to load by QNS_NAME on mainnet.");
    }
    name = normalizeName(nameInput);
    nameHash = hashName(name);
    const registry = new Contract(registryAddress, ANCHOR_REGISTRY_ABI, provider);
    const anchorBytes = await registry.anchorOf(nameHash);
    if (!anchorBytes || anchorBytes === "0x") {
      throw new Error("No QNS module anchor found for this name.");
    }
    anchor = decodeAnchor(anchorBytes);
    moduleAddress = anchor.moduleAddress;
  }

  if (!moduleAddress) {
    throw new Error("Set MODULE_ADDRESS, QNS_NAME, or keep the mainnet deployment file present.");
  }

  const loaded = await loadModule(provider, moduleAddress, anchor);
  const staticFilesContent = loaded.manifest.staticSite
    ? await readStaticFiles(provider, loaded.manifest.staticSite)
    : null;
  const staticContent = staticFilesContent
    ? staticFilesContent.find((file) => file.path === loaded.manifest.staticSite.entryPath) ||
      staticFilesContent[0]
    : null;
  const result = {
    chainId: network.chainId.toString(),
    rpcUrl,
    source: name ? "qns-name" : "module-address",
    name,
    nameHash,
    qnsAnchorRegistryAddress: registryAddress || null,
    anchor,
    ...loaded,
    staticFilesContent,
    staticContent,
  };

  if (process.env.JSON === "true" || process.argv.includes("--json")) {
    console.log(stringify(result));
    return;
  }

  console.log("QNS mainnet module loaded");
  console.log("source:", result.source);
  if (result.name) console.log("name:", result.name);
  if (result.nameHash) console.log("nameHash:", result.nameHash);
  console.log("chainId:", result.chainId);
  console.log("moduleAddress:", result.moduleAddress);
  console.log("verified:", String(result.verified));
  console.log("topology:", `${result.manifest.topologyLabel} ${result.topology}`);
  console.log("renderer:", `${result.manifest.rendererLabel} ${result.manifest.rendererId}`);
  console.log("title:", result.manifest.title);
  console.log("defaultRoute:", result.manifest.defaultRoute);
  console.log("manifestHash:", result.manifestHash);
  if (result.manifest.redirect) {
    console.log("targetUrl:", result.manifest.redirect.targetUrl);
  }
  if (result.manifest.staticSite) {
    console.log("entryPath:", result.manifest.staticSite.entryPath);
    console.log("fileCount:", String(result.manifest.staticSite.files.length));
    console.log("contentStore:", result.manifest.staticSite.contentStore);
  }
  if (result.staticFilesContent) {
    for (const file of result.staticFilesContent) {
      console.log("staticFile:", file.path);
      console.log("  mimeType:", file.mimeType);
      console.log("  contentBytes:", String(file.byteLength));
      console.log("  contentHash:", file.contentHash);
      console.log("  contentHashVerified:", String(file.contentHash.toLowerCase() === file.computedHash.toLowerCase()));
    }
  }
  if (result.staticContent) {
    console.log("renderedEntry:");
    console.log(result.staticContent.text.trimEnd());
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
