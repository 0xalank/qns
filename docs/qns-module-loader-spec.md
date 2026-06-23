# QNS Module Loader Spec

Draft status: working spec for refinement.

## Goal

QNS should resolve more than a blog. The base layer should let a QNS/QNNS name bootstrap an interpretable website, app, document, data surface, redirect, or higher-level protocol.

The core primitive is a small QNS module anchor:

- A QNS name resolves to a compact anchor.
- The anchor points to a module contract.
- The module tells a wallet browser, extension renderer, gateway, or site loader how to render the name.
- The renderer can load one of several topologies: static site, redirect, contract-state app, component graph, or QNS Publish.

The anchor is not the website. It is the first trusted pointer that lets every other model stay flexible.

## Design Principles

- Keep the QNS anchor small and stable.
- Put heavy bytes in contracts, chunks, reusable components, or hash-addressed assets.
- Let wallets, extension renderers, and gateways share one deterministic loading algorithm.
- Treat QNS Publish as one topology, not the base protocol.
- Make direct static sites easy.
- Make data-efficient composed sites possible.
- Make redirects explicit and verifiable.
- Do not require one global renderer for every future application.
- Do not make arbitrary contract-provided code run with wallet privileges.

## MVP Decisions

This draft locks these v1 decisions:

- Names use the current QNNS canonical ASCII grammar: `1-64` bytes of `a-z`, `0-9`, `-`, and `_`.
- Unicode and IDNA/punycode normalization are not part of v1.
- `QNSAnchorRegistry` is the MVP anchor store. Existing QNNS `contentHash` remains profile/content metadata, not the canonical website module pointer.
- Anchor chaining is not a generic anchor feature. Delegation is handled by an explicit Bootstrap Module or Redirect Module.
- Renderer IDs are stable `bytes32` identifiers. V1 wallets, extension renderers, and gateways only run built-in renderers they know.
- Static site modules cannot execute JavaScript in v1.
- The first mainnet proof should be a static-site module whose content bytes are stored in contract state and rendered by the loader after hash verification. Redirects are supported, but they are not the proof that QNS can host websites.
- The primary browser UX is wallet-native rendering through Pelagus. Public gateways are optional compatibility and debugging surfaces, not a required part of QNS website loading.
- Qi ephemeral data is a reserved future topology. It is not part of the first executable module path, but the spec should leave room for modules that interpret short-lived Qi transaction data instead of durable contract state.

## Terms

- **QNS name**: human name resolved through QNS/QNNS, normalized before hashing.
- **Name hash**: `keccak256(abi.encodePacked(normalizedName))`.
- **Anchor**: the first compact record resolved from the QNS name.
- **Module**: a contract referenced by the anchor.
- **Loader**: wallet/browser/extension/gateway code that resolves the anchor and starts rendering.
- **Renderer**: topology-specific code that turns module data into a browser view.
- **Topology**: a rendering/data model such as static site, redirect, component graph, or publish.
- **Wallet-native renderer**: a bundled extension or wallet app page that reads chain data directly and renders supported module topologies without trusting a public website.
- **Gateway**: a normal HTTPS surface that can load QNS content for browsers without native QNS support. Gateways are non-canonical in v1.

## QNS Name Normalization

V1 uses the existing QNNS canonical name grammar.

Canonical name bytes:

```text
^[a-z0-9_-]{1,64}$
```

Normalization algorithm for clients, gateways, and wallets:

1. Trim leading and trailing ASCII whitespace from user input.
2. If input is a QNS entry URL/host, extract the target from:
   - `qns://<name>/<path>`
   - `<name>.quai/<path>`
   - `https://qns.app/<name>/<path>`
3. If input ends with exactly one display suffix `.qns`, strip that suffix before hashing.
4. Lowercase ASCII `A-Z` to `a-z`.
5. Reject if the resulting UTF-8 byte length is `0` or greater than `64`.
6. Reject every byte outside:
   - `0x61-0x7a` (`a-z`)
   - `0x30-0x39` (`0-9`)
   - `0x2d` (`-`)
   - `0x5f` (`_`)
7. Compute `nameHash = keccak256(abi.encodePacked(normalizedName))`.

Rules:

