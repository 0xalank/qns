const fs = require("fs");
const path = require("path");
require("dotenv").config();

const {
  Contract,
  JsonRpcProvider,
  Wallet,
  formatQuai,
  isAddress,
  keccak256,
  solidityPacked,
} = require("quais");

const DEFAULT_RPC_URL = "https://rpc.quai.network/cyprus1";
const REGISTER_GAS_LIMIT = BigInt(process.env.GAS_LIMIT_QNNS_REGISTER || "450000");
const ADMIN_ASSIGN_GAS_LIMIT = BigInt(process.env.GAS_LIMIT_QNNS_ADMIN_ASSIGN || "350000");

const QNNS_ABI = [
  "function isActive(bytes32 nameHash) view returns (bool)",
  "function isAvailable(string name) view returns (bool)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function getYearlyPriceQuaiByLength(uint256 len) view returns (uint256)",
  "function registrationFee7Plus() view returns (uint256)",
  "function minLockAmount() view returns (uint256)",
  "function register(string name, address quaiAddress, string qiPaymentCode) payable",
  "function adminAssign(bytes32 nameHash, string name, address to, address quaiAddress, string qiPaymentCode) payable",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
];

function qnnsDeploymentPath(chainId) {
  return path.join(__dirname, "..", "deployments", `qnns-mainnetCyprus1-${chainId.toString()}.json`);
}

