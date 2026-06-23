const fs = require("fs");
const path = require("path");
require("dotenv").config();

const {
  Contract,
  ContractFactory,
  JsonRpcProvider,
  Wallet,
  formatQuai,
  isAddress,
  keccak256,
  solidityPacked,
} = require("quais");

const DEFAULT_RPC_URL = "https://rpc.quai.network/cyprus1";
const FACTORY_IPFS_HASH = "Qm11111111111111111111111111111111111111111111";
const NAME_RESOLVER_GAS_LIMIT = BigInt(process.env.GAS_LIMIT_QNSCurrentOwnerResolver || "400000");
const ANCHOR_REGISTRY_GAS_LIMIT = BigInt(process.env.GAS_LIMIT_QNSAnchorRegistry || "900000");
const SET_ANCHOR_GAS_LIMIT = BigInt(process.env.GAS_LIMIT_setAnchor || "350000");

const QNNS_ABI = [
  "function isActive(bytes32 nameHash) view returns (bool)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function hashName(string name) view returns (bytes32)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
];

const NAME_RESOLVER_ABI = [
  "function ownerOfName(bytes32 nameHash) view returns (address owner, bool active)",
  "function qnns() view returns (address)",
];

const ANCHOR_REGISTRY_ABI = [
  "function nameResolver() view returns (address)",
  "function anchorOf(bytes32 nameHash) view returns (bytes)",
  "function setAnchor(bytes32 nameHash, bytes anchor)",
];

function deploymentPath() {
  return path.join(__dirname, "..", "deployments", "qns-modules-mainnetCyprus1-9.json");
}

function qnnsDeploymentPath() {
  return path.join(__dirname, "..", "deployments", "qnns-mainnetCyprus1-9.json");
}