- Contracts must not silently normalize names. Contract callers must pass canonical `normalizedName` or a precomputed `nameHash`.
- SDKs and UIs may normalize uppercase ASCII before submit, but they must show the final canonical name before signing.
- Unicode names are invalid in v1.
- IDNA and punycode are not decoded. A literal ASCII name such as `xn--abc` is treated as the literal QNS name `xn--abc`, not as Unicode.
- Dots are not valid inside canonical QNS names. `.qns` is only a display/input suffix removed before hashing. `.quai` is a browser hostname suffix removed during URL parsing before name normalization.
- Slashes are route separators, not part of the name.
- Percent-encoded URL name segments must decode to bytes matching the canonical grammar.
- If the extracted `.quai` target is an address matching `0x[0-9a-fA-F]{40}`, it is a direct module-address target and must not be passed into QNS name hashing.

This intentionally matches the current QNNS contract validator. If QNNS changes its name grammar later, the module anchor version must be bumped or a compatibility rule must be added.

## Anchor Model

The anchor should be tiny enough to fit comfortably in QNS/QNNS profile state or a dedicated registry.

Recommended v1 shape:

```solidity
struct QNSAnchor {
    uint16 version;
    uint16 flags;
    uint64 chainId;
    address moduleAddress;
    bytes32 topology;
    bytes32 manifestHash;
}
```

Rules:

- `version` selects the anchor decoding rules.
- `flags` are reserved for small capability bits.
- `chainId` tells the loader which network/zone to read from.
- `moduleAddress` points to the contract that implements the topology.
- `topology` selects the renderer family.
- `manifestHash` is the expected hash of the module manifest returned by the contract.
- `moduleAddress` must be nonzero in v1. Direct inline anchors are not part of the MVP.

Packed encoding:

```text
anchor = abi.encodePacked(
  uint16(version),
  uint16(flags),
  uint64(chainId),
  address(moduleAddress),
  bytes32(topology),
  bytes32(manifestHash)
)
```

This is `96` bytes: small enough for QNS profile state or a dedicated registry while still carrying the full first trust pointer. The anchor should never contain article bodies, full HTML, large JSON, images, or component definitions.

Optional fields must go in the module manifest, not the anchor. If the anchor needs a new required field, bump `version`.

## Anchor Resolution

V1 uses a dedicated `QNSAnchorRegistry` backed by a small name-owner resolver adapter. The registry should not bake in a single QNNS ABI forever; the resolver adapter owns compatibility with whichever deployed name-service contract is canonical for a chain.

```solidity
interface IQNSNameResolver {
    function ownerOfName(bytes32 nameHash) external view returns (address owner, bool active);
}

interface IQNSAnchorRegistry {
    event AnchorSet(
        bytes32 indexed nameHash,
        address indexed owner,
        bytes32 indexed topology,
        bytes anchor,
        bytes32 manifestHash
    );

    event AnchorCleared(bytes32 indexed nameHash, address indexed owner);

    function nameResolver() external view returns (address);
    function anchorOf(bytes32 nameHash) external view returns (bytes memory anchor);
    function setAnchor(bytes32 nameHash, bytes calldata anchor) external;
    function clearAnchor(bytes32 nameHash) external;
}
```

Rules:

- `setAnchor` and `clearAnchor` require current QNS/QNNS ownership of `nameHash` through `IQNSNameResolver.ownerOfName`.
- The resolver adapter should check QNNS active/registered state when the deployed QNNS contract exposes it.
- The current QNNS adapter is `QNSCurrentOwnerResolver`, which delegates to `isActive(bytes32)` and `ownerOf(uint256(nameHash))`.
- The registry must decode and validate the 96-byte `QNSAnchor` before storing it.
- The registry stores the compact encoded `QNSAnchor`.
- The registry does not store website bytes.
- Updating the anchor changes the current canonical bootstrap for the name.
- Historical anchors may still be visible through chain history.
- If a QNS name expires or is transferred, the stored anchor does not automatically move or disappear. The current name owner can replace or clear it.
- Loaders should verify that the QNS name is currently active before treating an anchor as canonical.
- V1 anchors do not have an anchor-level expiry timestamp. QNNS active/expired state controls canonical renderability.

### Existing QNS Content Field Compatibility

QNNS `contentHash` should not be the MVP module pointer. It remains useful for profile-level content, IPFS/EIP-1577 style metadata, or migration hints.

If a compatibility bridge is needed later, `contentHash` may point to an envelope:

```text
qnsk:v1:<chainId>:<moduleAddress>:<topology>:<manifestHash>
```

That bridge is non-canonical unless the loader explicitly runs in compatibility mode. The canonical v1 website anchor comes from `QNSAnchorRegistry`.

## Module Contract Interface

Every contract-backed module should expose a small introspection interface.

```solidity
interface IQNSModule {
    function moduleVersion() external view returns (uint16);
    function moduleTopology() external view returns (bytes32);
    function moduleManifestHash() external view returns (bytes32);
    function moduleManifest() external view returns (bytes memory);
}
```

