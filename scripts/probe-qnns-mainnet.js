const https = require("https");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const {
  Contract,
  JsonRpcProvider,
  isAddress,
  keccak256,
  solidityPacked,
} = require("quais");

const DEFAULT_RPC_URL = "https://rpc.quai.network/cyprus1";
const DEFAULT_SCAN_ADDRESS = "0x000b74eE75396be4Dd6985aD2b841458c0775f02";

const QNNS_PROBE_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function hashName(string name) view returns (bytes32)",
  "function isActive(bytes32 nameHash) view returns (bool)",
  "function isRegistered(bytes32 nameHash) view returns (bool)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function ownerOfName(bytes32 nameHash) view returns (address owner, bool active)",
];

function normalizeName(input) {
  let name = String(input || "").trim();
  if (name.endsWith(".qns")) name = name.slice(0, -4);
  name = name.toLowerCase();
  if (!/^[a-z0-9_-]{1,64}$/.test(name)) {
    throw new Error("Invalid QNS probe name. Use 1-64 lowercase ASCII letters, numbers, hyphens, or underscores.");
  }
  return name;
}

function hashName(name) {
  return keccak256(solidityPacked(["string"], [normalizeName(name)]));
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (error) {
            reject(error);
          }
        });
      })
      .on("error", reject);
  });
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function deploymentPath() {
  return path.join(__dirname, "..", "deployments", "qns-modules-mainnetCyprus1-9.json");
}

