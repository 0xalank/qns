const fs = require("fs");
const path = require("path");
require("dotenv").config();

const {
  ContractFactory,
  JsonRpcProvider,
  Wallet,
  ZeroHash,
  formatQuai,
  hexlify,
  isAddress,
  keccak256,
  solidityPacked,
  toBeHex,
  toUtf8Bytes,
} = require("quais");

const ANCHOR_VERSION = 1;
const ANCHOR_FLAGS = 0;
const FACTORY_IPFS_HASH = "Qm11111111111111111111111111111111111111111111";
const GAS_LIMITS = {
  QNSFixedStaticSiteModule: 1_500_000n,
  QNSFixedRedirectModule: 550_000n,
  QNSRedirectModule: 1_100_000n,
  QNSStaticContentStore: 700_000n,
  QNSStaticSiteModule: 2_200_000n,
  createContent: 900_000n,
};

let gasPriceWei;

const IDS = {
  topologyRedirect: keccak256(toUtf8Bytes("qns.topology.redirect.v1")),
  topologyStaticSite: keccak256(toUtf8Bytes("qns.topology.static-site.v1")),
  rendererRedirect: keccak256(toUtf8Bytes("qns.renderer.redirect.v1")),
  rendererStaticSafe: keccak256(toUtf8Bytes("qns.renderer.static-safe.v1")),
  mimeTextMarkdown: keccak256(toUtf8Bytes("text/markdown")),
  mimeTextHtml: keccak256(toUtf8Bytes("text/html")),
  mimeTextCss: keccak256(toUtf8Bytes("text/css")),
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
  return solidityPacked(["string"], [name]);
}

function nameHash(name) {
  return keccak256(hashName(name));
}

function encodeAnchor(chainId, moduleAddress, topology, manifestHash) {
  return solidityPacked(
    ["uint16", "uint16", "uint64", "address", "bytes32", "bytes32"],
    [ANCHOR_VERSION, ANCHOR_FLAGS, chainId, moduleAddress, topology, manifestHash]
  );
}

function chunkHexBytes(bytes, chunkSize = 4096) {
  const chunks = [];
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    chunks.push(hexlify(bytes.slice(offset, offset + chunkSize)));
  }
  return chunks;
}

