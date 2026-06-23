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
const NAME_RESOLVER_GAS_LIMIT = BigInt(process.env.GAS_LIMIT_QNSStaticNameResolver || "450000");
const ANCHOR_REGISTRY_GAS_LIMIT = BigInt(process.env.GAS_LIMIT_QNSAnchorRegistry || "900000");
const SET_RECORD_GAS_LIMIT = BigInt(process.env.GAS_LIMIT_setNameRecord || "100000");
const SET_ANCHOR_GAS_LIMIT = BigInt(process.env.GAS_LIMIT_setAnchor || "350000");

const STATIC_NAME_RESOLVER_ABI = [
  "function ownerOfName(bytes32 nameHash) view returns (address owner, bool active)",
  "function setNameRecord(bytes32 nameHash, address owner, bool active)",
];

const ANCHOR_REGISTRY_ABI = [
  "function anchorOf(bytes32 nameHash) view returns (bytes)",
  "function setAnchor(bytes32 nameHash, bytes anchor)",
];

function deploymentPath() {
  return path.join(__dirname, "..", "deployments", "qns-modules-mainnetCyprus1-9.json");
}

function readDeployment() {
  const file = deploymentPath();
  if (!fs.existsSync(file)) {
    throw new Error("Missing deployments/qns-modules-mainnetCyprus1-9.json.");
  }
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

async function resolveGasPrice(rpcUrl) {
  if (process.env.GAS_PRICE_WEI) return BigInt(process.env.GAS_PRICE_WEI);
  return BigInt(await rpc(rpcUrl, "quai_gasPrice"));
}

function txOverrides(gasLimit, gasPriceWei) {
  return { gasLimit, gasPrice: gasPriceWei };
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

async function requireCode(provider, label, address) {
  const code = await provider.getCode(address);
  if (!code || code === "0x") {
    throw new Error(`${label} has no code at ${address} on Quai mainnet Cyprus-1.`);
  }
}

async function deployContract(wallet, name, args, gasLimit, gasPriceWei) {
  const compiled = artifact(name);
  const factory = new ContractFactory(compiled.abi, compiled.bytecode, wallet);
  factory.setIPFSHash(FACTORY_IPFS_HASH);
  const contract = await factory.deploy(...args, txOverrides(gasLimit, gasPriceWei));
  const tx = contract.deploymentTransaction();
  console.log(`${name} tx:`, tx.hash);
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  console.log(`${name}:`, address);
  return address;
}

async function main() {
  const deployment = readDeployment();
  const rpcUrl = process.env.MAINNET_RPC_URL || DEFAULT_RPC_URL;
  const privateKey = process.env.MAINNET_CYPRUS1_PK || process.env.CYPRUS1_PK;
  if (!privateKey) throw new Error("Set MAINNET_CYPRUS1_PK or CYPRUS1_PK.");

  const provider = new JsonRpcProvider(rpcUrl, undefined, { usePathing: false });
  const network = await provider.getNetwork();
  if (network.chainId !== 9n) {
    throw new Error(`Refusing non-mainnet demo anchor flow. Expected chainId 9, got ${network.chainId.toString()}.`);
  }

  const wallet = new Wallet(privateKey, provider);
  const gasPriceWei = await resolveGasPrice(rpcUrl);
  const exampleName = normalizeName(process.env.EXAMPLE_QNS_NAME || deployment.exampleName || "moduleexample");
  const hash = nameHash(exampleName);
  const moduleAddress = deployment.selectedModuleAddress;
  const anchor = deployment.anchor;

  if (!moduleAddress || !isAddress(moduleAddress)) throw new Error("Deployment file has no selected module address.");
  if (!anchor || anchor === "0x") throw new Error("Deployment file has no encoded anchor.");
  await requireCode(provider, "QNS module", moduleAddress);

  console.log("QNS demo name anchor");
  console.log("RPC:", rpcUrl);
  console.log("chainId:", network.chainId.toString());
  console.log("deployer:", wallet.address);
  console.log("balance:", formatQuai(await provider.getBalance(wallet.address)), "QUAI");
  console.log("gasPriceWei:", gasPriceWei.toString());
  console.log("name:", exampleName);
  console.log("nameHash:", hash);
  console.log("moduleAddress:", moduleAddress);

  let nameResolverAddress = configuredAddress(
    process.env.QNS_DEMO_NAME_RESOLVER_ADDRESS,
    process.env.QNS_NAME_RESOLVER_ADDRESS,
    process.env.QNS_MAINNET_NAME_RESOLVER_ADDRESS,
    deployment.qnsNameResolverAddress
  );
  let registryAddress = configuredAddress(
    process.env.QNS_ANCHOR_REGISTRY_ADDRESS,
    process.env.QNS_MAINNET_ANCHOR_REGISTRY_ADDRESS,
    deployment.qnsAnchorRegistryAddress
  );

  const plannedGas =
    (nameResolverAddress ? 0n : NAME_RESOLVER_GAS_LIMIT) +
    SET_RECORD_GAS_LIMIT +
    (registryAddress ? 0n : ANCHOR_REGISTRY_GAS_LIMIT) +
    SET_ANCHOR_GAS_LIMIT;
  const maxCost = plannedGas * gasPriceWei;
  const balance = await provider.getBalance(wallet.address);
  console.log("plannedMaxGas:", plannedGas.toString());
  console.log("plannedMaxCost:", formatQuai(maxCost), "QUAI");
  if (balance < maxCost) {
    throw new Error(`Insufficient balance. Need about ${formatQuai(maxCost)} QUAI; have ${formatQuai(balance)} QUAI.`);
  }

  if (!nameResolverAddress) {
    nameResolverAddress = await deployContract(
      wallet,
      "QNSStaticNameResolver",
      [wallet.address],
      NAME_RESOLVER_GAS_LIMIT,
      gasPriceWei
    );
  } else {
    await requireCode(provider, "QNSStaticNameResolver", nameResolverAddress);
    console.log("Reusing QNSStaticNameResolver:", nameResolverAddress);
  }

  const resolver = new Contract(nameResolverAddress, STATIC_NAME_RESOLVER_ABI, wallet);
  const currentRecord = await resolver.ownerOfName(hash);
  if (!Boolean(currentRecord[1]) || String(currentRecord[0]).toLowerCase() !== wallet.address.toLowerCase()) {
    const tx = await resolver.setNameRecord(hash, wallet.address, true, txOverrides(SET_RECORD_GAS_LIMIT, gasPriceWei));
    console.log("setNameRecord tx:", tx.hash);
    await tx.wait();
  } else {
    console.log("Name record already points at deployer.");
  }

  if (!registryAddress) {
    registryAddress = await deployContract(
      wallet,
      "QNSAnchorRegistry",
      [nameResolverAddress],
      ANCHOR_REGISTRY_GAS_LIMIT,
      gasPriceWei
    );
  } else {
    await requireCode(provider, "QNSAnchorRegistry", registryAddress);
    console.log("Reusing QNSAnchorRegistry:", registryAddress);
  }

  const registry = new Contract(registryAddress, ANCHOR_REGISTRY_ABI, wallet);
  const currentAnchor = await registry.anchorOf(hash);
  if (String(currentAnchor).toLowerCase() !== String(anchor).toLowerCase()) {
    const tx = await registry.setAnchor(hash, anchor, txOverrides(SET_ANCHOR_GAS_LIMIT, gasPriceWei));
    console.log("setAnchor tx:", tx.hash);
    await tx.wait();
  } else {
    console.log("Anchor already set.");
  }

  const updatedAnchor = await registry.anchorOf(hash);
  const updatedRecord = await resolver.ownerOfName(hash);
  console.log("resolver:", nameResolverAddress);
  console.log("registry:", registryAddress);
  console.log("recordOwner:", updatedRecord[0]);
  console.log("recordActive:", Boolean(updatedRecord[1]));
  console.log("anchor:", updatedAnchor);

  deployment.qnnsAddress = null;
  deployment.qnsNameResolverAddress = nameResolverAddress;
  deployment.qnsAnchorRegistryAddress = registryAddress;
  deployment.demoNameResolver = true;
  deployment.anchorSet = String(updatedAnchor).toLowerCase() === String(anchor).toLowerCase();
  deployment.pelagusResolverConfig = {
    ...(deployment.pelagusResolverConfig || {}),
    qnnsAddress: null,
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
