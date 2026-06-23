const fs = require("fs");
const path = require("path");
require("dotenv").config();

const {
  Contract,
  ContractFactory,
  JsonRpcProvider,
  Wallet,
  formatQuai,
  hexlify,
  isAddress,
  keccak256,
  solidityPacked,
  toBeHex,
  toUtf8Bytes,
} = require("quais");

const DEFAULT_RPC_URL = "https://rpc.quai.network/cyprus1";
const FACTORY_IPFS_HASH = "Qm11111111111111111111111111111111111111111111";
const ANCHOR_VERSION = 1;
const ANCHOR_FLAGS = 0;
const MAX_CONTENT_BYTES = 64 * 1024;
const MAX_TOTAL_BYTES = 128 * 1024;
const MAX_CHUNK_BYTES = 4096;
const GAS_LIMITS = {
  QNSStaticContentStore: BigInt(process.env.GAS_LIMIT_QNSStaticContentStore || "700000"),
  QNSStaticSiteModule: BigInt(process.env.GAS_LIMIT_QNSStaticSiteModule || "2200000"),
  createContent: BigInt(process.env.GAS_LIMIT_createContent || "900000"),
};

const IDS = {
  topologyRedirect: keccak256(toUtf8Bytes("qns.topology.redirect.v1")),
  topologyStaticSite: keccak256(toUtf8Bytes("qns.topology.static-site.v1")),
  rendererRedirect: keccak256(toUtf8Bytes("qns.renderer.redirect.v1")),
  rendererStaticSafe: keccak256(toUtf8Bytes("qns.renderer.static-safe.v1")),
  mimeTextMarkdown: keccak256(toUtf8Bytes("text/markdown")),
  mimeTextPlain: keccak256(toUtf8Bytes("text/plain")),
  mimeTextHtml: keccak256(toUtf8Bytes("text/html")),
  mimeTextCss: keccak256(toUtf8Bytes("text/css")),
};

const MIME_BY_EXT = new Map([
  [".html", IDS.mimeTextHtml],
  [".htm", IDS.mimeTextHtml],
  [".css", IDS.mimeTextCss],
  [".md", IDS.mimeTextMarkdown],
  [".markdown", IDS.mimeTextMarkdown],
  [".txt", IDS.mimeTextPlain],
]);

function deploymentPathForChainId(chainId) {
  return path.join(__dirname, "..", "deployments", `qns-modules-mainnetCyprus1-${chainId.toString()}.json`);
}

