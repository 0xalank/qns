const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

const { ethers } = hre;

const ANCHOR_VERSION = 1;
const ANCHOR_FLAGS = 0;
const GAS_LIMITS = {
  QNNS: 6_000_000n,
  QNSCurrentOwnerResolver: 400_000n,
  QNSAnchorRegistry: 800_000n,
  QNSRedirectModule: 1_100_000n,
  QNSStaticContentStore: 700_000n,
  QNSStaticSiteModule: 1_500_000n,
  register: 400_000n,
  createContent: 350_000n,
  setAnchor: 350_000n,
};

let txFromAddress;

const IDS = {
  topologyRedirect: ethers.keccak256(ethers.toUtf8Bytes("qns.topology.redirect.v1")),
  topologyStaticSite: ethers.keccak256(ethers.toUtf8Bytes("qns.topology.static-site.v1")),
  rendererRedirect: ethers.keccak256(ethers.toUtf8Bytes("qns.renderer.redirect.v1")),
  rendererStaticSafe: ethers.keccak256(ethers.toUtf8Bytes("qns.renderer.static-safe.v1")),
  mimeTextMarkdown: ethers.keccak256(ethers.toUtf8Bytes("text/markdown")),
};

function normalizeQnsName(input) {
  let name = String(input || "").trim();
  if (name.endsWith(".qns")) name = name.slice(0, -4);
  name = name.toLowerCase();
  if (!/^[a-z0-9_-]{1,64}$/.test(name)) {
    throw new Error(`Invalid QNS example name: ${input}`);
  }
  return name;
}

function hashName(name) {
  return ethers.solidityPackedKeccak256(["string"], [name]);
}

function encodeAnchor(chainId, moduleAddress, topology, manifestHash) {
  return ethers.solidityPacked(
    ["uint16", "uint16", "uint64", "address", "bytes32", "bytes32"],
    [ANCHOR_VERSION, ANCHOR_FLAGS, chainId, moduleAddress, topology, manifestHash]
  );
}

function txOverrides(label) {
  const envKey = `GAS_LIMIT_${label}`;
  const gasLimit = process.env[envKey] || process.env.GAS_LIMIT;
  const overrides = {
    gasLimit: gasLimit ? BigInt(gasLimit) : GAS_LIMITS[label],
  };
  if (txFromAddress && process.env.DISABLE_FROM_OVERRIDE !== "true") {
    overrides.from = txFromAddress.toLowerCase();
  }
  return overrides;
}

function requireLiveQnnsConfig(networkName) {
  if (!process.env.QNNS_CONTRACT && process.env.ALLOW_DEPLOY_QNNS !== "true") {
    throw new Error(
      `Refusing to deploy a new QNNS contract on ${networkName}. Set QNNS_CONTRACT to the existing QNNS address, or set ALLOW_DEPLOY_QNNS=true if deploying a fresh registry is intentional.`
    );
  }
}

function chunkHexBytes(bytes, chunkSize = 4096) {
  const chunks = [];
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    chunks.push(ethers.hexlify(bytes.slice(offset, offset + chunkSize)));
  }
  return chunks;
}

async function deployQNNS() {
  const QNNS = await ethers.getContractFactory("QNNS");
  const qnns = await QNNS.deploy(
    ethers.parseEther("200"),
    ethers.parseEther("1000"),
    ethers.parseEther("5000"),
    ethers.parseEther("100"),
    ethers.parseEther("13.925"),
    ethers.parseEther("4.33"),
    ethers.parseEther("173"),
    ethers.parseEther("865"),
    txOverrides("QNNS")
  );
  await qnns.waitForDeployment();
  return qnns;
}

async function maybeRegisterExampleName(qnns, signer, name) {
  const nameHash = hashName(name);
  if (await signerOwnsName(qnns, signer, nameHash)) return true;

  const registrationFee = await qnns.registrationFee7Plus();
  const minLockAmount = await qnns.minLockAmount();
  const yearlyFee = await qnns.getYearlyPriceQuaiByLength(name.length);
  const payment = registrationFee + minLockAmount + yearlyFee;
  const tx = await qnns.register(name, signer.address, "", { value: payment, ...txOverrides("register") });
  await tx.wait();
  return true;
}