function artifact(name) {
  const file = path.join(__dirname, "..", "artifacts", "contracts", "modules", `${name}.sol`, `${name}.json`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function deploymentPathForChainId(chainId) {
  return path.join(__dirname, "..", "deployments", `qns-modules-mainnetCyprus1-${chainId.toString()}.json`);
}

function readExistingDeployment(chainId) {
  const deploymentPath = deploymentPathForChainId(chainId);
  if (!fs.existsSync(deploymentPath)) return null;
  return JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
}

function txOverrides(label) {
  const envKey = `GAS_LIMIT_${label}`;
  const gasLimit = process.env[envKey] || process.env.GAS_LIMIT;
  const overrides = {
    gasLimit: gasLimit ? BigInt(gasLimit) : GAS_LIMITS[label],
  };
  if (gasPriceWei) overrides.gasPrice = gasPriceWei;
  return overrides;
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

function plannedGasLimit() {
  const selected = (process.env.EXAMPLE_MODULE || "fixed-static").toLowerCase();
  if (selected === "fixed-static") {
    return GAS_LIMITS.QNSFixedStaticSiteModule;
  }

  if (selected === "fixed-redirect") {
    return GAS_LIMITS.QNSFixedRedirectModule;
  }

  if (selected === "redirect") {
    return GAS_LIMITS.QNSRedirectModule;
  }

  if (selected === "static" || selected === "static-store") {
    return GAS_LIMITS.QNSStaticContentStore + GAS_LIMITS.createContent + GAS_LIMITS.QNSStaticSiteModule;
  }

  if (selected === "html" || selected === "html-css") {
    return GAS_LIMITS.QNSStaticContentStore + (GAS_LIMITS.createContent * 2n) + GAS_LIMITS.QNSStaticSiteModule;
  }

  throw new Error(`Unsupported EXAMPLE_MODULE: ${selected}`);
}

function requireSufficientBalance(balance) {
  const plannedMaxCost = plannedGasLimit() * gasPriceWei;
  console.log("Gas price wei:", gasPriceWei.toString());
  console.log("Planned max gas:", plannedGasLimit().toString());
  console.log("Planned max cost:", formatQuai(plannedMaxCost), "QUAI");
  if (balance < plannedMaxCost) {
    throw new Error(
      `Insufficient deployer balance for modules-only deployment. Need about ${formatQuai(plannedMaxCost)} QUAI at current gas limits and gas price; have ${formatQuai(balance)} QUAI.`
    );
  }
}

async function deployContract(wallet, name, envAddress, args = []) {
  const compiled = artifact(name);
  if (envAddress) {
    const { Contract } = require("quais");
    return new Contract(envAddress, compiled.abi, wallet);
  }

  const factory = new ContractFactory(compiled.abi, compiled.bytecode, wallet);
  factory.setIPFSHash(FACTORY_IPFS_HASH);
  const contract = await factory.deploy(...args, txOverrides(name));
  const tx = contract.deploymentTransaction();
  console.log(`${name} tx:`, tx.hash);
  await contract.waitForDeployment();
  console.log(`${name}:`, await contract.getAddress());
  return contract;
}

function buildHtmlCssExample(exampleName, chainId) {
  const html = [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '  <meta charset="utf-8" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
    "  <title>QNS HTML/CSS Demo</title>",
    '  <link rel="stylesheet" href="/style.css" />',
    "</head>",
    "<body>",
    '  <main class="shell">',
    '    <section class="hero">',
    '      <p class="eyebrow">QNS Static Site Module</p>',
    "      <h1>HTML and CSS loaded from Quai contract state.</h1>",
    "      <p>The page bytes, stylesheet bytes, manifest, and file hashes are read from chain before rendering.</p>",
    '      <div class="actions">',
    '        <span class="pill">No gateway required</span>',
    '        <span class="pill">No JavaScript</span>',
    "      </div>",
    "    </section>",
    '    <section class="grid">',
    '      <article>',
    "        <h2>Module</h2>",
    "        <p>This static module declares <code>/index.html</code> and <code>/style.css</code> in its manifest.</p>",
    "      </article>",
    '      <article>',
    "        <h2>Verification</h2>",
    "        <p>The loader rebuilds each file from content chunks and checks the keccak256 hash.</p>",
    "      </article>",
    '      <article>',
    "        <h2>Network</h2>",
    `        <p>Name seed: <code>${exampleName}</code><br />Chain ID: <code>${chainId.toString()}</code></p>`,
    "      </article>",
    "    </section>",
    "  </main>",
    "</body>",
    "</html>",
    "",
  ].join("\n");

  const css = [
    ":root {",
    "  color-scheme: dark;",
    "  --bg: #101114;",
    "  --panel: #191b20;",
    "  --text: #f2f1ec;",
    "  --muted: #b7b2a8;",
    "  --line: #38342c;",
    "  --gold: #d8b95f;",
    "  --green: #6fc39b;",
    "  --blue: #7da7e6;",
    "}",
    "",
    "* { box-sizing: border-box; }",
    "body { margin: 0; background: var(--bg); color: var(--text); font-family: Inter, ui-sans-serif, system-ui, sans-serif; }",
    ".shell { width: min(960px, calc(100% - 32px)); margin: 0 auto; padding: 48px 0; }",
    ".hero, article { border: 1px solid var(--line); background: var(--panel); border-radius: 8px; }",
    ".hero { padding: clamp(28px, 6vw, 56px); }",
    ".eyebrow { margin: 0 0 16px; color: var(--gold); font-size: 13px; font-weight: 700; text-transform: uppercase; }",
    "h1 { max-width: 780px; margin: 0; font-size: clamp(36px, 7vw, 72px); line-height: 1; }",
    ".hero > p:not(.eyebrow) { max-width: 640px; margin: 22px 0 0; color: var(--muted); font-size: 18px; line-height: 1.6; }",
    ".actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 26px; }",
    ".pill { border: 1px solid var(--line); border-radius: 999px; padding: 8px 12px; color: var(--green); background: #121b17; font-size: 13px; font-weight: 700; }",
    ".grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; margin-top: 14px; }",
    "article { min-height: 150px; padding: 20px; background: #15171b; }",
    "h2 { margin: 0 0 10px; font-size: 18px; }",
    "article p { margin: 0; color: var(--muted); line-height: 1.6; }",
    "code { color: var(--blue); font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }",
    "@media (max-width: 760px) { .shell { padding: 24px 0; } .grid { grid-template-columns: 1fr; } .hero { padding: 28px; } }",
    "",
  ].join("\n");

  return { html, css };
}

async function main() {
  const rpcUrl = process.env.MAINNET_RPC_URL || "https://rpc.quai.network/cyprus1";
  const privateKey = process.env.MAINNET_CYPRUS1_PK || process.env.CYPRUS1_PK;
  if (!privateKey) throw new Error("Set MAINNET_CYPRUS1_PK or CYPRUS1_PK.");

  const provider = new JsonRpcProvider(rpcUrl, undefined, { usePathing: false });
  const wallet = new Wallet(privateKey, provider);
  const network = await provider.getNetwork();
  const chainId = network.chainId;
  gasPriceWei = await resolveGasPrice(rpcUrl);
  const exampleName = normalizeQnsName(process.env.EXAMPLE_QNS_NAME || "moduleexample");
  const exampleNameHash = nameHash(exampleName);
  const deployerBalance = await provider.getBalance(wallet.address);

  console.log("Deploying QNS example modules with quais");
  console.log("RPC:", rpcUrl);
  console.log("chainId:", chainId.toString());
  console.log("Deployer:", wallet.address);
  console.log("Deployer balance:", formatQuai(deployerBalance), "QUAI");
  console.log("Example name:", exampleName);
  console.log("Example nameHash:", exampleNameHash);

  const selectedExampleModule = (process.env.EXAMPLE_MODULE || "fixed-static").toLowerCase();
  const existingDeployment = readExistingDeployment(chainId);
  let fixedStaticAddress = process.env.QNS_FIXED_STATIC_SITE_MODULE_CONTRACT;
  let fixedRedirectAddress = process.env.QNS_FIXED_REDIRECT_MODULE_CONTRACT;

  if (
    selectedExampleModule === "fixed-static" &&
    !fixedStaticAddress &&
    process.env.FORCE_REDEPLOY !== "true" &&
    existingDeployment?.fixedStaticSiteModuleAddress &&
    isAddress(existingDeployment.fixedStaticSiteModuleAddress)
  ) {
    fixedStaticAddress = existingDeployment.fixedStaticSiteModuleAddress;
    console.log("Reusing existing fixed static site module:", fixedStaticAddress);
    console.log("Set FORCE_REDEPLOY=true to deploy a new module contract.");
  }

  if (
    selectedExampleModule === "fixed-redirect" &&
    !fixedRedirectAddress &&
    process.env.FORCE_REDEPLOY !== "true" &&
    existingDeployment?.fixedRedirectModuleAddress &&
    isAddress(existingDeployment.fixedRedirectModuleAddress)
  ) {
    fixedRedirectAddress = existingDeployment.fixedRedirectModuleAddress;
    console.log("Reusing existing fixed redirect module:", fixedRedirectAddress);
    console.log("Set FORCE_REDEPLOY=true to deploy a new module contract.");
  }

  const willDeployFixedStatic = selectedExampleModule === "fixed-static" && !fixedStaticAddress;
  const willDeployFixedRedirect = selectedExampleModule === "fixed-redirect" && !fixedRedirectAddress;
  const reusingSelectedModule =
    (selectedExampleModule === "fixed-static" && fixedStaticAddress) ||
    (selectedExampleModule === "fixed-redirect" && fixedRedirectAddress);
  if (!reusingSelectedModule) {
    requireSufficientBalance(deployerBalance);
  } else {
    console.log("Gas price wei:", gasPriceWei.toString());
    console.log("Planned writes: none");
  }

  if (selectedExampleModule === "fixed-static") {
    const markdown = [
      "# QNS Mainnet Static Demo",
      "",
      "This page is stored in Quai contract state and rendered from bytes fetched by the QNS Module Loader.",
      "",
      `Name: ${exampleName}`,
      `Network chainId: ${chainId.toString()}`,
      "",
      "The manifest is read from the module contract, the content store is the module contract itself, and the rendered markdown bytes are hash-checked before display.",
      "",
    ].join("\n");
    const markdownBytes = toUtf8Bytes(markdown);
    const fixedStaticModule = await deployContract(
      wallet,
      "QNSFixedStaticSiteModule",
      fixedStaticAddress,
      [hexlify(markdownBytes)]
    );
    const fixedStaticDeploymentTx = fixedStaticModule.deploymentTransaction?.();
    const selectedModuleAddress = await fixedStaticModule.getAddress();
    const selectedManifestHash = await fixedStaticModule.moduleManifestHash();
    const staticContentHash = keccak256(markdownBytes);
    const anchor = encodeAnchor(chainId, selectedModuleAddress, IDS.topologyStaticSite, selectedManifestHash);

    const output = {
      network: "mainnetCyprus1",
      chainId: chainId.toString(),
      deployer: wallet.address,
      exampleName,
      nameHash: exampleNameHash,
      qnnsAddress: null,
      qnsNameResolverAddress: null,
      qnsAnchorRegistryAddress: null,
      fixedStaticSiteModuleAddress: selectedModuleAddress,
      fixedStaticSiteModuleTx: fixedStaticDeploymentTx?.hash || existingDeployment?.fixedStaticSiteModuleTx || null,
      selectedModule: "fixed-static",
      selectedModuleAddress,
      selectedManifestHash,
      staticContentHash,
      staticContentBytes: markdownBytes.length,
      anchor,
      anchorSet: false,
      modulesOnly: true,
      ids: IDS,
      pelagusResolverConfig: {
        chainId: toBeHex(chainId),
        qnnsAddress: null,
        qnsNameResolverAddress: null,
        qnsAnchorRegistryAddress: null,
        qnsGatewayBaseUrl: process.env.QNS_GATEWAY_BASE_URL || "https://qns.app",
        supportedTopologies: [IDS.topologyStaticSite, IDS.topologyRedirect],
        supportedRenderers: [IDS.rendererStaticSafe, IDS.rendererRedirect],
      },
    };

    const deploymentsDir = path.join(__dirname, "..", "deployments");
    fs.mkdirSync(deploymentsDir, { recursive: true });
    const outputPath = deploymentPathForChainId(chainId);
    fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
    console.log("Wrote deployment summary:", outputPath);
    return;
  }

  if (selectedExampleModule === "fixed-redirect") {
    const fixedRedirectModule = await deployContract(
      wallet,
      "QNSFixedRedirectModule",
      fixedRedirectAddress
    );
    const selectedModuleAddress = await fixedRedirectModule.getAddress();
    const selectedManifestHash = await fixedRedirectModule.moduleManifestHash();
    const anchor = encodeAnchor(chainId, selectedModuleAddress, IDS.topologyRedirect, selectedManifestHash);

    const output = {
      network: "mainnetCyprus1",
      chainId: chainId.toString(),
      deployer: wallet.address,
      exampleName,
      nameHash: exampleNameHash,
      qnnsAddress: null,
      qnsNameResolverAddress: null,
      qnsAnchorRegistryAddress: null,
      fixedRedirectModuleAddress: selectedModuleAddress,
      selectedModule: "fixed-redirect",
      selectedModuleAddress,
      selectedManifestHash,
      anchor,
      anchorSet: false,
      modulesOnly: true,
      ids: IDS,
      pelagusResolverConfig: {
        chainId: toBeHex(chainId),
        qnnsAddress: null,
        qnsNameResolverAddress: null,
        qnsAnchorRegistryAddress: null,
        qnsGatewayBaseUrl: process.env.QNS_GATEWAY_BASE_URL || "https://qns.app",
        supportedTopologies: [IDS.topologyRedirect, IDS.topologyStaticSite],
        supportedRenderers: [IDS.rendererRedirect, IDS.rendererStaticSafe],
      },
    };

    const deploymentsDir = path.join(__dirname, "..", "deployments");
    fs.mkdirSync(deploymentsDir, { recursive: true });
    const outputPath = deploymentPathForChainId(chainId);
    fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
    console.log("Wrote deployment summary:", outputPath);
    return;
  }

  const selected = (process.env.EXAMPLE_MODULE || "static").toLowerCase();
  let redirectModuleAddress = null;
  let staticContentStoreAddress = null;
  let staticSiteModuleAddress = null;
  let staticFilesOutput = [];
  let selectedModule = null;
  let selectedTopology = null;

  if (selected === "redirect") {
    const redirectTarget = process.env.REDIRECT_TARGET_URL || "https://qu.ai";
    selectedModule = await deployContract(wallet, "QNSRedirectModule", process.env.QNS_REDIRECT_MODULE_CONTRACT, [
      "QNS Redirect Example",
      redirectTarget,
      ZeroHash,
      1,
      false,
    ]);
    redirectModuleAddress = await selectedModule.getAddress();
    selectedTopology = IDS.topologyRedirect;
  } else {
    const contentStore = await deployContract(
      wallet,
      "QNSStaticContentStore",
      process.env.QNS_STATIC_CONTENT_STORE_CONTRACT
    );
    staticContentStoreAddress = await contentStore.getAddress();

    const staticFiles = [];
    let title = "QNS Static Module Example";
    let entryPath = "/index.md";
    let htmlPolicy = 1;

    async function createStaticFile(filePath, mimeType, text, reuseEnvPrefix) {
      const bytes = toUtf8Bytes(text);
      const chunks = chunkHexBytes(bytes);
      const contentHash = keccak256(bytes);
      const reuseContentId = reuseEnvPrefix ? process.env[`REUSE_${reuseEnvPrefix}_CONTENT_ID`] : "";

      if (reuseContentId) {
        const contentId = BigInt(reuseContentId);
        console.log(`Reusing static content ${filePath} contentId:`, contentId.toString());
        console.log(`Static content ${filePath} contentHash:`, contentHash);
        staticFiles.push([
          filePath,
          mimeType,
          bytes.length,
          contentHash,
          contentId,
          chunks.length,
        ]);
        staticFilesOutput.push({
          path: filePath,
          mimeType,
          byteLength: bytes.length,
          contentHash,
          contentId: contentId.toString(),
          chunkCount: chunks.length,
          reused: true,
        });
        return;
      }

      const contentId = await contentStore.nextContentId();
      const createContentTx = await contentStore.createContent(
        contentHash,
        bytes.length,
        chunks,
        txOverrides("createContent")
      );
      console.log(`createContent ${filePath} tx:`, createContentTx.hash);
      await createContentTx.wait();
      console.log(`Static content ${filePath} contentId:`, contentId.toString());
      console.log(`Static content ${filePath} contentHash:`, contentHash);

      staticFiles.push([
        filePath,
        mimeType,
        bytes.length,
        contentHash,
        contentId,
        chunks.length,
      ]);
      staticFilesOutput.push({
        path: filePath,
        mimeType,
        byteLength: bytes.length,
        contentHash,
        contentId: contentId.toString(),
        chunkCount: chunks.length,
      });
    }

    if (selected === "html" || selected === "html-css") {
      const { html, css } = buildHtmlCssExample(exampleName, chainId);
      title = "QNS HTML/CSS Demo";
      entryPath = "/index.html";
      htmlPolicy = 2;
      await createStaticFile("/index.html", IDS.mimeTextHtml, html, "HTML");
      await createStaticFile("/style.css", IDS.mimeTextCss, css, "CSS");
    } else {
      const markdown = [
        "# QNS Static Module Example",
        "",
        "This page is stored in Quai contract state and rendered through the QNS Module Loader.",
        "",
        `Name: ${exampleName}`,
        `Network chainId: ${chainId.toString()}`,
        "",
      ].join("\n");
      await createStaticFile("/index.md", IDS.mimeTextMarkdown, markdown, "MARKDOWN");
    }

    selectedModule = await deployContract(wallet, "QNSStaticSiteModule", process.env.QNS_STATIC_SITE_MODULE_CONTRACT, [
      title,
      staticContentStoreAddress,
      entryPath,
      htmlPolicy,
      staticFiles,
    ]);
    staticSiteModuleAddress = await selectedModule.getAddress();
    selectedTopology = IDS.topologyStaticSite;
  }

  const selectedModuleAddress = await selectedModule.getAddress();
  const selectedManifestHash = await selectedModule.moduleManifestHash();
  const anchor = encodeAnchor(chainId, selectedModuleAddress, selectedTopology, selectedManifestHash);

  const output = {
    network: "mainnetCyprus1",
    chainId: chainId.toString(),
    deployer: wallet.address,
    exampleName,
    nameHash: exampleNameHash,
    qnnsAddress: null,
    qnsNameResolverAddress: null,
    qnsAnchorRegistryAddress: null,
    redirectModuleAddress,
    staticContentStoreAddress,
    staticSiteModuleAddress,
    staticFiles: staticFilesOutput,
    selectedModule: selected,
    selectedModuleAddress,
    selectedManifestHash,
    anchor,
    anchorSet: false,
    modulesOnly: true,
    ids: IDS,
    pelagusResolverConfig: {
      chainId: toBeHex(chainId),
      qnnsAddress: null,
      qnsNameResolverAddress: null,
      qnsAnchorRegistryAddress: null,
      qnsGatewayBaseUrl: process.env.QNS_GATEWAY_BASE_URL || "https://qns.app",
      supportedTopologies: [IDS.topologyRedirect, IDS.topologyStaticSite],
      supportedRenderers: [IDS.rendererRedirect, IDS.rendererStaticSafe],
    },
  };

  const deploymentsDir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(deploymentsDir, { recursive: true });
  const outputPath = deploymentPathForChainId(chainId);
  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log("Wrote deployment summary:", outputPath);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
