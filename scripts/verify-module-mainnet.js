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
} = require("quais");

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

const TOPOLOGY_LABELS = {
  "0xe83c66cbf3d417805e6d19d933996a5e7a030118d14a87ed657885a5af454fd6": "redirect",
  "0x79844e650577da7b679098174ff1e92bab7cad7249e559505c0daf6b2734a6a0": "static-site",
};

function readDeployment() {
  const defaultPath = path.join(__dirname, "..", "deployments", "qns-modules-mainnetCyprus1-9.json");
  const deploymentPath = process.env.DEPLOYMENT_FILE
    ? path.resolve(process.env.DEPLOYMENT_FILE)
    : defaultPath;

  if (!fs.existsSync(deploymentPath)) {
    return { deploymentPath, deployment: null };
  }

  return {
    deploymentPath,
    deployment: JSON.parse(fs.readFileSync(deploymentPath, "utf8")),
  };
}

function decodeManifest(manifestBytes) {
  const coder = AbiCoder.defaultAbiCoder();
  const decoded = coder.decode([MODULE_MANIFEST_V1_ABI], manifestBytes)[0];
  const topologyData = decoded[8];
  const manifest = {
    version: Number(decoded[0]),
    topology: decoded[1],
    rendererId: decoded[2],
    contentMode: decoded[3],
    title: decoded[4],
    defaultRoute: decoded[5],
    topologyData,
  };
  const topologyLabel = TOPOLOGY_LABELS[String(manifest.topology).toLowerCase()] || "unknown";

  if (topologyLabel === "redirect") {
    const redirect = coder.decode([REDIRECT_MANIFEST_V1_ABI], topologyData)[0];
    return {
      ...manifest,
      topologyLabel,
      redirect: {
        targetUrl: redirect[0],
        targetContentHash: redirect[1],
        mode: Number(redirect[2]),
        preservePath: Boolean(redirect[3]),
      },
    };
  }

  if (topologyLabel === "static-site") {
    const staticSite = coder.decode([STATIC_SITE_MANIFEST_V1_ABI], topologyData)[0];
    return {
      ...manifest,
      topologyLabel,
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

  return {
    ...manifest,
    topologyLabel,
  };
}

async function verifyStaticFile(provider, staticSite, entry) {
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
    chunkCount: entry.chunkCount,
    contentHash: entry.contentHash,
    computedHash,
  };
}

async function verifyStaticFiles(provider, staticSite) {
  if (!staticSite.files.length) throw new Error("Static-site manifest has no files.");
  return Promise.all(
    staticSite.files.map((entry) => verifyStaticFile(provider, staticSite, entry))
  );
}

async function main() {
  const { deploymentPath, deployment } = readDeployment();
  const rpcUrl = process.env.MAINNET_RPC_URL || "https://rpc.quai.network/cyprus1";
  const explicitModuleAddress = process.env.MODULE_ADDRESS || "";

  if (
    !explicitModuleAddress &&
    deployment?.selectedModule === "fixed-redirect" &&
    process.env.ALLOW_LEGACY_REDIRECT !== "true"
  ) {
    throw new Error(
      "Deployment file points to the legacy redirect-only module. Deploy QNSFixedStaticSiteModule, set MODULE_ADDRESS to a static module, or set ALLOW_LEGACY_REDIRECT=true for explicit redirect testing."
    );
  }

  const moduleAddress = explicitModuleAddress || deployment?.selectedModuleAddress;

  if (!moduleAddress || !isAddress(moduleAddress)) {
    throw new Error("Set MODULE_ADDRESS or provide deployments/qns-modules-mainnetCyprus1-9.json.");
  }

  const provider = new JsonRpcProvider(rpcUrl, undefined, { usePathing: false });
  const network = await provider.getNetwork();
  if (network.chainId !== 9n) {
    throw new Error(`Refusing non-mainnet verification. Expected chainId 9, got ${network.chainId.toString()}.`);
  }

  const code = await provider.getCode(moduleAddress);
  if (!code || code === "0x") {
    throw new Error(`No contract code at ${moduleAddress} on Quai mainnet Cyprus-1.`);
  }

  const moduleContract = new Contract(moduleAddress, QNS_MODULE_ABI, provider);
  const [moduleVersion, topology, manifestHash, manifestBytes] = await Promise.all([
    moduleContract.moduleVersion(),
    moduleContract.moduleTopology(),
    moduleContract.moduleManifestHash(),
    moduleContract.moduleManifest(),
  ]);
  const computedManifestHash = keccak256(getBytes(manifestBytes));
  if (computedManifestHash.toLowerCase() !== String(manifestHash).toLowerCase()) {
    throw new Error("Live moduleManifest() hash does not match moduleManifestHash().");
  }

  const manifest = decodeManifest(manifestBytes);
  const staticFilesContent = manifest.staticSite
    ? await verifyStaticFiles(provider, manifest.staticSite)
    : null;
  const deploymentManifestMatch = deployment?.selectedManifestHash
    ? deployment.selectedManifestHash.toLowerCase() === String(manifestHash).toLowerCase()
    : null;

  if (deploymentManifestMatch === false) {
    throw new Error("Live manifest hash does not match the deployment file.");
  }

  console.log("Mainnet module verified");
  console.log("deploymentFile:", deployment ? deploymentPath : "not used");
  console.log("rpc:", rpcUrl);
  console.log("chainId:", network.chainId.toString());
  console.log("moduleAddress:", moduleAddress);
  console.log("moduleVersion:", moduleVersion.toString());
  console.log("topology:", `${manifest.topologyLabel} ${topology}`);
  console.log("rendererId:", manifest.rendererId);
  console.log("title:", manifest.title);
  console.log("defaultRoute:", manifest.defaultRoute);
  console.log("manifestHash:", manifestHash);
  console.log("deploymentManifestMatch:", deploymentManifestMatch ?? "not checked");

  if (manifest.redirect) {
    console.log("targetUrl:", manifest.redirect.targetUrl);
    console.log("preservePath:", String(manifest.redirect.preservePath));
  }

  if (manifest.staticSite) {
    console.log("contentStore:", manifest.staticSite.contentStore);
    console.log("entryPath:", manifest.staticSite.entryPath);
    console.log("fileCount:", manifest.staticSite.files.length.toString());
  }

  if (staticFilesContent) {
    for (const file of staticFilesContent) {
      console.log("staticFile:", file.path);
      console.log("  mimeType:", file.mimeType);
      console.log("  contentBytes:", file.byteLength.toString());
      console.log("  contentHash:", file.contentHash);
      console.log("  contentHashVerified:", String(file.contentHash.toLowerCase() === file.computedHash.toLowerCase()));
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