Optional route interface:

```solidity
interface IQNSRoutableModule {
    function resolveRoute(
        bytes calldata path,
        bytes calldata query
    ) external view returns (
        bytes32 renderer,
        bytes memory payload,
        bytes32 payloadHash
    );
}
```

Rules:

- `moduleTopology()` must match the anchor `topology`.
- `moduleManifestHash()` must match the anchor `manifestHash`.
- `keccak256(moduleManifest())` must match `manifestHash`.
- The manifest tells the renderer which reads, chunks, contracts, components, or redirect target to use.
- Route resolution must be read-only.
- If `resolveRoute` returns a renderer, v1 loaders must require it to equal `ModuleManifestV1.rendererId`.
- Modules must not require transaction signing to render public pages.

## Manifest Format

The canonical on-chain manifest is ABI-encoded bytes. SDKs may expose JSON for developer convenience, but contracts and loaders verify the ABI bytes.

Top-level manifest:

```solidity
struct ModuleManifestV1 {
    uint16 version;
    bytes32 topology;
    bytes32 rendererId;
    bytes32 contentMode;
    string title;
    string defaultRoute;
    PermissionPolicyV1 permissionPolicy;
    ResourceBudgetV1 resourceBudget;
    bytes topologyData;
}

struct PermissionPolicyV1 {
    uint32 flags;
    bytes32[] providerMethodIds;
}

struct ResourceBudgetV1 {
    uint32 maxManifestBytes;
    uint32 maxRoutePayloadBytes;
    uint32 maxContractReads;
    uint32 maxTotalLoadedBytes;
    uint32 maxRenderMillis;
}
```

Rules:

- `manifestBytes = abi.encode(ModuleManifestV1)`.
- `manifestHash = keccak256(manifestBytes)`.
- `moduleManifest()` returns `manifestBytes`.
- `topologyData` is `abi.encode(...)` for the selected topology schema.
- `version` must be `1` for this spec.
- `topology` must equal the anchor topology.
- `rendererId` must be supported by the loader.
- `contentMode` is topology-specific. Unknown content modes fail closed.
- The manifest should be small; target less than `4 KB`.
- Large data should be referenced by hash, contract address, chunk ID, or component ID.
- If a manifest references off-chain assets, every asset must have a content hash.
- Fully on-chain sites must be renderable without off-chain asset reads.

Permission flags:

```text
0x00000001 = requests provider injection
0x00000002 = requests account read
0x00000004 = requests message signing
0x00000008 = requests transaction submission
0x00000010 = references off-chain assets
```

`providerMethodIds` uses `keccak256(bytes(methodName))`, for example `keccak256(bytes("quai_requestAccounts"))`.

## Topology And Renderer IDs

Topology IDs are `bytes32` values computed as `keccak256(bytes(idString))`.

V1 topology ID strings:

```text
qns.topology.redirect.v1
qns.topology.bootstrap.v1
qns.topology.static-site.v1
qns.topology.contract-data.v1
qns.topology.component-graph.v1
qns.topology.app-contract.v1
qns.topology.publish.v1
qns.topology.qi-ephemeral.v1
```

Renderer IDs are also `bytes32` values computed as `keccak256(bytes(idString))`.

V1 renderer ID strings:

```text
qns.renderer.redirect.v1
qns.renderer.bootstrap.v1
qns.renderer.static-safe.v1
qns.renderer.contract-data.v1
qns.renderer.component-graph.v1
qns.renderer.app-contract.v1
qns.renderer.publish.v1
qns.renderer.qi-ephemeral.v1
```

Rules:

- V1 wallets, extension renderers, and gateways only run built-in renderers with known IDs.
- Unknown renderer IDs fail closed.
- Breaking renderer changes require a new renderer ID string.
- Non-breaking renderer implementation updates can keep the same renderer ID.
- A future `QNSRendererRegistry` may support hash-verified sandbox renderers, but it is not part of MVP.

## Loading Algorithm

Given an entry such as `alice.quai/post/hello`, `0x006d...1569.quai/post/hello`,
`qns://alice/post/hello`, `qns://0x006d...1569/post/hello`, or
`https://qns.app/alice/post/hello`:

1. Parse the entry target into either `name` or `moduleAddress`.
2. Preserve route `path` and `query`.
3. If the target is a direct module address, skip name/anchor resolution and set `moduleAddress` from the target.
4. If the target is a name:
   - Normalize the QNS name.
   - Compute `nameHash`.
   - Resolve the anchor from `IQNSAnchorRegistry.anchorOf(nameHash)`.
   - Decode the anchor.
   - Validate supported `version`, `chainId`, and `topology`.
   - Set `moduleAddress` from the anchor.