function moduleDeploymentPath(chainId) {
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

function normalizeName(input) {
  let name = String(input || "").trim();
  if (name.toLowerCase().startsWith("qns://")) {
    name = name.slice(6).split(/[/?#]/)[0] || "";
  }
  if (name.endsWith(".qns")) name = name.slice(0, -4);
  if (name.endsWith(".quai")) name = name.slice(0, -5);
  name = name.toLowerCase();
  if (!/^[a-z0-9_-]{1,64}$/.test(name)) {
    throw new Error("Invalid QNNS name. Use 1-64 lowercase ASCII letters, numbers, hyphens, or underscores.");
  }
  if (name.length < 7) {
    throw new Error("This helper only supports instant registration for 7+ character names.");
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

async function main() {
  const rpcUrl = process.env.MAINNET_RPC_URL || DEFAULT_RPC_URL;
  const privateKey = process.env.MAINNET_CYPRUS1_PK || process.env.CYPRUS1_PK;
  if (!privateKey) throw new Error("Set MAINNET_CYPRUS1_PK or CYPRUS1_PK.");

  const provider = new JsonRpcProvider(rpcUrl, undefined, { usePathing: false });
  const network = await provider.getNetwork();
  if (network.chainId !== 9n) {
    throw new Error(`Refusing non-mainnet QNNS registration. Expected chainId 9, got ${network.chainId.toString()}.`);
  }

  const qnnsFile = qnnsDeploymentPath(network.chainId);
  const modulesFile = moduleDeploymentPath(network.chainId);
  const qnnsDeployment = readJsonIfExists(qnnsFile);
  const modulesDeployment = readJsonIfExists(modulesFile);
  const qnnsAddress = await configuredContractWithCode(
    provider,
    "QNNS",
    process.env.QNNS_CONTRACT,
    process.env.QNS_MAINNET_QNNS_ADDRESS,
    qnnsDeployment?.qnnsAddress,
    modulesDeployment?.qnnsAddress
  );
  if (!qnnsAddress) {
    throw new Error("Set QNNS_CONTRACT/QNS_MAINNET_QNNS_ADDRESS or run npm run deploy:qnns:mainnet first.");
  }

  const wallet = new Wallet(privateKey, provider);
  const qnns = new Contract(qnnsAddress, QNNS_ABI, wallet);
  const gasPriceWei = await resolveGasPrice(rpcUrl);
  const name = normalizeName(process.env.QNS_NAME || process.env.EXAMPLE_QNS_NAME || modulesDeployment?.exampleName || "moduleexample");
  const hash = nameHash(name);

  console.log("QNNS mainnet name registration");
  console.log("RPC:", rpcUrl);
  console.log("chainId:", network.chainId.toString());
  console.log("QNNS:", qnnsAddress);
  console.log("QNNS name:", await qnns.name());
  console.log("QNNS symbol:", await qnns.symbol());
  console.log("registrant:", wallet.address);
  console.log("registrantBalance:", formatQuai(await provider.getBalance(wallet.address)), "QUAI");
  console.log("name:", name);
  console.log("nameHash:", hash);

  const active = Boolean(await qnns.isActive(hash));
  if (active) {
    const owner = await qnns.ownerOf(BigInt(hash));
    console.log("active:", true);
    console.log("owner:", owner);
    if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
      throw new Error(`Name is active but owned by ${owner}, not signer ${wallet.address}.`);
    }
    console.log("Signer already owns active QNNS name.");
  } else {
    const available = Boolean(await qnns.isAvailable(name));
    console.log("active:", false);
    console.log("available:", available);
    if (!available) throw new Error("Name is not available for instant registration.");

    if (process.env.QNNS_ADMIN_ASSIGN === "true") {
      const adminAssignValue = BigInt(process.env.QNNS_ADMIN_ASSIGN_LOCK_WEI || "0");
      const maxGasCost = ADMIN_ASSIGN_GAS_LIMIT * gasPriceWei;
      const balance = await provider.getBalance(wallet.address);
      console.log("adminAssign:", true);
      console.log("adminAssignValue:", formatQuai(adminAssignValue), "QUAI");
      console.log("adminAssignGasLimit:", ADMIN_ASSIGN_GAS_LIMIT.toString());
      console.log("adminAssignMaxGasCost:", formatQuai(maxGasCost), "QUAI");
      if (balance < adminAssignValue + maxGasCost) {
        throw new Error(`Insufficient balance. Need about ${formatQuai(adminAssignValue + maxGasCost)} QUAI; have ${formatQuai(balance)} QUAI.`);
      }

      const tx = await qnns.adminAssign(
        hash,
        name,
        wallet.address,
        wallet.address,
        process.env.QI_PAYMENT_CODE || "",
        { value: adminAssignValue, gasLimit: ADMIN_ASSIGN_GAS_LIMIT, gasPrice: gasPriceWei }
      );
      console.log("adminAssign tx:", tx.hash);
      await tx.wait();
    } else {
      console.log("adminAssign:", false);
      console.log("Set QNNS_ADMIN_ASSIGN=true to admin-assign a launch name instead of paying normal registration fees.");
      console.log("Or continue with paid registration using the fee estimate below.");

    const [registrationFee, minLockAmount, yearlyFee] = await Promise.all([
      qnns.registrationFee7Plus(),
      qnns.minLockAmount(),
      qnns.getYearlyPriceQuaiByLength(name.length),
    ]);
    const value = BigInt(registrationFee) + BigInt(minLockAmount) + BigInt(yearlyFee);
    const maxGasCost = REGISTER_GAS_LIMIT * gasPriceWei;
    const balance = await provider.getBalance(wallet.address);
    console.log("registrationFee:", formatQuai(registrationFee), "QUAI");
    console.log("minLockAmount:", formatQuai(minLockAmount), "QUAI");
    console.log("yearlyFee:", formatQuai(yearlyFee), "QUAI");
    console.log("registerValue:", formatQuai(value), "QUAI");
    console.log("registerGasLimit:", REGISTER_GAS_LIMIT.toString());
    console.log("registerMaxGasCost:", formatQuai(maxGasCost), "QUAI");
    if (balance < value + maxGasCost) {
      throw new Error(`Insufficient balance. Need about ${formatQuai(value + maxGasCost)} QUAI; have ${formatQuai(balance)} QUAI.`);
    }

    const tx = await qnns.register(
      name,
      wallet.address,
      process.env.QI_PAYMENT_CODE || "",
      { value, gasLimit: REGISTER_GAS_LIMIT, gasPrice: gasPriceWei }
    );
    console.log("register tx:", tx.hash);
    await tx.wait();
    }
  }

  const owner = await qnns.ownerOf(BigInt(hash));
  const output = {
    ...(qnnsDeployment || {}),
    network: "mainnetCyprus1",
    chainId: network.chainId.toString(),
    qnnsAddress,
    registeredNames: {
      ...(qnnsDeployment?.registeredNames || {}),
      [name]: {
        nameHash: hash,
        owner,
        active: Boolean(await qnns.isActive(hash)),
      },
    },
  };
  writeJson(qnnsFile, output);

  if (modulesDeployment) {
    modulesDeployment.exampleName = name;
    modulesDeployment.nameHash = hash;
    modulesDeployment.qnnsAddress = qnnsAddress;
    modulesDeployment.pelagusResolverConfig = {
      ...(modulesDeployment.pelagusResolverConfig || {}),
      qnnsAddress,
    };
    writeJson(modulesFile, modulesDeployment);
  }

  console.log("owner:", owner);
  console.log("Updated deployment:", qnnsFile);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
