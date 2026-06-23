# QNS — Quai Name Service

Soulbound name registry for Quai Network. Register a username linked to your Quai address, Qi payment code, avatar, and social profiles.

## Features

- **Soulbound** — names cannot be transferred, eliminating secondary market speculation
- **One name per address** — registering a new name auto-releases the old one
- **Commit-reveal** — two-step registration prevents front-running
- **48-hour claim period** — newly registered names go live after 48 hours
- **2-year heartbeat** — inactive names (no contract interaction for 2 years) can be reclaimed by anyone
- **Admin controls** — revoke, reassign, reserve, and block names
- **On-chain avatar** — 128×128 image stored on-chain (max 15KB)
- **Qi payment codes** — BIP47 payment code for Qi UTXO payments
- **Nostr identity** — on-chain Nostr pubkey with NIP-05 verification endpoint

## Profile Fields

| Field | Description |
|-------|-------------|
| Quai Address | Address for receiving Quai payments |
| Qi Payment Code | BIP47 payment code (PM8T...) for Qi |
| Nostr Pubkey | secp256k1 public key for Nostr (64-char hex) |
| Avatar | On-chain image (max 15KB) |
| Display Name | Human-readable display name |
| Description | Short bio |
| URL | Website link |
| Twitter | Twitter/X handle |
| GitHub | GitHub username |
| Discord | Discord handle |
| Telegram | Telegram handle |

## Registration Flow

```
1. commit(hash)          — Submit hash of (name, address, secret)
2. Wait 1 minute         — Prevents same-block front-running
3. reveal(name, secret)  — Pay 500 QUAI, name registered
4. Wait 48 hours         — Claim period before name goes live
```

## Nostr Integration

QNS stores a Nostr public key on-chain for each name, bridging Quai identity to the Nostr decentralized messaging network. Both use secp256k1, so the same cryptographic primitives apply.

### What this gives us

- **Human-readable Nostr identity** — instead of sharing a 64-char hex pubkey, share a QNS name
- **On-chain verification** — Nostr pubkey is stored in the contract, not a centralized server
- **NIP-05 verification** — the frontend serves `/.well-known/nostr.json` so Nostr clients can verify identities (e.g. `alice@names.quai.network`)
- **Encrypted messaging** — any Nostr client can look up a QNS name, resolve the pubkey, and send encrypted DMs

### Encrypted Chat via QNS Names

Nostr encrypted DMs (NIP-04/NIP-44) use ECDH on secp256k1 — the same curve and same technique used for Qi payment code address derivation. The flow:

```
1. Alice wants to message Bob
2. Look up "bob" in QNS → get Bob's Nostr pubkey from the contract
3. ECDH: shared_secret = alice_privkey × bob_pubkey
4. Encrypt message with shared_secret
5. Publish encrypted event to Nostr relays
6. Bob decrypts: shared_secret = bob_privkey × alice_pubkey (same result)
```

This means QNS names become handles for end-to-end encrypted communication without any centralized messaging server.

### NIP-05 Verification

When the frontend is deployed (e.g. `names.quai.network`), users set their Nostr NIP-05 identity to `username@names.quai.network`. Nostr clients then verify by fetching:

```
GET https://names.quai.network/.well-known/nostr.json?name=username
→ { "names": { "username": "<hex-pubkey>" } }
```

The endpoint reads directly from the QNS contract — no database, no manual configuration.

### SDK

```typescript
// Set Nostr pubkey
await qns.setNostrPubkey('alice', '3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d');

// Look up Nostr pubkey
const pubkey = await qns.getNostrPubkey('alice');
```

## Installation

```bash
npm install
```

## SDK Usage

```typescript
import { QNSClient, SDKConfig } from './sdk';

const config: SDKConfig = {
  qnsAddress: '0x...',
  rpcUrl: 'https://orchard.rpc.quai.network/cyprus1',
};

const qns = new QNSClient(config, signer);

// Step 1: Commit
const secret = qns.generateSecret();
await qns.commit({ name: 'alice', secret }, walletAddress);

// Step 2: Reveal (after 1+ minute)
await qns.reveal({
  name: 'alice',
  secret,
  quaiAddress: walletAddress,
  qiPaymentCode: 'PM8T...',  // optional
});

// Lookup
const profile = await qns.getProfile('alice');
console.log(profile.quaiAddress);
console.log(profile.qiPaymentCode);

// Update profile
await qns.setProfile('alice', {
  displayName: 'Alice',
  description: 'Builder on Quai',
  url: 'https://alice.dev',
});

await qns.setSocials('alice', {
  twitter: 'alice',
  github: 'alice',
  discord: 'alice#1234',
  telegram: 'alice',
});

// Set Nostr pubkey
await qns.setNostrPubkey('alice', '3bf0c63f...');

// Heartbeat (resets 2-year inactivity timer)
await qns.keepAlive('alice');

// Voluntarily release
await qns.release('alice');
```

## Development

```bash
# Compile contracts
npx hardhat compile

# Deploy to Orchard testnet
node scripts/deploy.js
```

## QNS Module Loader Mainnet