5. Read `moduleVersion`, `moduleTopology`, `moduleManifestHash`, and `moduleManifest` from `moduleAddress`.
6. Verify the topology and manifest hash against the anchor when an anchor was used.
7. Decode `ModuleManifestV1`.
8. Select the renderer for `rendererId`.
9. Decode `topologyData`.
10. If the topology supports routes, call `resolveRoute(path, query)`.
11. Verify route payload hashes and resource budgets.
12. Render inside the wallet/browser sandbox with the QNS origin context.

"Execute" in this spec means the loader executes trusted wallet, extension, or gateway renderer code for the declared topology. It does not mean the browser executes arbitrary bytecode, JavaScript, or HTML returned by a module contract. Contract-returned bytes are data unless a topology explicitly routes them into a sandbox with declared permissions.

Recommended limits:

- Bootstrap/redirect depth: `4`.
- Manifest bytes: `4 KB` target, `32 KB` hard cap.
- Route payload bytes per read: topology-specific, declared in manifest.
- Contract read calls per first render: manifest-declared budget.
- Loader timeout: fail closed with a readable error.

## URL And Redirect Model

The protocol should support four entry forms. The canonical render path for
wallet users is wallet-native. Public gateway URLs are compatibility fallbacks,
not required infrastructure.

### `.quai` Browser Hostname

```text
alice.quai/path?query
0x006d6ca9f508531a686b83bd370b7ca009891569.quai/path?query
```

This is the preferred Chrome address-bar UX. Chrome treats it like a normal
hostname navigation, which gives the Pelagus extension a reliable top-level
navigation event to intercept before the browser performs a network load.

Rules:

- `<name>.quai` resolves through QNS/QNNS name normalization and the anchor registry.
- `<address>.quai` skips QNS-name resolution and loads that module address directly.
- Address hosts are lowercased by the browser. The loader must parse them case-insensitively and checksum internally.
- Route path and query are preserved and passed to the module route resolver when the topology supports routes.
- `.quai` hostnames are input syntax for wallet/native loading. They do not require public DNS to resolve in the MVP.

### Native QNS URL

```text
qns://alice/path?query
qns://0x006d6ca9f508531a686b83bd370b7ca009891569/path?query
```

This is the clean long-term protocol URI. In current Chrome address bars, raw
custom schemes may be converted to search text before the extension sees them,
so `.quai` is the preferred typed-address-bar form.

### Pelagus Internal Renderer

Pelagus should rewrite `.quai`, `qns://`, and omnibox keyword entries to a
bundled extension page, for example:

```text
chrome-extension://<pelagus-extension-id>/qns-renderer.html?module=0x...&path=/...
chrome-extension://<pelagus-extension-id>/qns-renderer.html?name=alice&path=/...
```

The exact extension URL is an implementation detail. It should not be used as
the public link format. The renderer page must:

1. Resolve QNS names or direct module addresses.
2. Read module contract state from the configured Quai RPC for the active chain.
3. Verify module interface values, manifest hash, topology, static file hashes, and route payload hashes.
4. Render using bundled, known-safe renderer code.
5. Scope provider permissions to the QNS origin, not to the extension page URL.

No public gateway, localhost server, or third-party website is required for this path.

### Public Gateway URL

```text
https://qns.app/alice/path?query
```

The gateway resolves the name and renders the module for ordinary browsers that
do not have a native QNS-aware wallet. It is useful for previews, sharing, and
debugging, but it is not the canonical wallet render path.

### Wallet Browser Launcher URL

For wallets that already support opening an internal browser through an HTTPS deep link:

```text
https://blippay.me/browser?url=https%3A%2F%2Fqns.app%2Falice%2Fpath
```

This keeps QNS links portable before every wallet supports `.quai` or `qns://`
directly.

Redirect rules:

- Redirects must be an explicit topology or manifest action.
- Redirect targets must be `https://`, `qns://`, or another approved app scheme.
- Loader must enforce redirect depth limits.
- Redirects should display the destination origin before wallet permissions are requested.
- Redirects must not silently preserve wallet permissions from the source QNS origin.

## Origin And Wallet Permissions

The loader should create a stable QNS origin independent of the gateway host or
extension URL.

```text
qns:<nameHash>
qns-module:<chainId>:<moduleAddress>
```

Rules:

- Name-based loads use `qns:<nameHash>`.
- Direct module-address loads use `qns-module:<chainId>:<moduleAddress>`.
- Wallet permissions are scoped to the QNS/module origin, not to `qns.app`, another gateway, or the Pelagus extension URL.
- A wallet-native renderer or gateway may host the rendering shell, but the app identity shown to the wallet is the QNS name and `nameHash`, or the direct module address when no name was used.
- Provider injection is disabled by default unless the manifest requests it.
- If provider injection is requested, the wallet must show the QNS name, module contract, topology, and requested capabilities.
- Redirecting away from the QNS origin clears QNS-scoped provider privileges.

## Topology: Redirect Module

Use when the QNS name should navigate somewhere else.

Topology data:

```solidity
struct RedirectManifestV1 {
    string targetUrl;
    bytes32 targetContentHash;
    uint8 mode;
    bool preservePath;
}
```

Rules:

- `targetUrl` must use an approved scheme.
- `mode = 1` means replace current route with `targetUrl`.
- `mode = 2` means append/preserve current path and query when possible.
- If `targetContentHash != bytes32(0)`, the loader verifies the fetched target payload where possible.
- Redirect Module is for navigation. It is not used for silent in-protocol delegation with preserved wallet permissions.

## Topology: Bootstrap Module

Use when one QNS module should delegate to another QNS name or to another explicit anchor.

Topology data:

```solidity
struct BootstrapManifestV1 {
    uint8 targetKind;
    string targetName;
    bytes32 expectedTargetNameHash;
    bytes targetAnchor;
    bool preservePath;
}
```

Rules:

- `targetKind = 1` means resolve `targetName` through `QNSAnchorRegistry`.
- `targetKind = 2` means use `targetAnchor` directly.
- `targetName` must normalize under the v1 QNS name rules.
- If `expectedTargetNameHash != bytes32(0)`, the loader must verify it matches the normalized `targetName`.
- `targetAnchor` must be exactly one encoded 96-byte `QNSAnchor` when `targetKind = 2`.
- Bootstrap depth is capped at `4`.
- The loader must detect cycles by tracking visited `nameHash` and `keccak256(anchor)`.
- Bootstrap keeps QNS protocol context, but wallet permissions are still scoped to the final resolved QNS origin shown to the user.
- Use Redirect Module, not Bootstrap Module, for external HTTPS navigation.

## Topology: Static Site Module

Use when the QNS name owns a direct site made of bytes.

Topology data:

```solidity
struct StaticSiteManifestV1 {
    address contentStore;
    string entryPath;
    bytes32 rootHash;
    uint8 htmlPolicy;
    StaticFileRefV1[] files;
}

struct StaticFileRefV1 {
    string path;
    bytes32 mimeType;
    uint32 byteLength;
    bytes32 contentHash;
    uint256 contentId;
    uint16 chunkCount;
}
```

Known MIME type IDs:

```text
keccak256(bytes("text/markdown"))
keccak256(bytes("text/plain"))
keccak256(bytes("text/html"))
keccak256(bytes("text/css"))
keccak256(bytes("image/png"))
keccak256(bytes("image/jpeg"))
keccak256(bytes("image/svg+xml"))
```

Rules:

- File bytes may be stored in contract state chunks.
- Loader reconstructs files, verifies `contentHash`, and serves them inside the QNS sandbox.
- `rootHash` is the rolling commitment over `files` sorted by bytewise ascending `path`.
- `htmlPolicy = 1` means render markdown/plain text only.
- `htmlPolicy = 2` means render sanitized HTML.
- JavaScript is forbidden in Static Site Module v1.
- The static renderer must remove or reject:
  - `<script>`
  - inline event handler attributes
  - `javascript:` URLs
  - `<iframe>`, `<object>`, `<embed>`
  - external scripts
- `application/javascript` and equivalent script MIME types are unsupported.
- Rich interactive apps must use Component Graph Module or App Contract Module, not Static Site Module.

Static content store read interface:

```solidity
interface IQNSStaticContentStore {
    function getContentChunk(
        uint256 contentId,
        uint16 chunkIndex
    ) external view returns (bytes memory);
}
```

The manifest owns file length, content hash, MIME type, and chunk count. The content store only needs to return chunk bytes by ID and index.

Static file root commitment:

```text
root_0 = bytes32(0)
root_i = keccak256(
  abi.encodePacked(
    root_(i - 1),
    keccak256(bytes(file.path)),
    file.mimeType,
    uint32(file.byteLength),
    file.contentHash,
    uint256(file.contentId),
    uint16(file.chunkCount)
  )
)
rootHash = root_n
```

This topology is simple and byte-heavy. It is appropriate for small sites, documents, proofs, and durable landing pages.

## Topology: Contract Data Module