async function signerOwnsName(qnns, signer, nameHash) {
  try {
    const owner = await qnns.ownerOf(BigInt(nameHash));
    return owner.toLowerCase() === signer.address.toLowerCase();
  } catch (_) {
    return false;
  }
}

async function getOrDeployContract(name, envAddress, ...args) {
  const Factory = await ethers.getContractFactory(name);
  if (envAddress) return Factory.attach(envAddress);
  const contract = await Factory.deploy(...args, txOverrides(name));
  await contract.waitForDeployment();
  return contract;
}

async function main() {
  const [deployer] = await ethers.getSigners();
  txFromAddress = deployer.address;
  const network = await ethers.provider.getNetwork();
  const chainId = network.chainId;
  const modulesOnly = process.env.MODULES_ONLY === "true";
  const exampleName = normalizeQnsName(process.env.EXAMPLE_QNS_NAME || "moduleexample");
  const nameHash = hashName(exampleName);

  console.log("Deploying QNS example modules");
  console.log("Network:", network.name, "chainId:", chainId.toString());
  console.log("Deployer:", deployer.address);
  console.log("Example name:", exampleName);
  console.log("Example nameHash:", nameHash);
  console.log("Modules only:", modulesOnly ? "true" : "false");

  const isLocalExampleNetwork = network.name === "hardhat" || network.name === "localhost";
  if (!isLocalExampleNetwork && !modulesOnly) requireLiveQnnsConfig(network.name);
  const useExistingQnns = Boolean(process.env.QNNS_CONTRACT) && !isLocalExampleNetwork && !modulesOnly;
  const qnns = modulesOnly
    ? null
    : useExistingQnns
      ? await (await ethers.getContractFactory("QNNS")).attach(process.env.QNNS_CONTRACT)
      : await deployQNNS();
  const qnnsAddress = qnns ? await qnns.getAddress() : null;
  console.log("QNNS:", qnnsAddress || "skipped");

  const nameResolver = modulesOnly
    ? null
    : await getOrDeployContract(
      "QNSCurrentOwnerResolver",
      process.env.QNS_NAME_RESOLVER_CONTRACT,
      qnnsAddress
    );
  const nameResolverAddress = nameResolver ? await nameResolver.getAddress() : null;
  console.log("QNSNameResolver:", nameResolverAddress || "skipped");

  const anchorRegistry = modulesOnly
    ? null
    : await getOrDeployContract(
      "QNSAnchorRegistry",
      process.env.QNS_ANCHOR_REGISTRY_CONTRACT,
      nameResolverAddress
    );
  const anchorRegistryAddress = anchorRegistry ? await anchorRegistry.getAddress() : null;
  console.log("QNSAnchorRegistry:", anchorRegistryAddress || "skipped");

  const redirectTarget = process.env.REDIRECT_TARGET_URL || "https://qu.ai";
  const redirectModule = await getOrDeployContract(
    "QNSRedirectModule",
    process.env.QNS_REDIRECT_MODULE_CONTRACT,
    "QNS Redirect Example",
    redirectTarget,
    ethers.ZeroHash,
    1,
    false
  );
  const redirectModuleAddress = await redirectModule.getAddress();
  console.log("QNSRedirectModule:", redirectModuleAddress);

  const contentStore = await getOrDeployContract(
    "QNSStaticContentStore",
    process.env.QNS_STATIC_CONTENT_STORE_CONTRACT
  );
  const contentStoreAddress = await contentStore.getAddress();
  console.log("QNSStaticContentStore:", contentStoreAddress);

  const markdown = [
    "# QNS Static Module Example",
    "",
    "This page is stored in Quai contract state and rendered through the QNS Module Loader.",
    "",
    `Name: ${exampleName}`,
    `Network chainId: ${chainId.toString()}`,
    "",
  ].join("\n");
  const markdownBytes = ethers.toUtf8Bytes(markdown);
  const markdownChunks = chunkHexBytes(markdownBytes);
  const contentHash = ethers.keccak256(markdownBytes);
  const contentId = await contentStore.nextContentId();
  const createContentTx = await contentStore.createContent(
    contentHash,
    markdownBytes.length,
    markdownChunks,
    txOverrides("createContent")
  );
  await createContentTx.wait();
  console.log("Static contentId:", contentId.toString());
  console.log("Static contentHash:", contentHash);

  const staticFiles = [[
    "/index.md",
    IDS.mimeTextMarkdown,
    markdownBytes.length,
    contentHash,
    contentId,
    markdownChunks.length,
  ]];
  const staticSiteModule = await getOrDeployContract(
    "QNSStaticSiteModule",
    process.env.QNS_STATIC_SITE_MODULE_CONTRACT,
    "QNS Static Module Example",
    contentStoreAddress,
    "/index.md",
    1,
    staticFiles
  );
  const staticSiteModuleAddress = await staticSiteModule.getAddress();
  console.log("QNSStaticSiteModule:", staticSiteModuleAddress);

  const selected = (process.env.EXAMPLE_MODULE || "static").toLowerCase();
  const selectedModule = selected === "redirect" ? redirectModule : staticSiteModule;
  const selectedTopology = selected === "redirect" ? IDS.topologyRedirect : IDS.topologyStaticSite;
  const selectedModuleAddress = await selectedModule.getAddress();
  const selectedManifestHash = await selectedModule.moduleManifestHash();
  const anchor = encodeAnchor(chainId, selectedModuleAddress, selectedTopology, selectedManifestHash);

  const shouldSetAnchor = !modulesOnly && (process.env.SET_ANCHOR === "true" || !useExistingQnns);
  let anchorSet = false;
  if (shouldSetAnchor) {
    const ownsName = useExistingQnns && process.env.REGISTER_NAME !== "true"
      ? await signerOwnsName(qnns, deployer, nameHash)
      : await maybeRegisterExampleName(qnns, deployer, exampleName);
    if (!ownsName) {
      console.log("Skipping anchor set: deployer does not own the example name.");
    } else {
      const setAnchorTx = await anchorRegistry.setAnchor(nameHash, anchor, txOverrides("setAnchor"));
      await setAnchorTx.wait();
      anchorSet = true;
      console.log("Anchor set for:", exampleName);
    }
  } else {
    console.log("Skipping anchor set. Use SET_ANCHOR=true when the signer owns EXAMPLE_QNS_NAME.");
  }

  const output = {
    network: network.name,
    chainId: chainId.toString(),
    deployer: deployer.address,
    exampleName,
    nameHash,
    qnnsAddress,
    qnsNameResolverAddress: nameResolverAddress,
    qnsAnchorRegistryAddress: anchorRegistryAddress,
    redirectModuleAddress,
    staticContentStoreAddress: contentStoreAddress,
    staticSiteModuleAddress,
    selectedModule: selected,
    selectedModuleAddress,
    selectedManifestHash,
    anchor,
    anchorSet,
    modulesOnly,
    ids: IDS,
    pelagusResolverConfig: {
      chainId: ethers.toBeHex(chainId),
      qnnsAddress,
      qnsNameResolverAddress: nameResolverAddress,
      qnsAnchorRegistryAddress: anchorRegistryAddress,
      qnsGatewayBaseUrl: process.env.QNS_GATEWAY_BASE_URL || "https://qns.app",
      supportedTopologies: [IDS.topologyRedirect, IDS.topologyStaticSite],
      supportedRenderers: [IDS.rendererRedirect, IDS.rendererStaticSafe],
    },
  };

  const deploymentsDir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(deploymentsDir, { recursive: true });
  const outputPath = path.join(deploymentsDir, `qns-modules-${network.name}-${chainId.toString()}.json`);
  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log("Wrote deployment summary:", outputPath);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