function readDeployment() {
  const file = deploymentPath();
  if (!fs.existsSync(file)) {
    throw new Error("Missing deployments/qns-modules-mainnetCyprus1-9.json. Run npm run deploy:examples:mainnet first.");
  }
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function readJsonIfExists(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeDeployment(deployment) {
  fs.writeFileSync(deploymentPath(), `${JSON.stringify(deployment, null, 2)}\n`);
}

function artifact(name) {
  const file = path.join(__dirname, "..", "artifacts", "contracts", "modules", `${name}.sol`, `${name}.json`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function normalizeName(input) {
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
  return keccak256(solidityPacked(["string"], [normalizeName(name)]));
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

async function gasPrice(rpcUrl) {
  if (process.env.GAS_PRICE_WEI) return BigInt(process.env.GAS_PRICE_WEI);
  return BigInt(await rpc(rpcUrl, "quai_gasPrice"));
}

function txOverrides(gasLimit, gasPriceWei) {
  return {
    gasLimit,
    gasPrice: gasPriceWei,
  };
}

function configuredAddress(...values) {
  for (const value of values) {
    if (typeof value === "string" && value) {
      if (!isAddress(value)) throw new Error(`Invalid address: ${value}`);
      return value;
    }
  }
  return "";
}

async function configuredContractWithCode(provider, label, ...values) {
  for (const value of values) {
    if (typeof value !== "string" || !value) continue;
    if (!isAddress(value)) throw new Error(`Invalid ${label} address: ${value}`);
    const code = await provider.getCode(value);
    if (code && code !== "0x") return value;
    console.log(`Skipping ${label} candidate with no code:`, value);
  }
  return "";
}

async function resolverBacksQnns(provider, resolverAddress, qnnsAddress) {
  if (!resolverAddress || !qnnsAddress) return false;
  try {
    const resolver = new Contract(resolverAddress, NAME_RESOLVER_ABI, provider);
    const resolvedQnns = await resolver.qnns();
    return String(resolvedQnns).toLowerCase() === qnnsAddress.toLowerCase();
  } catch (_) {
    return false;
  }
}

async function requireCode(provider, label, address) {
  const code = await provider.getCode(address);
  if (!code || code === "0x") {
    throw new Error(`${label} has no code at ${address} on Quai mainnet Cyprus-1.`);
  }
  return code;
}

async function readQnns(provider, qnnsAddress, checkedName, hash) {
  await requireCode(provider, "QNNS", qnnsAddress);
  const qnns = new Contract(qnnsAddress, QNNS_ABI, provider);
  const output = {
    name: null,
    symbol: null,
    active: null,
    owner: null,
    hashMatchesContract: null,
  };

  try {
    output.name = await qnns.name();
  } catch (_) {}

  try {
    output.symbol = await qnns.symbol();
  } catch (_) {}

  try {
    output.hashMatchesContract = String(await qnns.hashName(checkedName)).toLowerCase() === hash.toLowerCase();
  } catch (_) {}

  try {
    output.active = Boolean(await qnns.isActive(hash));
  } catch (error) {
    throw new Error(`QNNS at ${qnnsAddress} does not support isActive(bytes32): ${error.shortMessage || error.message}`);
  }

  if (output.active) {
    try {
      output.owner = await qnns.ownerOf(BigInt(hash));
    } catch (error) {
      throw new Error(`QNNS at ${qnnsAddress} does not support ownerOf(uint256 nameHash): ${error.shortMessage || error.message}`);
    }
  }

  return output;
}

async function readNameResolver(provider, nameResolverAddress, hash) {
  await requireCode(provider, "QNS name resolver", nameResolverAddress);
  const resolver = new Contract(nameResolverAddress, NAME_RESOLVER_ABI, provider);
  const result = await resolver.ownerOfName(hash);
  const active = Boolean(result[1]);
  return {
    active,
    owner: active ? String(result[0]) : null,
  };
}

async function deployNameResolver(wallet, qnnsAddress, gasPriceWei) {
  const compiled = artifact("QNSCurrentOwnerResolver");
  const factory = new ContractFactory(compiled.abi, compiled.bytecode, wallet);
  factory.setIPFSHash(FACTORY_IPFS_HASH);
  const resolver = await factory.deploy(qnnsAddress, txOverrides(NAME_RESOLVER_GAS_LIMIT, gasPriceWei));
  const tx = resolver.deploymentTransaction();
  console.log("QNSCurrentOwnerResolver tx:", tx.hash);
  await resolver.waitForDeployment();
  return resolver.getAddress();
}

async function deployAnchorRegistry(wallet, nameResolverAddress, gasPriceWei) {
  const compiled = artifact("QNSAnchorRegistry");
  const factory = new ContractFactory(compiled.abi, compiled.bytecode, wallet);
  factory.setIPFSHash(FACTORY_IPFS_HASH);
  const registry = await factory.deploy(nameResolverAddress, txOverrides(ANCHOR_REGISTRY_GAS_LIMIT, gasPriceWei));
  const tx = registry.deploymentTransaction();
  console.log("QNSAnchorRegistry tx:", tx.hash);
  await registry.waitForDeployment();
  return registry.getAddress();
}

async function main() {
  const deployment = readDeployment();
  const rpcUrl = process.env.MAINNET_RPC_URL || DEFAULT_RPC_URL;
  const provider = new JsonRpcProvider(rpcUrl, undefined, { usePathing: false });
  const network = await provider.getNetwork();
  if (network.chainId !== 9n) {
    throw new Error(`Refusing non-mainnet anchor flow. Expected chainId 9, got ${network.chainId.toString()}.`);
  }

  const qnnsDeployment = readJsonIfExists(qnnsDeploymentPath());
  const exampleName = normalizeName(process.env.EXAMPLE_QNS_NAME || deployment.exampleName || "moduleexample");
  const hash = nameHash(exampleName);
  const qnnsAddress = await configuredContractWithCode(
    provider,
    "QNNS",
    process.env.QNNS_CONTRACT,
    process.env.QNS_MAINNET_QNNS_ADDRESS,
    qnnsDeployment?.qnnsAddress,
    deployment.qnnsAddress
  );
  const deploymentResolverIsDemo = deployment.demoNameResolver === true;
  const deploymentResolverCandidate = deploymentResolverIsDemo && qnnsAddress
    ? ""
    : deployment.qnsNameResolverAddress;
  const deploymentRegistryCandidate = deploymentResolverIsDemo && qnnsAddress
    ? ""
    : deployment.qnsAnchorRegistryAddress;
  let nameResolverAddress = configuredAddress(
    process.env.QNS_NAME_RESOLVER_ADDRESS,
    process.env.QNS_MAINNET_NAME_RESOLVER_ADDRESS,
    deploymentResolverCandidate
  );
  let registryAddress = configuredAddress(
    process.env.QNS_ANCHOR_REGISTRY_ADDRESS,
    process.env.QNS_MAINNET_ANCHOR_REGISTRY_ADDRESS,
    deploymentRegistryCandidate
  );

  console.log("QNS mainnet anchor readiness");
  console.log("RPC:", rpcUrl);
  console.log("chainId:", network.chainId.toString());
  console.log("name:", exampleName);
  console.log("nameHash:", hash);
  console.log("moduleAddress:", deployment.selectedModuleAddress);
  console.log("anchor:", deployment.anchor);

  await requireCode(provider, "QNS module", deployment.selectedModuleAddress);

  if (!qnnsAddress && !nameResolverAddress) {
    throw new Error("Set QNNS_CONTRACT, QNS_MAINNET_QNNS_ADDRESS, or QNS_NAME_RESOLVER_ADDRESS to validate or deploy an anchor registry.");
  }

  let qnnsStatus = { active: null, owner: null };
  if (qnnsAddress) {
    qnnsStatus = await readQnns(provider, qnnsAddress, exampleName, hash);
    console.log("QNNS:", qnnsAddress);
    console.log("QNNS name:", qnnsStatus.name ?? "unavailable");
    console.log("QNNS symbol:", qnnsStatus.symbol ?? "unavailable");
    console.log("QNNS hashName matches local:", qnnsStatus.hashMatchesContract ?? "unavailable");
    console.log("QNNS active:", qnnsStatus.active);
    console.log("QNNS owner:", qnnsStatus.owner ?? "none");
  } else {
    console.log("QNNS: not set");
  }

  let resolverStatus = { active: null, owner: null };
  if (nameResolverAddress) {
    if (qnnsAddress && !(await resolverBacksQnns(provider, nameResolverAddress, qnnsAddress))) {
      if (process.env.DEPLOY_NAME_RESOLVER === "true" || process.env.DEPLOY_ANCHOR_REGISTRY === "true") {
        console.log("Ignoring non-QNNS-backed resolver for canonical anchor:", nameResolverAddress);
        nameResolverAddress = "";
      } else if (process.env.ALLOW_NON_QNNS_RESOLVER !== "true") {
        throw new Error(
          `Configured resolver ${nameResolverAddress} is not backed by QNNS ${qnnsAddress}. Set DEPLOY_NAME_RESOLVER=true or ALLOW_NON_QNNS_RESOLVER=true.`
        );
      }
    }
  }

  if (nameResolverAddress) {
    resolverStatus = await readNameResolver(provider, nameResolverAddress, hash);
    console.log("QNSNameResolver:", nameResolverAddress);
    console.log("Resolver active:", resolverStatus.active);
    console.log("Resolver owner:", resolverStatus.owner ?? "none");
  } else {
    console.log("QNSNameResolver: not set");
  }

  const privateKey = process.env.MAINNET_CYPRUS1_PK || process.env.CYPRUS1_PK;
  const gasPriceWei = await gasPrice(rpcUrl);
  console.log("Gas price wei:", gasPriceWei.toString());

  let signerAddress = null;
  let wallet = null;
  if (privateKey) {
    wallet = new Wallet(privateKey, provider);
    signerAddress = wallet.address;
    console.log("Signer:", signerAddress);
    console.log("Signer balance:", formatQuai(await provider.getBalance(signerAddress)), "QUAI");
  } else {
    console.log("Signer: none");
  }

  if (!nameResolverAddress && (process.env.DEPLOY_NAME_RESOLVER === "true" || process.env.DEPLOY_ANCHOR_REGISTRY === "true")) {
    if (!wallet) throw new Error("Set MAINNET_CYPRUS1_PK or CYPRUS1_PK to deploy QNSCurrentOwnerResolver.");
    if (!qnnsAddress) throw new Error("Set QNNS_CONTRACT or QNS_MAINNET_QNNS_ADDRESS to deploy QNSCurrentOwnerResolver.");
    const maxCost = NAME_RESOLVER_GAS_LIMIT * gasPriceWei;
    const balance = await provider.getBalance(signerAddress);
    console.log("Name resolver max gas:", NAME_RESOLVER_GAS_LIMIT.toString());
    console.log("Name resolver max cost:", formatQuai(maxCost), "QUAI");
    if (balance < maxCost) {
      throw new Error(`Insufficient balance to deploy QNSCurrentOwnerResolver. Need about ${formatQuai(maxCost)} QUAI; have ${formatQuai(balance)} QUAI.`);
    }
    nameResolverAddress = await deployNameResolver(wallet, qnnsAddress, gasPriceWei);
    deployment.qnnsAddress = qnnsAddress;
    deployment.qnsNameResolverAddress = nameResolverAddress;
    deployment.pelagusResolverConfig = {
      ...(deployment.pelagusResolverConfig || {}),
      qnnsAddress,
      qnsNameResolverAddress: nameResolverAddress,
    };
    writeDeployment(deployment);
    console.log("QNSNameResolver:", nameResolverAddress);
    resolverStatus = await readNameResolver(provider, nameResolverAddress, hash);
    console.log("Resolver active:", resolverStatus.active);
    console.log("Resolver owner:", resolverStatus.owner ?? "none");
    console.log("Updated deployment:", deploymentPath());
  }

  if (registryAddress && nameResolverAddress) {
    await requireCode(provider, "QNSAnchorRegistry", registryAddress);
    const registryForCheck = new Contract(registryAddress, ANCHOR_REGISTRY_ABI, provider);
    const registryResolver = await registryForCheck.nameResolver();
    if (registryResolver.toLowerCase() !== nameResolverAddress.toLowerCase()) {
      if (process.env.DEPLOY_ANCHOR_REGISTRY === "true") {
        console.log("Ignoring registry with resolver mismatch:", registryAddress);
        console.log("Registry resolver:", registryResolver);
        console.log("Expected resolver:", nameResolverAddress);
        registryAddress = "";
      } else {
        throw new Error(
          `QNSAnchorRegistry resolver mismatch. Registry uses ${registryResolver}; expected ${nameResolverAddress}. Deploy a new registry with DEPLOY_ANCHOR_REGISTRY=true.`
        );
      }
    }
  }

  if (!registryAddress && process.env.DEPLOY_ANCHOR_REGISTRY === "true") {
    if (!wallet) throw new Error("Set MAINNET_CYPRUS1_PK or CYPRUS1_PK to deploy QNSAnchorRegistry.");
    if (!nameResolverAddress) throw new Error("Set QNS_NAME_RESOLVER_ADDRESS or DEPLOY_NAME_RESOLVER=true before deploying QNSAnchorRegistry.");
    const maxCost = ANCHOR_REGISTRY_GAS_LIMIT * gasPriceWei;
    const balance = await provider.getBalance(signerAddress);
    console.log("Anchor registry max gas:", ANCHOR_REGISTRY_GAS_LIMIT.toString());
    console.log("Anchor registry max cost:", formatQuai(maxCost), "QUAI");
    if (balance < maxCost) {
      throw new Error(`Insufficient balance to deploy QNSAnchorRegistry. Need about ${formatQuai(maxCost)} QUAI; have ${formatQuai(balance)} QUAI.`);
    }
    registryAddress = await deployAnchorRegistry(wallet, nameResolverAddress, gasPriceWei);
    deployment.qnnsAddress = qnnsAddress;
    deployment.qnsNameResolverAddress = nameResolverAddress;
    deployment.qnsAnchorRegistryAddress = registryAddress;
    deployment.pelagusResolverConfig = {
      ...(deployment.pelagusResolverConfig || {}),
      qnnsAddress,
      qnsNameResolverAddress: nameResolverAddress,
      qnsAnchorRegistryAddress: registryAddress,
    };
    writeDeployment(deployment);
    console.log("QNSAnchorRegistry:", registryAddress);
    console.log("Updated deployment:", deploymentPath());
  }

  if (!registryAddress) {
    console.log("QNSAnchorRegistry: not set");
    console.log("Set DEPLOY_ANCHOR_REGISTRY=true to deploy one once QNNS is confirmed.");
    return;
  }

  await requireCode(provider, "QNSAnchorRegistry", registryAddress);
  const registry = new Contract(registryAddress, ANCHOR_REGISTRY_ABI, wallet || provider);
  const registryResolver = await registry.nameResolver();
  if (nameResolverAddress && registryResolver.toLowerCase() !== nameResolverAddress.toLowerCase()) {
    throw new Error(
      `QNSAnchorRegistry resolver mismatch. Registry uses ${registryResolver}; expected ${nameResolverAddress}. Deploy a new registry with DEPLOY_ANCHOR_REGISTRY=true.`
    );
  }
  const currentAnchor = await registry.anchorOf(hash);
  console.log("QNSAnchorRegistry:", registryAddress);
  console.log("Current anchor:", currentAnchor && currentAnchor !== "0x" ? currentAnchor : "none");

  if (process.env.SET_ANCHOR !== "true") {
    console.log("Set SET_ANCHOR=true to write the module anchor for this name.");
    return;
  }

  if (!wallet) throw new Error("Set MAINNET_CYPRUS1_PK or CYPRUS1_PK to set the name anchor.");
  const ownerStatus = nameResolverAddress ? resolverStatus : qnnsStatus;
  if (!ownerStatus.active) throw new Error("Cannot set anchor: QNS name is not active.");
  if (!ownerStatus.owner || ownerStatus.owner.toLowerCase() !== signerAddress.toLowerCase()) {
    throw new Error(`Cannot set anchor: signer ${signerAddress} does not own ${exampleName}.`);
  }

  if (currentAnchor.toLowerCase() === String(deployment.anchor).toLowerCase()) {
    console.log("Anchor already set to deployment anchor.");
    deployment.anchorSet = true;
    deployment.qnnsAddress = qnnsAddress;
    deployment.qnsNameResolverAddress = nameResolverAddress;
    deployment.qnsAnchorRegistryAddress = registryAddress;
    deployment.demoNameResolver = false;
    deployment.pelagusResolverConfig = {
      ...(deployment.pelagusResolverConfig || {}),
      qnnsAddress,
      qnsNameResolverAddress: nameResolverAddress,
      qnsAnchorRegistryAddress: registryAddress,
    };
    writeDeployment(deployment);
    return;
  }

  const maxCost = SET_ANCHOR_GAS_LIMIT * gasPriceWei;
  const balance = await provider.getBalance(signerAddress);
  console.log("setAnchor max gas:", SET_ANCHOR_GAS_LIMIT.toString());
  console.log("setAnchor max cost:", formatQuai(maxCost), "QUAI");
  if (balance < maxCost) {
    throw new Error(`Insufficient balance to set anchor. Need about ${formatQuai(maxCost)} QUAI; have ${formatQuai(balance)} QUAI.`);
  }

  const tx = await registry.setAnchor(hash, deployment.anchor, txOverrides(SET_ANCHOR_GAS_LIMIT, gasPriceWei));
  console.log("setAnchor tx:", tx.hash);
  await tx.wait();
  const updatedAnchor = await registry.anchorOf(hash);
  console.log("Updated anchor:", updatedAnchor);

  deployment.anchorSet = true;
  deployment.qnnsAddress = qnnsAddress;
  deployment.qnsNameResolverAddress = nameResolverAddress;
  deployment.qnsAnchorRegistryAddress = registryAddress;
  deployment.demoNameResolver = false;
  deployment.pelagusResolverConfig = {
    ...(deployment.pelagusResolverConfig || {}),
    qnnsAddress,
    qnsNameResolverAddress: nameResolverAddress,
    qnsAnchorRegistryAddress: registryAddress,
  };
  writeDeployment(deployment);
  console.log("Updated deployment:", deploymentPath());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