Use when the module contract stores structured data and a known renderer interprets it.

Examples:

- profile
- directory
- product catalog
- documentation
- publication archive
- dashboard

Rules:

- Contract exposes typed view methods.
- Manifest declares schema version and renderer ID.
- Renderer reads data through declared methods.
- Data is canonical if it comes from contract state.
- The renderer is client software, not arbitrary code returned by the contract.

This topology is more efficient than static files for repeated structured data.

Topology data:

```solidity
struct ContractDataManifestV1 {
    address dataContract;
    bytes32 schemaId;
    bytes4[] viewSelectors;
    bytes schema;
}
```

## Topology: Component Graph Module

Use when a site is assembled from reusable on-chain components and small data props.

Topology data:

```solidity
struct ComponentGraphManifestV1 {
    address componentRegistry;
    bytes32 rootComponentId;
    bytes32 themeId;
    bytes32 propsRoot;
    ComponentRefV1[] components;
}

struct ComponentRefV1 {
    bytes32 componentId;
    uint16 version;
    address contractAddress;
    bytes32 rendererHash;
    bytes32 propsHash;
}
```

Rules:

- Components are resolved from a known registry.
- Component code is wallet/gateway renderer code or hash-verified sandbox code.
- Contract state should store component IDs and props, not repeated UI bytes.
- Component graph rendering must be deterministic from the manifest and contract reads.
- Components that request wallet access must declare that capability explicitly.

This is the data-efficient path for rich sites and apps. It lets many QNS names reuse the same renderer and component set while only storing unique data and layout props.

## Topology: App Contract Module

Use when one application contract controls its own routing and payloads.

Topology data:

```solidity
struct AppContractManifestV1 {
    address appContract;
    bytes32 appSchemaId;
    bytes32[] routeIds;
}
```

Rules:

- Module contract implements `IQNSModule` and `IQNSRoutableModule`.
- `resolveRoute` returns a renderer ID plus a hash-verified payload.
- The app contract can reference other contracts, components, and chunks.
- The loader enforces manifest resource budgets.
- Transaction actions are never auto-executed; they must become explicit wallet prompts.

This topology fits apps where a contract is the source of truth and the UI is a deterministic interpretation of contract state.

## Topology: Qi Ephemeral Data Module

Reserved for modules that interpret short-lived data carried by Qi transactions.
This is intentionally not part of the MVP implementation. The first implementation
track remains static-site modules loaded directly by Pelagus.

Use when a QNS module wants to render data whose current meaning is finite,
prunable, or intentionally non-durable:

- temporary catalogs
- live game or wearable state
- finite-duration item attributes
- short-lived order/quote/receipt data
- session-like app state

The core idea is:

```text
QNS module anchor -> Qi ephemeral renderer -> bounded Qi query -> active packets only
```

Qi should be treated as the ephemeral data/event surface. Contract state remains
the durable app-state surface. A module may combine both, but the topology must
be explicit about which data is canonical for the current render.

Topology data:

```solidity
struct QiEphemeralManifestV1 {
    bytes32 schemaId;
    bytes4 packetMagic;
    uint32 maxPacketBytes;
    uint64 queryWindowBlocks;
    uint64 defaultTtlBlocks;
    bytes32 dataRootHint;
    bytes schema;
}
```

Rules:

- Qi ephemeral data is read as bounded recent data, not as permanent website storage.
- The current view must be derived from packets that are still valid under the module's TTL, block window, and schema rules.
- A packet may also require a live marker UTXO, if the schema wants liveness to depend on an unspent output.
- The module must not require archival Qi history for normal rendering.
- The renderer must fail gracefully when the local RPC/indexer cannot provide the requested bounded Qi query.
- Packet bytes should be compact binary, not JSON.
- Packet signatures and transaction ownership must be verified by Pelagus or by a trusted renderer path before display.
- Pages must not construct raw Qi inputs. They request wallet-owned actions such as `qi_sendToOutputs` or a future structured ephemeral-data method.
- Historical transaction data may still be visible to archival nodes or explorers. "Ephemeral" means current renderability is finite or prunable, not that old bytes are cryptographically erased.

Recommended packet envelope:

```text
bytes4  magic
uint16  version
bytes32 schemaId
bytes32 subject
uint8   op
uint64  validFrom
uint64  validUntil
bytes32 dataHash
bytes   inlineData
```

The exact packet ABI should be defined by the schema referenced in
`QiEphemeralManifestV1.schemaId`.

## Topology: QNS Publish Module

QNS Publish is one app-contract topology.

Topology data:

