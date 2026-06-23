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
  parseQuai,
} = require("quais");

const DEFAULT_RPC_URL = "https://rpc.quai.network/cyprus1";
const FACTORY_IPFS_HASH = "Qm11111111111111111111111111111111111111111111";
const QNNS_DEPLOY_GAS_LIMIT = BigInt(process.env.GAS_LIMIT_QNNS || "6500000");

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

function artifact(name) {
  const file = path.join(__dirname, "..", "artifacts", "contracts", `${name}.sol`, `${name}.json`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
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

async function codeExists(provider, address) {
  if (!address || !isAddress(address)) return false;
  const code = await provider.getCode(address);
  return Boolean(code && code !== "0x");
}

function parseQuaiEnv(name, fallback) {
  return parseQuai(process.env[name] || fallback);
}

async function main() {
  const rpcUrl = process.env.MAINNET_RPC_URL || DEFAULT_RPC_URL;
  const privateKey = process.env.MAINNET_CYPRUS1_PK || process.env.CYPRUS1_PK;
  if (!privateKey) throw new Error("Set MAINNET_CYPRUS1_PK or CYPRUS1_PK.");

  const provider = new JsonRpcProvider(rpcUrl, undefined, { usePathing: false });
  const network = await provider.getNetwork();
  if (network.chainId !== 9n) {
    throw new Error(`Refusing non-mainnet QNNS deploy. Expected chainId 9, got ${network.chainId.toString()}.`);
  }

  const wallet = new Wallet(privateKey, provider);
  const gasPriceWei = await resolveGasPrice(rpcUrl);
  const qnnsFile = qnnsDeploymentPath(network.chainId);
  const existingDeployment = readJsonIfExists(qnnsFile);
  const existingCandidates = [
    process.env.QNNS_CONTRACT,
    process.env.QNS_MAINNET_QNNS_ADDRESS,
    existingDeployment?.qnnsAddress,
  ].filter(Boolean);

  console.log("QNNS mainnet deployment");
  console.log("RPC:", rpcUrl);
  console.log("chainId:", network.chainId.toString());
  console.log("deployer:", wallet.address);
  console.log("deployerBalance:", formatQuai(await provider.getBalance(wallet.address)), "QUAI");
  console.log("gasPriceWei:", gasPriceWei.toString());

  if (process.env.FORCE_REDEPLOY !== "true") {
    for (const existingAddress of existingCandidates) {
      if (!isAddress(existingAddress)) throw new Error(`Invalid QNNS address: ${existingAddress}`);
      if (!(await codeExists(provider, existingAddress))) {
        console.log("Skipping QNNS candidate with no code:", existingAddress);
        continue;
      }

      console.log("Reusing QNNS:", existingAddress);
      const output = {
        ...(existingDeployment || {}),
        network: "mainnetCyprus1",
        chainId: network.chainId.toString(),
        qnnsAddress: existingAddress,
        deployer: wallet.address,
      };
      writeJson(qnnsFile, output);
      return;
    }
  }

  const params = {
    registrationFee7Plus: parseQuaiEnv("QNNS_REGISTRATION_FEE_7_PLUS_QUAI", "200"),
    auctionFloor4to6: parseQuaiEnv("QNNS_AUCTION_FLOOR_4_TO_6_QUAI", "1000"),
    auctionFloor1to3: parseQuaiEnv("QNNS_AUCTION_FLOOR_1_TO_3_QUAI", "5000"),
    minLockAmount: parseQuaiEnv("QNNS_MIN_LOCK_AMOUNT_QUAI", "100"),
    quaiPerQi: parseQuaiEnv("QNNS_QUAI_PER_QI", "13.925"),
    yearlyPriceQi5Plus: parseQuaiEnv("QNNS_YEARLY_PRICE_QI_5_PLUS", "4.33"),
    yearlyPriceQi4Char: parseQuaiEnv("QNNS_YEARLY_PRICE_QI_4_CHAR", "173"),
    yearlyPriceQi3OrLess: parseQuaiEnv("QNNS_YEARLY_PRICE_QI_3_OR_LESS", "865"),
  };

  const maxCost = QNNS_DEPLOY_GAS_LIMIT * gasPriceWei;
  const balance = await provider.getBalance(wallet.address);
  console.log("deployGasLimit:", QNNS_DEPLOY_GAS_LIMIT.toString());
  console.log("deployMaxCost:", formatQuai(maxCost), "QUAI");
  if (balance < maxCost) {
    throw new Error(`Insufficient balance to deploy QNNS. Need about ${formatQuai(maxCost)} QUAI; have ${formatQuai(balance)} QUAI.`);
  }

  const compiled = artifact("QNNS");
  const factory = new ContractFactory(compiled.abi, compiled.bytecode, wallet);
  factory.setIPFSHash(FACTORY_IPFS_HASH);
  const qnns = await factory.deploy(
    params.registrationFee7Plus,
    params.auctionFloor4to6,
    params.auctionFloor1to3,
    params.minLockAmount,
    params.quaiPerQi,
    params.yearlyPriceQi5Plus,
    params.yearlyPriceQi4Char,
    params.yearlyPriceQi3OrLess,
    { gasLimit: QNNS_DEPLOY_GAS_LIMIT, gasPrice: gasPriceWei }
  );
  const tx = qnns.deploymentTransaction();
  console.log("QNNS tx:", tx.hash);
  await qnns.waitForDeployment();
  const qnnsAddress = await qnns.getAddress();
  console.log("QNNS:", qnnsAddress);

  const output = {
    network: "mainnetCyprus1",
    chainId: network.chainId.toString(),
    deployer: wallet.address,
    qnnsAddress,
    qnnsTx: tx.hash,
    pricing: Object.fromEntries(
      Object.entries(params).map(([key, value]) => [key, value.toString()])
    ),
  };
  writeJson(qnnsFile, output);

  const modulesFile = moduleDeploymentPath(network.chainId);
  const modulesDeployment = readJsonIfExists(modulesFile);
  if (modulesDeployment) {
    modulesDeployment.qnnsAddress = qnnsAddress;
    modulesDeployment.pelagusResolverConfig = {
      ...(modulesDeployment.pelagusResolverConfig || {}),
      qnnsAddress,
    };
    writeJson(modulesFile, modulesDeployment);
  }

  const deployed = new Contract(qnnsAddress, compiled.abi, provider);
  console.log("QNNS name:", await deployed.name());
  console.log("QNNS symbol:", await deployed.symbol());
  console.log("Updated deployment:", qnnsFile);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