The MVP module deployment path is mainnet-only for the live demo. The primary example is a static-site module that stores HTML and CSS bytes in contract state and exposes them through the module loader. It writes `deployments/qns-modules-mainnetCyprus1-9.json`.

The target wallet UX is native Pelagus rendering, not a hosted gateway page. The
local Next `/modules` page is only a debug/explorer surface while the Pelagus
extension renderer is being built. In the intended flow, inputs like these are
handled by Pelagus and rendered from chain inside the extension:

```text
0x0072d691826aae17b8bb01fe2ecadd2d9ec1a568.quai
qns://0x0072D691826aAE17B8bB01Fe2ecADd2D9eC1a568
```

```bash
npm run deploy:examples:mainnet
npm run deploy:examples:html:mainnet
npm run probe:qnns:mainnet
npm run load:module:mainnet
npm run verify:module:mainnet
```

Current live static module:

```text
0x0072D691826aAE17B8bB01Fe2ecADd2D9eC1a568
```

Deployment transaction:

```text
0x001e00584ee3fd8be24d3a0b1b5ac707fa0cc870ed6dca8f1ca0fb7b6c07f624
```

Previous markdown static module:

```text
0x006D6ca9F508531a686b83Bd370b7CA009891569
```

Legacy redirect-only module:

```text
0x0033971a7f17EDde345904F6D823996e1aaB8658
```

If the deployment file points at the legacy redirect address above, that is not the target static-site proof. Re-run `npm run deploy:examples:html:mainnet` to deploy the generic HTML/CSS static-site module; the verifier will then fetch each listed file from contract state and hash-check it before rendering.

Bare `load:module:mainnet` and `verify:module:mainnet` intentionally reject that legacy redirect artifact. To inspect it anyway:

```bash
ALLOW_LEGACY_REDIRECT=true npm run load:module:mainnet
```

The fuller multi-contract static-site example is still available through `EXAMPLE_MODULE=static npm run deploy:examples:quais`, but it requires enough mainnet QUAI for multiple contract deployments and content writes. QNS-name resolution also requires a valid deployed mainnet QNNS contract, a compatible name resolver adapter, and an anchor registry; direct module-address loading works without those.

Direct-address module loading:

```bash
MODULE_ADDRESS=0x0072D691826aAE17B8bB01Fe2ecADd2D9eC1a568 npm run load:module:mainnet
```

For a static module, `load:module:mainnet` does the full read path:

1. Read `moduleManifest()` from the module contract.
2. Verify `keccak256(moduleManifest()) == moduleManifestHash()`.
3. Decode the static-site topology data.
4. Read the listed file chunks from `staticSite.contentStore`.
5. Verify the assembled bytes against each file `contentHash`.
6. Render the entry bytes according to MIME type and policy.

Name loading is the same CLI path once the mainnet anchor registry is deployed:

```bash
QNS_NAME=alice QNS_ANCHOR_REGISTRY_ADDRESS=0x... npm run load:module:mainnet
```

Mainnet name anchoring is intentionally explicit. `probe:qnns:mainnet` scans candidate contracts from the known deployer history and checks whether they expose the current QNNS interface or the resolver adapter interface. `anchor:module:mainnet` requires either a valid `QNNS_CONTRACT` / `QNS_MAINNET_QNNS_ADDRESS` for `QNSCurrentOwnerResolver`, or an existing `QNS_NAME_RESOLVER_ADDRESS`.

First validate a candidate QNNS:

```bash
QNNS_CONTRACT=0x... EXAMPLE_QNS_NAME=alice npm run anchor:module:mainnet
npm run probe:qnns:mainnet
```

The QNNS probe accepts explicit QNNS/resolver candidates and additional scan addresses:

```bash
QNNS_CANDIDATES=0x... QNS_NAME_RESOLVER_CANDIDATES=0x... QNNS_SCAN_ADDRESSES=0x...,0x... npm run probe:qnns:mainnet
```

Then deploy the anchor registry or set the anchor only when ready:

```bash
DEPLOY_NAME_RESOLVER=true DEPLOY_ANCHOR_REGISTRY=true QNNS_CONTRACT=0x... npm run anchor:module:mainnet
SET_ANCHOR=true QNNS_CONTRACT=0x... QNS_NAME_RESOLVER_ADDRESS=0x... QNS_ANCHOR_REGISTRY_ADDRESS=0x... EXAMPLE_QNS_NAME=alice npm run anchor:module:mainnet
```

If a custom resolver already exists, skip the raw QNNS address:

```bash
QNS_NAME_RESOLVER_ADDRESS=0x... QNS_ANCHOR_REGISTRY_ADDRESS=0x... EXAMPLE_QNS_NAME=alice npm run anchor:module:mainnet
```

## Contract

| File | Description |
|------|-------------|
| `contracts/QNS.sol` | Name registry with commit-reveal, soulbound names, admin controls, heartbeat |

## Name Rules

- Lowercase letters (a-z), digits (0-9), hyphens (-), underscores (_)
- 1–64 characters
- Names are hashed with `keccak256` for on-chain storage

## License

MIT