```solidity
struct QNSPublishManifestV1 {
    address publishContract;
    bytes32 authorNameHash;
    bool authorScoped;
    bytes32[] adapterIds;
}
```

Mapping:

- QNS author name resolves to a publish module or a profile module that references `QNSPublish`.
- Author route loads the post index for that `authorNameHash`.
- Post route loads `postIdByAuthorAndSlugHash`.
- Post bodies and comments are reconstructed from `QNSPublish` contract state.
- Subscriptions and external adapters remain topology-specific services.

This means the publishing platform can dogfood the same QNS module loader that third-party websites use.

## Bootstrap Contracts

Recommended MVP contracts:

1. `QNSAnchorRegistry`
2. `QNSFixedStaticSiteModule` for the first self-contained contract-state website demo
3. `QNSStaticContentStore`
4. `QNSStaticSiteModule`
5. `QNSRedirectModule`
6. `QNSPublishModule`
7. `QNSComponentRegistry` later

The registry is the only required base contract beyond QNS/QNNS. Everything else is a topology.

Reserved topology IDs such as `qns.topology.qi-ephemeral.v1` do not imply an MVP
contract or renderer. They are placeholders so later modules can build on the
same anchor/manifest boot path without changing the base protocol.

## Space Budget

The protocol should keep first-load bytes predictable.

Recommended budgets:

| Layer             |       Target |         Hard Cap | Notes                                             |
| ----------------- | -----------: | ---------------: | ------------------------------------------------- |
| QNS anchor        |         96 B |            128 B | First trust pointer only                          |
| Module manifest   |      <= 4 KB |            32 KB | Topology config and references                    |
| Route payload     |      <= 4 KB | topology-defined | Data for one route render                         |
| Static file chunk |      <= 4 KB | topology-defined | Reuse QNS Publish chunk discipline where possible |
| Component props   | <= 2 KB each | topology-defined | Prefer IDs/hashes over repeated layout bytes      |

If a site needs more bytes, it should move them down one layer:

- Anchor points to manifest.
- Manifest points to contracts/components/chunks.
- Components point to reusable renderer code.
- Route payloads carry only route-local data.

## Developer Flow

Static site:

1. Build files locally.
2. Chunk and hash files.
3. For a small self-contained site, deploy `QNSFixedStaticSiteModule` with the entry bytes stored in module state.
4. For a larger site, deploy or update `QNSStaticContentStore`, then deploy `QNSStaticSiteModule`.
5. Set QNS anchor to the static module.
6. Test through the Pelagus native renderer and, optionally, a gateway.
7. Verify that the loader reads the entry chunks from chain, recomputes the file hash, and renders those bytes.

Contract app:

1. Deploy app/module contract.
2. Expose `IQNSModule`.
3. Encode compact manifest.
4. Set QNS anchor to module address and manifest hash.
5. Add renderer support to gateway/wallet if this is a new topology.

Qi ephemeral app, later:

1. Define a compact packet schema and `schemaId`.
2. Define bounded Qi query requirements, TTL rules, and optional marker-UTXO liveness rules.
3. Deploy a module that exposes `QiEphemeralManifestV1`.
4. Add a Pelagus renderer/provider path that can query the bounded Qi data safely.
5. Add structured signing/publishing only after the renderer can show a human-readable confirmation.

Component site:

1. Pick registered components.
2. Store layout/data props.
3. Deploy or update component graph module.
4. Set QNS anchor.
5. Loader reconstructs the site from components and props.

## Pelagus Integration

Pelagus should support QNS modules as a wallet/browser capability, not as blog-specific logic.

Resolver config is keyed by chain ID:

```ts
type QNSResolverConfig = {
  chainId: string;
  qnnsAddress: string;
  qnsNameResolverAddress: string;
  qnsAnchorRegistryAddress: string;
  qnsDebugGatewayBaseUrl?: string;
  supportedTopologies: string[];
  supportedRenderers: string[];
};
```

Rules:

- `chainId` is the EIP-1193 hex chain ID returned by `quai_chainId`.
- The anchor `chainId` is the same ID encoded as `uint64`.
- Quai zone routing is derived from the target contract address and the selected network provider.
- `qnsDebugGatewayBaseUrl` is optional and must not be required for native loading.
- The native Pelagus renderer is a bundled extension page, not a remote website.
- If `qnsAnchorRegistryAddress` is not configured for the active chain, Pelagus must return an unsupported/unconfigured provider error for QNS module methods.
- Pelagus must not guess registry addresses from page JavaScript.

Recommended provider methods:

