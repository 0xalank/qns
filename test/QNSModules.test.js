const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("QNS modules", function () {
  const exampleName = "moduleexample";

  function hashName(name) {
    return ethers.solidityPackedKeccak256(["string"], [name]);
  }

  function encodeAnchor(chainId, moduleAddress, topology, manifestHash) {
    return ethers.solidityPacked(
      ["uint16", "uint16", "uint64", "address", "bytes32", "bytes32"],
      [1, 0, chainId, moduleAddress, topology, manifestHash]
    );
  }

  async function deployQNNS() {
    const QNNS = await ethers.getContractFactory("QNNS");
    return QNNS.deploy(
      ethers.parseEther("200"),
      ethers.parseEther("1000"),
      ethers.parseEther("5000"),
      ethers.parseEther("100"),
      ethers.parseEther("1"),
      ethers.parseEther("10"),
      ethers.parseEther("200"),
      ethers.parseEther("1000")
    );
  }

  async function deployCurrentResolver(qnns) {
    const Resolver = await ethers.getContractFactory("QNSCurrentOwnerResolver");
    const resolver = await Resolver.deploy(await qnns.getAddress());
    await resolver.waitForDeployment();
    return resolver;
  }

  async function deployStaticModule() {
    const Store = await ethers.getContractFactory("QNSStaticContentStore");
    const store = await Store.deploy();
    await store.waitForDeployment();

    const markdown = ethers.toUtf8Bytes("# QNS Module\n\nStored on chain.\n");
    const contentHash = ethers.keccak256(markdown);
    await store.createContent(contentHash, markdown.length, [ethers.hexlify(markdown)]);

    const mimeTextMarkdown = ethers.keccak256(ethers.toUtf8Bytes("text/markdown"));
    const files = [["/index.md", mimeTextMarkdown, markdown.length, contentHash, 1, 1]];

    const StaticModule = await ethers.getContractFactory("QNSStaticSiteModule");
    const staticModule = await StaticModule.deploy(
      "QNS Static Module Test",
      await store.getAddress(),
      "/index.md",
      1,
      files
    );
    await staticModule.waitForDeployment();
    return staticModule;
  }

  it("sets and resolves a static site module anchor", async function () {
    const [owner] = await ethers.getSigners();
    const network = await ethers.provider.getNetwork();
    const qnns = await deployQNNS();
    await qnns.waitForDeployment();

    await qnns.register(exampleName, owner.address, "", { value: ethers.parseEther("310") });
    const nameHash = hashName(exampleName);

    const resolver = await deployCurrentResolver(qnns);
    const Registry = await ethers.getContractFactory("QNSAnchorRegistry");
    const registry = await Registry.deploy(await resolver.getAddress());
    await registry.waitForDeployment();
    expect(await registry.nameResolver()).to.equal(await resolver.getAddress());

    const Store = await ethers.getContractFactory("QNSStaticContentStore");
    const store = await Store.deploy();
    await store.waitForDeployment();

    const markdown = ethers.toUtf8Bytes("# QNS Module\n\nStored on chain.\n");
    const contentHash = ethers.keccak256(markdown);
    await store.createContent(contentHash, markdown.length, [ethers.hexlify(markdown)]);
    expect(await store.getContentChunk(1, 0)).to.equal(ethers.hexlify(markdown));

    const mimeTextMarkdown = ethers.keccak256(ethers.toUtf8Bytes("text/markdown"));
    const files = [["/index.md", mimeTextMarkdown, markdown.length, contentHash, 1, 1]];

    const StaticModule = await ethers.getContractFactory("QNSStaticSiteModule");
    const staticModule = await StaticModule.deploy(
      "QNS Static Module Test",
      await store.getAddress(),
      "/index.md",
      1,
      files
    );
    await staticModule.waitForDeployment();

    const topology = ethers.keccak256(ethers.toUtf8Bytes("qns.topology.static-site.v1"));
    const manifestHash = await staticModule.moduleManifestHash();
    const anchor = encodeAnchor(network.chainId, await staticModule.getAddress(), topology, manifestHash);

    await registry.setAnchor(nameHash, anchor);
    expect(await registry.anchorOf(nameHash)).to.equal(anchor);

    const decoded = await registry.decodeAnchor(anchor);
    expect(decoded.moduleAddress).to.equal(await staticModule.getAddress());
    expect(decoded.topology).to.equal(topology);
    expect(decoded.manifestHash).to.equal(manifestHash);
  });

  it("supports demo name anchoring through a static name resolver", async function () {
    const [owner, other] = await ethers.getSigners();
    const network = await ethers.provider.getNetwork();
    const nameHash = hashName(exampleName);

    const Resolver = await ethers.getContractFactory("QNSStaticNameResolver");
    const resolver = await Resolver.deploy(owner.address);
    await resolver.waitForDeployment();

    await expect(
      resolver.connect(other).setNameRecord(nameHash, owner.address, true)
    ).to.be.revertedWithCustomError(resolver, "NotAdmin");

    await resolver.setNameRecord(nameHash, owner.address, true);
    const record = await resolver.ownerOfName(nameHash);
    expect(record[0]).to.equal(owner.address);
    expect(record[1]).to.equal(true);

    const Registry = await ethers.getContractFactory("QNSAnchorRegistry");
    const registry = await Registry.deploy(await resolver.getAddress());
    await registry.waitForDeployment();

    const staticModule = await deployStaticModule();
    const topology = ethers.keccak256(ethers.toUtf8Bytes("qns.topology.static-site.v1"));
    const manifestHash = await staticModule.moduleManifestHash();
    const anchor = encodeAnchor(network.chainId, await staticModule.getAddress(), topology, manifestHash);

    await registry.setAnchor(nameHash, anchor);
    expect(await registry.anchorOf(nameHash)).to.equal(anchor);
  });

  it("exposes a self-contained fixed static-site module for contract-state demos", async function () {
    const markdown = ethers.toUtf8Bytes("# QNS Static\n\nStored in contract state.\n");
    const FixedStaticModule = await ethers.getContractFactory("QNSFixedStaticSiteModule");
    const fixedStaticModule = await FixedStaticModule.deploy(markdown);
    await fixedStaticModule.waitForDeployment();

    const topology = ethers.keccak256(ethers.toUtf8Bytes("qns.topology.static-site.v1"));
    const renderer = ethers.keccak256(ethers.toUtf8Bytes("qns.renderer.static-safe.v1"));
    const mimeTextMarkdown = ethers.keccak256(ethers.toUtf8Bytes("text/markdown"));
    const manifest = await fixedStaticModule.moduleManifest();
    const manifestHash = await fixedStaticModule.moduleManifestHash();
    const contentHash = ethers.keccak256(markdown);

    expect(await fixedStaticModule.moduleVersion()).to.equal(1);
    expect(await fixedStaticModule.moduleTopology()).to.equal(topology);
    expect(manifestHash).to.equal(ethers.keccak256(manifest));
    expect(await fixedStaticModule.getContentChunk(1, 0)).to.equal(ethers.hexlify(markdown));

    const decoded = ethers.AbiCoder.defaultAbiCoder().decode([
      "tuple(uint16,bytes32,bytes32,bytes32,string,string,tuple(uint32,bytes32[]),tuple(uint32,uint32,uint32,uint32,uint32),bytes)",
    ], manifest)[0];
    expect(decoded[0]).to.equal(1);
    expect(decoded[1]).to.equal(topology);
    expect(decoded[2]).to.equal(renderer);
    expect(decoded[4]).to.equal("QNS Mainnet Static Demo");
    expect(decoded[5]).to.equal("/index.md");

    const staticSite = ethers.AbiCoder.defaultAbiCoder().decode([
      "tuple(address,string,bytes32,uint8,tuple(string,bytes32,uint32,bytes32,uint256,uint16)[])",
    ], decoded[8])[0];
    expect(staticSite[0]).to.equal(await fixedStaticModule.getAddress());
    expect(staticSite[1]).to.equal("/index.md");
    expect(staticSite[4][0][0]).to.equal("/index.md");
    expect(staticSite[4][0][1]).to.equal(mimeTextMarkdown);
    expect(staticSite[4][0][2]).to.equal(markdown.length);
    expect(staticSite[4][0][3]).to.equal(contentHash);
    expect(staticSite[4][0][4]).to.equal(1);
    expect(staticSite[4][0][5]).to.equal(1);
  });

  it("supports static HTML and CSS files in the generic static-site module", async function () {
    const Store = await ethers.getContractFactory("QNSStaticContentStore");
    const store = await Store.deploy();
    await store.waitForDeployment();

    const html = ethers.toUtf8Bytes("<!doctype html><html><head><link rel=\"stylesheet\" href=\"/style.css\"></head><body><h1>QNS HTML</h1></body></html>");
    const css = ethers.toUtf8Bytes("body{background:#101114;color:#f2f1ec}h1{color:#d8b95f}");
    const htmlHash = ethers.keccak256(html);
    const cssHash = ethers.keccak256(css);

    await store.createContent(htmlHash, html.length, [ethers.hexlify(html)]);
    await store.createContent(cssHash, css.length, [ethers.hexlify(css)]);

    const mimeTextHtml = ethers.keccak256(ethers.toUtf8Bytes("text/html"));
    const mimeTextCss = ethers.keccak256(ethers.toUtf8Bytes("text/css"));
    const files = [
      ["/index.html", mimeTextHtml, html.length, htmlHash, 1, 1],
      ["/style.css", mimeTextCss, css.length, cssHash, 2, 1],
    ];

    const StaticModule = await ethers.getContractFactory("QNSStaticSiteModule");
    const staticModule = await StaticModule.deploy(
      "QNS HTML/CSS Module Test",
      await store.getAddress(),
      "/index.html",
      2,
      files
    );
    await staticModule.waitForDeployment();

    const topology = ethers.keccak256(ethers.toUtf8Bytes("qns.topology.static-site.v1"));
    const renderer = ethers.keccak256(ethers.toUtf8Bytes("qns.renderer.static-safe.v1"));
    const manifest = await staticModule.moduleManifest();
    const manifestHash = await staticModule.moduleManifestHash();

    expect(await staticModule.moduleTopology()).to.equal(topology);
    expect(manifestHash).to.equal(ethers.keccak256(manifest));
    expect(await store.getContentChunk(1, 0)).to.equal(ethers.hexlify(html));
    expect(await store.getContentChunk(2, 0)).to.equal(ethers.hexlify(css));

    const decoded = ethers.AbiCoder.defaultAbiCoder().decode([
      "tuple(uint16,bytes32,bytes32,bytes32,string,string,tuple(uint32,bytes32[]),tuple(uint32,uint32,uint32,uint32,uint32),bytes)",
    ], manifest)[0];
    expect(decoded[1]).to.equal(topology);
    expect(decoded[2]).to.equal(renderer);
    expect(decoded[4]).to.equal("QNS HTML/CSS Module Test");
    expect(decoded[5]).to.equal("/index.html");

    const staticSite = ethers.AbiCoder.defaultAbiCoder().decode([
      "tuple(address,string,bytes32,uint8,tuple(string,bytes32,uint32,bytes32,uint256,uint16)[])",
    ], decoded[8])[0];
    expect(staticSite[0]).to.equal(await store.getAddress());
    expect(staticSite[1]).to.equal("/index.html");
    expect(staticSite[3]).to.equal(2);
    expect(staticSite[4][0][0]).to.equal("/index.html");
    expect(staticSite[4][0][1]).to.equal(mimeTextHtml);
    expect(staticSite[4][1][0]).to.equal("/style.css");
    expect(staticSite[4][1][1]).to.equal(mimeTextCss);
  });

  it("exposes a compact fixed redirect module as a secondary topology", async function () {
    const FixedRedirectModule = await ethers.getContractFactory("QNSFixedRedirectModule");
    const fixedRedirectModule = await FixedRedirectModule.deploy();
    await fixedRedirectModule.waitForDeployment();

    const topology = ethers.keccak256(ethers.toUtf8Bytes("qns.topology.redirect.v1"));
    const renderer = ethers.keccak256(ethers.toUtf8Bytes("qns.renderer.redirect.v1"));
    const manifest = await fixedRedirectModule.moduleManifest();
    const manifestHash = await fixedRedirectModule.moduleManifestHash();

    expect(await fixedRedirectModule.moduleVersion()).to.equal(1);
    expect(await fixedRedirectModule.moduleTopology()).to.equal(topology);
    expect(manifestHash).to.equal(ethers.keccak256(manifest));

    const decoded = ethers.AbiCoder.defaultAbiCoder().decode([
      "tuple(uint16,bytes32,bytes32,bytes32,string,string,tuple(uint32,bytes32[]),tuple(uint32,uint32,uint32,uint32,uint32),bytes)",
    ], manifest)[0];
    expect(decoded[0]).to.equal(1);
    expect(decoded[1]).to.equal(topology);
    expect(decoded[2]).to.equal(renderer);
    expect(decoded[4]).to.equal("QNS Mainnet Redirect Demo");

    const redirect = ethers.AbiCoder.defaultAbiCoder().decode([
      "tuple(string,bytes32,uint8,bool)",
    ], decoded[8])[0];
    expect(redirect[0]).to.equal("https://qu.ai");
  });

  it("rejects anchors that do not match the module manifest", async function () {
    const [owner] = await ethers.getSigners();
    const network = await ethers.provider.getNetwork();
    const qnns = await deployQNNS();
    await qnns.waitForDeployment();

    await qnns.register(exampleName, owner.address, "", { value: ethers.parseEther("310") });
    const nameHash = hashName(exampleName);

    const resolver = await deployCurrentResolver(qnns);
    const Registry = await ethers.getContractFactory("QNSAnchorRegistry");
    const registry = await Registry.deploy(await resolver.getAddress());
    await registry.waitForDeployment();

    const RedirectModule = await ethers.getContractFactory("QNSRedirectModule");
    const redirectModule = await RedirectModule.deploy("Redirect", "https://qu.ai", ethers.ZeroHash, 1, false);
    await redirectModule.waitForDeployment();

    const topology = ethers.keccak256(ethers.toUtf8Bytes("qns.topology.redirect.v1"));
    const badAnchor = encodeAnchor(network.chainId, await redirectModule.getAddress(), topology, ethers.ZeroHash);
    await expect(registry.setAnchor(nameHash, badAnchor)).to.be.revertedWithCustomError(registry, "InvalidModule");
  });
});