function readDeployment() {
  const file = deploymentPath();
  if (!fs.existsSync(file)) return {};
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function csvEnv(name) {
  return String(process.env[name] || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

async function candidatesFromQuaiscanAddress(scanAddress, pages) {
  const base = `https://quaiscan.io/api/v2/addresses/${scanAddress}/transactions`;
  let url = base;
  const candidates = [];

  for (let page = 0; page < pages && url; page++) {
    const json = await getJson(url);
    for (const item of json.items || []) {
      if (item.created_contract?.hash) candidates.push(item.created_contract.hash);
      if (item.to?.is_contract && item.to?.hash) candidates.push(item.to.hash);
    }

    const params = json.next_page_params;
    if (!params) break;
    url = `${base}?${new URLSearchParams(params).toString()}`;
  }

  return unique(candidates);
}

async function candidatesFromQuaiscan(scanAddresses, pages) {
  const candidates = [];
  for (const scanAddress of scanAddresses) {
    if (!isAddress(scanAddress)) throw new Error(`Invalid QNNS scan address: ${scanAddress}`);
    candidates.push(...await candidatesFromQuaiscanAddress(scanAddress, pages));
  }
  return unique(candidates);
}

async function tryCall(fn) {
  try {
    return { ok: true, value: await fn() };
  } catch (error) {
    return {
      ok: false,
      error: error.shortMessage || error.message,
    };
  }
}

async function probeCandidate(provider, address, checkedName, checkedNameHash) {
  const code = await provider.getCode(address);
  const contract = new Contract(address, QNNS_PROBE_ABI, provider);
  const [name, symbol, contractHash, active, registered, owner, resolverOwner] = await Promise.all([
    tryCall(() => contract.name()),
    tryCall(() => contract.symbol()),
    tryCall(() => contract.hashName(checkedName)),
    tryCall(() => contract.isActive(checkedNameHash)),
    tryCall(() => contract.isRegistered(checkedNameHash)),
    tryCall(() => contract.ownerOf(BigInt(checkedNameHash))),
    tryCall(() => contract.ownerOfName(checkedNameHash)),
  ]);

  const hashMatches = contractHash.ok
    ? String(contractHash.value).toLowerCase() === checkedNameHash.toLowerCase()
    : false;
  const ownerCheckRequired = active.ok && active.value === true;
  const qnnsCompatible =
    active.ok &&
    (contractHash.ok ? hashMatches : true) &&
    (!ownerCheckRequired || owner.ok);
  const resolverCompatible = resolverOwner.ok;

  return {
    address,
    codeBytes: code === "0x" ? 0 : (code.length - 2) / 2,
    compatible: qnnsCompatible || resolverCompatible,
    qnnsCompatible,
    resolverCompatible,
    name,
    symbol,
    hashName: contractHash,
    hashMatches,
    isActive: active,
    isRegistered: registered,
    ownerOf: owner,
    ownerOfName: resolverOwner,
  };
}

function printHuman(results) {
  const compatible = results.filter((result) => result.compatible);
  console.log("QNNS mainnet probe");
  console.log("compatible:", compatible.length);
  for (const result of results) {
    console.log("");
    console.log(result.address);
    console.log("  codeBytes:", result.codeBytes);
    console.log("  compatible:", result.compatible);
    console.log("  qnnsCompatible:", result.qnnsCompatible);
    console.log("  resolverCompatible:", result.resolverCompatible);
    console.log("  name:", result.name.ok ? result.name.value : `ERR ${result.name.error}`);
    console.log("  symbol:", result.symbol.ok ? result.symbol.value : `ERR ${result.symbol.error}`);
    console.log("  hashName:", result.hashName.ok ? result.hashName.value : `ERR ${result.hashName.error}`);
    console.log("  hashMatches:", result.hashMatches);
    console.log("  isActive:", result.isActive.ok ? result.isActive.value : `ERR ${result.isActive.error}`);
    console.log("  isRegistered:", result.isRegistered.ok ? result.isRegistered.value : `ERR ${result.isRegistered.error}`);
    console.log("  ownerOf:", result.ownerOf.ok ? result.ownerOf.value : `ERR ${result.ownerOf.error}`);
    console.log("  ownerOfName:", result.ownerOfName.ok ? `${result.ownerOfName.value[0]} active=${result.ownerOfName.value[1]}` : `ERR ${result.ownerOfName.error}`);
  }
}

async function main() {
  const rpcUrl = process.env.MAINNET_RPC_URL || DEFAULT_RPC_URL;
  const provider = new JsonRpcProvider(rpcUrl, undefined, { usePathing: false });
  const network = await provider.getNetwork();
  if (network.chainId !== 9n) {
    throw new Error(`Refusing non-mainnet probe. Expected chainId 9, got ${network.chainId.toString()}.`);
  }

  const checkedName = normalizeName(process.env.EXAMPLE_QNS_NAME || "moduleexample");
  const checkedNameHash = hashName(checkedName);
  const deployment = readDeployment();
  const explicitCandidates = unique([
    process.env.QNNS_CONTRACT,
    process.env.QNS_MAINNET_QNNS_ADDRESS,
    process.env.QNS_NAME_RESOLVER_ADDRESS,
    process.env.QNS_MAINNET_NAME_RESOLVER_ADDRESS,
    deployment.qnnsAddress,
    deployment.qnsNameResolverAddress,
    ...csvEnv("QNNS_CANDIDATES"),
    ...csvEnv("QNS_NAME_RESOLVER_CANDIDATES"),
  ]);
  const scanAddresses = unique([
    ...csvEnv("QNNS_SCAN_ADDRESSES"),
    process.env.QNNS_SCAN_ADDRESS,
    DEFAULT_SCAN_ADDRESS,
  ]);
  const pages = Number.parseInt(process.env.QUAISCAN_PAGES || "4", 10);

  for (const candidate of explicitCandidates) {
    if (!isAddress(candidate)) throw new Error(`Invalid QNNS candidate: ${candidate}`);
  }

  const scanCandidates = process.env.SKIP_QUAISCAN === "true"
    ? []
    : await candidatesFromQuaiscan(scanAddresses, pages);
  const candidates = unique([...explicitCandidates, ...scanCandidates]);
  const results = [];

  for (const candidate of candidates) {
    results.push(await probeCandidate(provider, candidate, checkedName, checkedNameHash));
  }

  if (process.env.JSON === "true" || process.argv.includes("--json")) {
    console.log(JSON.stringify({
      chainId: network.chainId.toString(),
      rpcUrl,
      checkedName,
      checkedNameHash,
      scanAddresses,
      candidates: results,
    }, null, 2));
    return;
  }

  console.log("chainId:", network.chainId.toString());
  console.log("checkedName:", checkedName);
  console.log("checkedNameHash:", checkedNameHash);
  console.log("scanAddresses:", scanAddresses.join(","));
  console.log("candidateCount:", candidates.length);
  printHuman(results);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