```text
pelagus_qnsResolveName(name) -> { nameHash, owner, anchor, chainId }
pelagus_qnsGetModule(nameOrAddressOrUrl) -> { anchor, moduleAddress, topology, manifestHash, manifest, chainId }
pelagus_qnsOpen(url) -> opens .quai, qns://, or direct module input in the native Pelagus renderer
```

Rules:

- These methods are wallet-owned `pelagus_*` methods, not chain RPC methods.
- These methods are read-only except `pelagus_qnsOpen`, which is navigation-only.
- They should not sign or submit transactions.
- Write actions still use normal transaction requests.
- Provider responses must include the chain/network used for resolution.
- If a dapp asks Pelagus to open a QNS route, Pelagus should show the resolved QNS name and destination before navigation.

Pelagus MVP:

1. Add a bundled extension page, for example `qns-renderer.html`, that contains the trusted QNS renderers.
2. Intercept top-level `.quai` navigations:
   - `alice.quai/path`
   - `0x006d6ca9f508531a686b83bd370b7ca009891569.quai/path`
3. Rewrite those navigations to the bundled extension renderer page.
4. Preserve route path/query and pass name or module address to the renderer.
5. Read chain state directly through Pelagus' configured Quai provider/RPC.
6. Render supported modules without requiring `localhost`, `qns.app`, or any other gateway.
7. Keep the omnibox keyword as a fallback for browsers that do not expose `.quai` navigation events consistently.

Minimal Chrome extension permissions for `.quai` interception:

```json
{
  "permissions": ["webNavigation"],
  "host_permissions": [
    "http://*.quai/*",
    "https://*.quai/*"
  ]
}
```

Implementation notes:

- Listen to `webNavigation.onBeforeNavigate`.
- Only handle `frameId === 0`.
- Match hosts ending in `.quai`.
- Use the host label before `.quai` as either the QNS name or direct module address.
- Use `tabs.update(tabId, { url: chrome.runtime.getURL(...) })` to navigate to the bundled renderer.
- `tabs.update` navigation does not require the broad `"tabs"` permission; avoid requesting `"tabs"` unless another Pelagus feature needs sensitive tab properties.
- Do not request `<all_urls>` for QNS loading.

## Blip Integration

Blip can support QNS modules through its existing internal browser flow.

Recommended phases:

1. Support public QNS gateway URLs in the Blip browser:

```text
https://blippay.me/browser?url=https%3A%2F%2Fqns.app%2Falice%2Fpath
```

2. Add native handling for:

```text
qns://alice/path
https://qns.app/alice/path
```

3. Route those links into the same browser surface used for dapp browsing.
4. Show the QNS name and module contract in the browser chrome when resolved.
5. Scope wallet permissions to `qns:<nameHash>`.

iOS and Android should share the same normalization and link rules.

## Security Considerations

- Never treat contract-returned bytes as trusted executable code.
- Pelagus native rendering must use renderer code bundled with the extension or a future hash-verified sandbox. The module contract must not provide privileged renderer JavaScript.
- Verify every manifest hash before rendering.
- Verify every content hash before displaying direct static files.
- Sanitize markdown and HTML by default.
- Do not execute JavaScript in Static Site Module v1.
- Require explicit wallet confirmation for every transaction.
- Show the QNS name, module address, topology, and origin before granting wallet permissions.
- Limit bootstrap depth, redirects, route reads, payload bytes, and render time.
- Detect cycles in Bootstrap Modules and component graphs.
- Fail closed when a topology is unknown.
- Keep gateway caches non-canonical.
- Make edit/delete language clear: current module state can change, chain history can remain.

## MVP Scope

1. `QNSAnchorRegistry` spec and SDK encoder/decoder.
2. `IQNSModule` interface.
3. Pelagus native extension renderer for `.quai`, `qns://`, and direct module-address input.
4. Direct module-address loading without QNS name resolution.
5. Static site module with no JavaScript execution.
6. Redirect module.
7. Bootstrap module.
8. Loader verification rules.
9. Publish module adapter to QNS Publish.
10. Optional public gateway route shape for non-wallet browsers.
11. Wallet integration docs for Pelagus, Blip iOS, and Blip Android.

## Non-Goals For V1

- Arbitrary unreviewed on-chain JavaScript with wallet privileges.
- A universal visual builder.
- Paid hosting abstraction.
- Replacing DNS for all websites.
- Global search or indexing.
- Guaranteeing deletion from transaction history or third-party caches.

## Open Questions

- Should `.quai` be treated only as a wallet-intercepted pseudo-TLD in v1, or should we later pursue DNS/ICANN or resolver integration?
- Should component registries be protocol-owned, community-owned, or fully permissionless?