function readJsonIfExists(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function artifact(name) {
  const file = path.join(__dirname, "..", "artifacts", "contracts", "modules", `${name}.sol`, `${name}.json`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function normalizeQnsName(input) {
  let name = String(input || "").trim();
  if (name.toLowerCase().startsWith("qns://")) {
    name = name.slice(6).split(/[/?#]/)[0] || "";
  }
  if (name.endsWith(".qns")) name = name.slice(0, -4);
  if (name.endsWith(".quai")) name = name.slice(0, -5);
  name = name.toLowerCase();
  if (!/^[a-z0-9_-]{1,64}$/.test(name)) {
    throw new Error("Invalid QNS name. Use 1-64 lowercase ASCII letters, numbers, hyphens, or underscores.");
  }
  return name;
}

function nameHash(name) {
  return keccak256(solidityPacked(["string"], [normalizeQnsName(name)]));
}

function encodeAnchor(chainId, moduleAddress, topology, manifestHash) {
  return solidityPacked(
    ["uint16", "uint16", "uint64", "address", "bytes32", "bytes32"],
    [ANCHOR_VERSION, ANCHOR_FLAGS, chainId, moduleAddress, topology, manifestHash]
  );
}

function chunkHexBytes(bytes) {
  const chunks = [];
  for (let offset = 0; offset < bytes.length; offset += MAX_CHUNK_BYTES) {
    chunks.push(hexlify(bytes.slice(offset, offset + MAX_CHUNK_BYTES)));
  }
  return chunks;
}

function qnsPath(rootDir, file) {
  const rel = path.relative(rootDir, file).split(path.sep).join("/");
  return `/${rel}`;
}

function walkSiteFiles(rootDir) {
  const files = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(absolute);
      } else if (entry.isFile()) {
        files.push(absolute);
      }
    }
  }
  walk(rootDir);
  files.sort((a, b) => qnsPath(rootDir, a).localeCompare(qnsPath(rootDir, b)));
  return files;
}

function readStaticFiles(rootDir, entryPath) {
  const files = walkSiteFiles(rootDir);
  if (files.length === 0) throw new Error(`No publishable files found in ${rootDir}.`);

  const staticFiles = [];
  let totalBytes = 0;
  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    const mimeType = MIME_BY_EXT.get(ext);
    if (!mimeType) {
      throw new Error(`Unsupported static file type for ${file}. V1 supports html, css, md, markdown, and txt.`);
    }

    const routePath = qnsPath(rootDir, file);
    const bytes = fs.readFileSync(file);
    if (bytes.length === 0) throw new Error(`Static file is empty: ${routePath}`);
    if (bytes.length > MAX_CONTENT_BYTES) {
      throw new Error(`Static file exceeds ${MAX_CONTENT_BYTES} bytes: ${routePath}`);
    }
    totalBytes += bytes.length;
    if (totalBytes > MAX_TOTAL_BYTES) {
      throw new Error(`Static site exceeds ${MAX_TOTAL_BYTES} total bytes.`);
    }

    staticFiles.push({
      path: routePath,
      absolutePath: file,
      mimeType,
      bytes,
      chunks: chunkHexBytes(bytes),
      contentHash: keccak256(bytes),
    });
  }

  if (!staticFiles.some((file) => file.path === entryPath)) {
    throw new Error(`Entry file ${entryPath} was not found in ${rootDir}.`);
  }

  return staticFiles;
}

async function rpc(rpcUrl, method, params = []) {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(`${method} failed: ${json.error.message}`);
  return json.result;
}

async function resolveGasPrice(rpcUrl) {
  if (process.env.GAS_PRICE_WEI) return BigInt(process.env.GAS_PRICE_WEI);
  return BigInt(await rpc(rpcUrl, "quai_gasPrice"));
}

function txOverrides(label, gasPriceWei) {
  return {
    gasLimit: GAS_LIMITS[label],
    gasPrice: gasPriceWei,
  };
}

async function deployContract(wallet, name, envAddress, args, gasPriceWei) {
  const compiled = artifact(name);
  if (envAddress) {
    if (!isAddress(envAddress)) throw new Error(`Invalid ${name} address: ${envAddress}`);
    return new Contract(envAddress, compiled.abi, wallet);
  }

  const factory = new ContractFactory(compiled.abi, compiled.bytecode, wallet);
  factory.setIPFSHash(FACTORY_IPFS_HASH);
  const contract = await factory.deploy(...args, txOverrides(name, gasPriceWei));
  const tx = contract.deploymentTransaction();
  console.log(`${name} tx:`, tx.hash);
  await contract.waitForDeployment();
  console.log(`${name}:`, await contract.getAddress());
  return contract;
}

function plannedGasLimit(fileCount) {
  return GAS_LIMITS.QNSStaticContentStore +
    GAS_LIMITS.QNSStaticSiteModule +
    (GAS_LIMITS.createContent * BigInt(fileCount));
}

async function main() {
  const rpcUrl = process.env.MAINNET_RPC_URL || DEFAULT_RPC_URL;
  const privateKey = process.env.MAINNET_CYPRUS1_PK || process.env.CYPRUS1_PK;
  if (!privateKey) throw new Error("Set MAINNET_CYPRUS1_PK or CYPRUS1_PK.");

  const siteDir = path.resolve(process.env.QNS_SITE_DIR || path.join(__dirname, "..", "examples", "static-site"));
  if (!fs.existsSync(siteDir) || !fs.statSync(siteDir).isDirectory()) {
    throw new Error(`QNS_SITE_DIR is not a directory: ${siteDir}`);
  }

  const entryPath = process.env.QNS_ENTRY_PATH || (fs.existsSync(path.join(siteDir, "index.html")) ? "/index.html" : "/index.md");
  const staticFiles = readStaticFiles(siteDir, entryPath);
  const entry = staticFiles.find((file) => file.path === entryPath);
  const htmlPolicy = entry.mimeType === IDS.mimeTextHtml ? 2 : 1;
  const title = process.env.QNS_SITE_TITLE || "QNS Static Site";
  const qnsName = normalizeQnsName(process.env.QNS_NAME || process.env.EXAMPLE_QNS_NAME || "moduleexample");
  const hash = nameHash(qnsName);

  const provider = new JsonRpcProvider(rpcUrl, undefined, { usePathing: false });
  const wallet = new Wallet(privateKey, provider);
  const network = await provider.getNetwork();
  if (network.chainId !== 9n) {
    throw new Error(`Refusing non-mainnet static publish. Expected chainId 9, got ${network.chainId.toString()}.`);
  }

  const gasPriceWei = await resolveGasPrice(rpcUrl);
  const deployerBalance = await provider.getBalance(wallet.address);
  const maxGas = plannedGasLimit(staticFiles.length);
  const maxCost = maxGas * gasPriceWei;

  console.log("QNS static site publish");
  console.log("RPC:", rpcUrl);
  console.log("chainId:", network.chainId.toString());
  console.log("publisher:", wallet.address);
  console.log("publisherBalance:", formatQuai(deployerBalance), "QUAI");
  console.log("siteDir:", siteDir);
  console.log("name:", qnsName);
  console.log("nameHash:", hash);
  console.log("title:", title);
  console.log("entryPath:", entryPath);
  console.log("fileCount:", staticFiles.length);
  console.log("totalBytes:", staticFiles.reduce((sum, file) => sum + file.bytes.length, 0));
  console.log("gasPriceWei:", gasPriceWei.toString());
  console.log("plannedMaxGas:", maxGas.toString());
  console.log("plannedMaxCost:", formatQuai(maxCost), "QUAI");
  if (deployerBalance < maxCost) {
    throw new Error(`Insufficient balance to publish static site. Need about ${formatQuai(maxCost)} QUAI; have ${formatQuai(deployerBalance)} QUAI.`);
  }

  const contentStore = await deployContract(
    wallet,
    "QNSStaticContentStore",
    process.env.QNS_STATIC_CONTENT_STORE_CONTRACT,
    [],
    gasPriceWei
  );
  const contentStoreAddress = await contentStore.getAddress();

  const filesForModule = [];
  const staticFilesOutput = [];
  for (const file of staticFiles) {
    const contentId = await contentStore.nextContentId();
    const tx = await contentStore.createContent(
      file.contentHash,
      file.bytes.length,
      file.chunks,
      txOverrides("createContent", gasPriceWei)
    );
    console.log(`createContent ${file.path} tx:`, tx.hash);
    await tx.wait();
    console.log(`Static content ${file.path} contentId:`, contentId.toString());
    console.log(`Static content ${file.path} contentHash:`, file.contentHash);

    filesForModule.push([
      file.path,
      file.mimeType,
      file.bytes.length,
      file.contentHash,
      contentId,
      file.chunks.length,
    ]);
    staticFilesOutput.push({
      path: file.path,
      mimeType: file.mimeType,
      byteLength: file.bytes.length,
      contentHash: file.contentHash,
      contentId: contentId.toString(),
      chunkCount: file.chunks.length,
    });
  }

  const staticSiteModule = await deployContract(
    wallet,
    "QNSStaticSiteModule",
    process.env.QNS_STATIC_SITE_MODULE_CONTRACT,
    [title, contentStoreAddress, entryPath, htmlPolicy, filesForModule],
    gasPriceWei
  );
  const staticSiteModuleAddress = await staticSiteModule.getAddress();
  const manifestHash = await staticSiteModule.moduleManifestHash();
  const anchor = encodeAnchor(network.chainId, staticSiteModuleAddress, IDS.topologyStaticSite, manifestHash);

  const deploymentPath = deploymentPathForChainId(network.chainId);
  const previous = readJsonIfExists(deploymentPath);
  const output = {
    ...(previous || {}),
    network: "mainnetCyprus1",
    chainId: network.chainId.toString(),
    deployer: wallet.address,
    exampleName: qnsName,
    nameHash: hash,
    sourceSiteDir: siteDir,
    selectedModule: "static-site",
    selectedModuleAddress: staticSiteModuleAddress,
    selectedManifestHash: manifestHash,
    staticContentStoreAddress: contentStoreAddress,
    staticSiteModuleAddress,
    staticFiles: staticFilesOutput,
    anchor,
    anchorSet: false,
    modulesOnly: true,
    ids: IDS,
    pelagusResolverConfig: {
      ...(previous?.pelagusResolverConfig || {}),
      chainId: toBeHex(network.chainId),
      qnsGatewayBaseUrl: process.env.QNS_GATEWAY_BASE_URL || previous?.pelagusResolverConfig?.qnsGatewayBaseUrl || "https://qns.app",
      supportedTopologies: [IDS.topologyRedirect, IDS.topologyStaticSite],
      supportedRenderers: [IDS.rendererRedirect, IDS.rendererStaticSafe],
    },
  };

  writeJson(deploymentPath, output);
  console.log("moduleAddress:", staticSiteModuleAddress);
  console.log("manifestHash:", manifestHash);
  console.log("anchor:", anchor);
  console.log("Wrote deployment summary:", deploymentPath);
  console.log("Next: run npm run anchor:module:mainnet with QNNS_CONTRACT set to canonical QNNS.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
