# QNS Publish Spec

Draft status: working spec for refinement.

## Goal

Build an on-chain publishing platform tied to QNS/QNNS identity. The product should feel like a crypto-native Medium or Substack: creators publish long-form markdown posts under their QNS name, readers can comment on-chain, and followers can subscribe to updates.

The canonical current article and comment text must be readable from Quai contract state. Off-chain services may index, cache, search, notify, and render, but the official app should be able to reconstruct the current post/comment body from contract reads.

QNS Publish is not the base QNS website protocol. It is one topology loaded through the QNS module loader described in [qns-module-loader-spec.md](/Users/comp/code/soap/qns-payment-code/docs/qns-module-loader-spec.md). The underlying QNS layer should resolve a compact module anchor first, then let that module load a publish app, static site, redirect, component graph, or another supported topology.

## Existing QNS Anchor

The current QNNS contract already provides the identity primitive:

- `bytes32 nameHash = keccak256(abi.encodePacked(name))`
- `ownerOf(uint256(nameHash))` proves ownership of a QNNS name at publish time.
- `NameProfile.contentHash` can point to profile-level content, but should not be overloaded as a module anchor or full publishing database in v1.
- `QNSAnchorRegistry` is the canonical MVP website/app anchor store.
- `nostrPubkey`, `quaiAddress`, and `qiPaymentCode` remain profile/payment fields, not publishing state.

QNS Publish should be a separate contract that references the deployed QNNS contract for author/commenter identity verification. A QNS name can then anchor to a `QNSPublishModule` contract that tells wallets and gateways how to load the publishing UI and route author/post pages.

All `authorName` and `commenterName` values use the QNS Module Loader v1 name normalization rules:

- `1-64` bytes
- lowercase ASCII only
- allowed bytes: `a-z`, `0-9`, `-`, `_`
- no Unicode, IDNA, punycode decoding, dots, spaces, or slashes
- `nameHash = keccak256(abi.encodePacked(normalizedName))`

## Relationship To QNS Module Loader

The publish product should dogfood the general QNS module model:

1. User opens a QNS route such as `qns://alice/posts/hello` or `https://qns.app/alice/posts/hello`.
2. Loader resolves `alice` to a compact QNS module anchor.
3. Anchor points to a publish module or profile module.
4. Loader verifies the module manifest hash.
5. Publish renderer reads `QNSPublish` contract state.
6. Renderer reconstructs and verifies post/comment bodies from contract chunks.
7. Wallet permissions are scoped to the QNS origin, not to a generic gateway host.

This keeps publishing compatible with other QNS website topologies. A creator may later move their QNS anchor from a publish-only module to a richer component site that embeds the same publish archive without changing the post/comment contract.

## Design Decision

Use contract-state-backed content:

- Contract state stores post metadata and article markdown chunks.
- Contract state stores comment markdown directly, with a strict byte cap.
- Events announce metadata, hashes, edit/delete actions, and chunk storage progress.
- Events must not include full article or comment markdown in v1.
- The canonical frontend renders from contract views, not from logs.

This is more expensive than event-backed content, but it gives the product a stronger canonical rendering model: current content can be served through ordinary `eth_call`/Quai RPC state reads. Edits and deletes update the current app-visible contract state.

## Permanence Model

Contract-state-backed content supports real canonical edit/delete behavior for the app:

- An edited post points to the new current markdown chunks.
- A deleted post no longer returns current body chunks from the contract.
- An edited comment replaces the current comment markdown.
- A deleted comment clears the current comment markdown.

This does not erase publication history from the chain. Old bytes may remain recoverable from transaction calldata, archive nodes, historical state, traces, third-party indexers, screenshots, or other caches. The UI must warn users before publishing that edit/delete changes the canonical current version, not global historical availability.

## Cost Snapshot

Pricing is gas-price dependent. On June 22, 2026, a live `cyprus1` RPC query returned:

- Gas price: `23,023.53 gwei`
- Approximate cost per gas: `0.0000230235 QUAI`
- Latest block gas limit: `50,000,000`

Approximate body publish costs at that gas price:

| Markdown Size | Event Body | Contract State Body |
| ------------: | ---------: | ------------------: |
|         512 B |  ~1.2 QUAI |           ~9.9 QUAI |
|          1 KB |  ~1.5 QUAI |          ~18.3 QUAI |
|          4 KB |  ~3.3 QUAI |          ~68.7 QUAI |
|          8 KB |  ~5.6 QUAI |         ~135.3 QUAI |
|         16 KB |  ~9.9 QUAI |         ~262.4 QUAI |
|         32 KB | ~18.7 QUAI |         ~522.7 QUAI |

The chosen v1 direction is contract state body storage. Event body pricing remains useful only as a comparison point. The UI should show a live QUAI estimate before publishing. USD estimates should be dynamic and sourced at runtime; do not hardcode a QUAI/USD assumption into the protocol.

## Product Surface

Reader views:

- `/{name}`: QNS profile plus post list.
- `/{name}/{slug}`: canonical post route.
- `/post/{postId}`: immutable fallback route.
- Comments appear below posts and support threaded replies.

Creator views:

- `/write`: create a post under a QNNS name owned by the connected wallet.
- `/me/posts`: creator dashboard for drafts, published posts, edits, deleted posts, and hidden comments.
- `/me/subscribers`: off-chain subscriber list and notification preferences.

Commenter flow:

- Connect wallet.
- Optionally select a QNNS name owned by the wallet.
- Write markdown comment.
- Confirm transaction with estimated QUAI cost.

Subscription flow:

- Subscribe button on author profile and post pages.
- Free subscriptions are off-chain by default: wallet-signed opt-in, optional email verification, notification preferences stored by the app backend.
- Paid subscriptions can be added later as an optional on-chain membership contract.

## Contract: `QNSPublish`

### Constructor

```solidity
constructor(address qnnsAddress, address feeCollector)
```

### Constants

Initial recommended limits:

```solidity
uint32 public constant MAX_POST_BYTES = 32 * 1024;
uint32 public constant MAX_POST_CHUNK_BYTES = 4 * 1024;
uint32 public constant MAX_COMMENT_BYTES = 1024;
uint32 public constant MAX_TITLE_BYTES = 160;
uint32 public constant MAX_SLUG_BYTES = 96;
```

V1 should ship with a hard `32 KB` post cap. That keeps cleanup bounded to at most eight `4 KB` chunks and avoids gas surprises on edit/delete. Long-form posts can later be raised to `64 KB` or `128 KB` only if the contract adds batched cleanup for old content chunks.

Comments should start at `1 KB` because they are higher frequency and more spam-prone. Authors can choose stricter per-post comment settings, but not looser than the protocol max.

### Controller Model

Posts are controlled forever by the original publishing wallet.

Rules:

- At publish time, `msg.sender` must own the selected QNNS name.
- The contract stores the normalized `authorName`, `authorNameHash`, and `controller = msg.sender` on the post.
- Future post edits/deletes require `msg.sender == posts[postId].controller`.
- Future QNNS name transfers do not transfer control over old posts.
- Old posts remain attributed to the author name snapshot used at publish time.
- Slug uniqueness is per `authorNameHash` by default, so a later owner of the same transferred/re-registered name cannot overwrite an existing slug unless the protocol explicitly adds a namespace reset policy.
- Deleted posts permanently reserve their slug.
- Controller key rotation is supported through an explicit two-step handoff.

Comments are controlled forever by the original commenting wallet.

### State Structs

```solidity
struct Post {
    uint256 id;
    string authorName;
    bytes32 authorNameHash;
    address controller;
    string slug;
    string title;
    uint256 latestContentId;
    uint64 createdAt;
    uint64 updatedAt;
    uint64 deletedAt;
    uint256 editCount;
    uint256 commentCount;
    bool commentsEnabled;
    bool qnnsOnlyComments;
    uint32 maxCommentBytes;
}

struct Content {
    uint256 id;
    uint256 postId;
    bytes32 expectedCommitment;
    bytes32 rollingCommitment;
    bytes32 rawBodyHash;
    uint32 bodyBytes;
    uint32 bytesWritten;
    uint16 chunkCount;
    uint16 chunksWritten;
    bool finalized;
    bool deleted;
}

struct Comment {
    uint256 id;
    uint256 postId;
    uint256 parentCommentId;
    string commenterName;
    bytes32 commenterNameHash;
    address commenter;
    bytes markdown;
    bytes32 bodyHash;
    uint32 bodyBytes;
    uint64 createdAt;
    uint64 updatedAt;
    uint64 deletedAt;
    bool hiddenByPostAuthor;
}

struct AuthorStats {
    uint256 postCount;
    uint256 commentCount;
}
```

### Storage

```solidity
IQNNS public immutable qnns;
address public feeCollector;
uint256 public nextPostId;
uint256 public nextContentId;
uint256 public nextCommentId;

mapping(uint256 => Post) public posts;
mapping(uint256 => Content) public contents;
mapping(uint256 => Comment) public comments;
mapping(uint256 => mapping(uint16 => bytes)) internal contentChunks;
mapping(uint256 => address) public pendingControllerByPost;
mapping(bytes32 => uint256[]) internal postsByAuthor;
mapping(uint256 => uint256[]) internal commentsByPost;
mapping(uint256 => uint256[]) internal repliesByComment;
mapping(bytes32 => mapping(bytes32 => uint256)) public postIdByAuthorAndSlugHash;
mapping(bytes32 => AuthorStats) public authorStats;
```

### Events

Events should contain metadata only, not full markdown bodies.

```solidity
event PostStarted(
    uint256 indexed postId,
    uint256 indexed contentId,
    bytes32 indexed authorNameHash,
    address controller,
    string slug,
    string title,
    bytes32 rawBodyHash,
    bytes32 expectedCommitment,
    uint32 bodyBytes,
    uint16 chunkCount
);

event ContentChunkStored(
    uint256 indexed postId,
    uint256 indexed contentId,
    uint16 indexed chunkIndex,
    bytes32 chunkHash,
    uint32 chunkBytes
);

event PostFinalized(uint256 indexed postId, uint256 indexed contentId);

event PostEditStarted(
    uint256 indexed postId,
    uint256 indexed contentId,
    uint256 indexed editId,
    string title,
    bytes32 rawBodyHash,
    bytes32 expectedCommitment,
    uint32 bodyBytes,
    uint16 chunkCount
);

event PostEdited(uint256 indexed postId, uint256 indexed contentId, uint256 indexed editId);
event PostDeleted(uint256 indexed postId, address indexed controller);
event PostControllerTransferStarted(uint256 indexed postId, address indexed currentController, address indexed pendingController);
event PostControllerTransferred(uint256 indexed postId, address indexed previousController, address indexed newController);
event CommentPolicyUpdated(uint256 indexed postId, bool commentsEnabled, bool qnnsOnlyComments, uint32 maxCommentBytes);

event CommentPublished(
    uint256 indexed commentId,
    uint256 indexed postId,
    uint256 indexed parentCommentId,
    bytes32 commenterNameHash,
    address commenter,
    bytes32 bodyHash,
    uint32 bodyBytes
);

event CommentEdited(uint256 indexed commentId, address indexed commenter, bytes32 bodyHash, uint32 bodyBytes);
event CommentDeleted(uint256 indexed commentId, address indexed commenter);
event CommentHidden(uint256 indexed commentId, uint256 indexed postId, address indexed postController);
```

## Staged Content Integrity

Post markdown is written as ordered chunks. The contract should not concatenate the full body just to hash it. Instead, it enforces a rolling chunk commitment.

Client-side commitment construction:

```text
commitment_0 = bytes32(0)
commitment_i = keccak256(
  abi.encodePacked(
    commitment_(i - 1),
    uint16(chunkIndex),
    uint32(chunk.length),
    keccak256(chunk)
  )
)
expectedCommitment = commitment_n
rawBodyHash = keccak256(fullMarkdownBytes)
```

Contract append rule:

```solidity
nextCommitment = keccak256(
    abi.encodePacked(
        content.rollingCommitment,
        chunkIndex,
        uint32(chunk.length),
        keccak256(chunk)
    )
);
```

Rules:

- Chunks must be appended sequentially: `chunkIndex == content.chunksWritten`.
- Every chunk must be `> 0` and `<= MAX_POST_CHUNK_BYTES`.
- `bytesWritten + chunk.length <= bodyBytes`.
- On each append, store `contentChunks[contentId][chunkIndex] = chunk`.
- On each append, update `rollingCommitment`, `bytesWritten`, and `chunksWritten`.
- Finalization requires:
  - `chunksWritten == chunkCount`
  - `bytesWritten == bodyBytes`
  - `rollingCommitment == expectedCommitment`
- `rawBodyHash` is stored for frontend verification after chunks are read and concatenated.

This gives precise staged publish integrity without Merkle proofs or storing every chunk hash separately.

## Publish Post

Primary staged API:

```solidity
function beginPost(
    string calldata authorName,
    string calldata slug,
    string calldata title,
    bytes32 rawBodyHash,
    bytes32 expectedCommitment,
    uint32 bodyBytes,
    uint16 chunkCount
) external payable returns (uint256 postId, uint256 contentId);

function appendPostChunk(
    uint256 contentId,
    uint16 chunkIndex,
    bytes calldata markdownChunk
) external;

function finalizePost(uint256 contentId) external;
```

Rules:

- Normalize `authorName` before hashing.
- `authorNameHash = keccak256(abi.encodePacked(authorName))`.
- `qnns.ownerOf(uint256(authorNameHash)) == msg.sender`.
- Store `authorName` and `authorNameHash` on the post.
- Store `controller = msg.sender`.
- `slug` must be lowercase ASCII: `a-z`, `0-9`, `-`, `_`.
- `title` must be non-empty and below `MAX_TITLE_BYTES`.
- `bodyBytes > 0 && bodyBytes <= MAX_POST_BYTES`.
- `chunkCount > 0`.
- `(authorNameHash, keccak256(bytes(slug)))` must be unused.
- Initialize default comment policy: comments enabled, wallet-or-QNNS comments allowed, `MAX_COMMENT_BYTES` max.
- `appendPostChunk` and `finalizePost` require `msg.sender == posts[postId].controller`.
- The post should not become visible as published until `finalizePost` succeeds.

Optional convenience API for small posts:

```solidity
function publishPost(
    string calldata authorName,
    string calldata slug,
    string calldata title,
    bytes32 rawBodyHash,
    bytes32 expectedCommitment,
    bytes[] calldata chunks
) external payable returns (uint256 postId);
```

The convenience API computes the rolling commitment from `chunks`, compares it to `expectedCommitment`, stores `rawBodyHash` for client verification, and finalizes in one transaction.

## Edit Post

Edits replace the canonical current content. Historical versions are not preserved in active contract state by default.

```solidity
function beginPostEdit(
    uint256 postId,
    string calldata title,
    bytes32 rawBodyHash,
    bytes32 expectedCommitment,
    uint32 bodyBytes,
    uint16 chunkCount
) external payable returns (uint256 contentId, uint256 editId);

function appendPostEditChunk(
    uint256 contentId,
    uint16 chunkIndex,
    bytes calldata markdownChunk
) external;

function finalizePostEdit(uint256 contentId) external;
```

Rules:

- Only `posts[postId].controller` may edit.
- Edits use the same rolling commitment rules as initial publish.
- The currently rendered content does not change until the edit finalizes.
- On successful edit finalization:
  - Delete the previous active content chunks from current contract storage.
  - Mark the previous `Content` deleted/superseded.
  - Set `posts[postId].latestContentId = contentId`.
  - Update `title`, `updatedAt`, and `editCount`.
  - Emit `PostEdited`.
- V1 cleanup is bounded by `MAX_POST_BYTES = 32 KB` and `MAX_POST_CHUNK_BYTES = 4 KB`, so at most eight chunk entries are cleared. If the post cap is raised later, cleanup should move to a batched deletion flow.

The chain may still expose old markdown through transaction calldata or archival history.

## Delete Post

```solidity
function deletePost(uint256 postId) external;
```

Rules:

- Only `posts[postId].controller` may delete.
- Deletion clears the current active content chunks from current contract storage.
- Set `deletedAt`.
- Mark the latest `Content` deleted.
- Keep `postId`, author, slug, title, and timestamps for auditability and route tombstones.
- `getPostChunk` should revert or return empty for deleted content.
- Official frontend and indexer must not render deleted post bodies by default.

Deleted posts permanently keep occupying the slug. This prevents a deleted route from later rendering unrelated content under the same author namespace.

## Controller Handoff

Controller handoff supports key rotation without tying old posts to future QNNS name ownership.

```solidity
function proposePostController(uint256 postId, address newController) external;
function acceptPostController(uint256 postId) external;
```

Rules:

- Only `posts[postId].controller` may propose a new controller.
- `newController` must be nonzero.
- Store `pendingControllerByPost[postId] = newController`.
- Only the pending controller may accept.
- On accept, set `posts[postId].controller = msg.sender` and clear the pending controller.
- QNNS ownership is not required for controller acceptance because the post belongs to the original publishing wallet's authorship record, not the current name owner.

## Comment Policy

Authors can set comment policy per post.

```solidity
function setCommentPolicy(
    uint256 postId,
    bool commentsEnabled,
    bool qnnsOnlyComments,
    uint32 maxCommentBytes
) external;
```

Rules:

- Only `posts[postId].controller` may update comment policy.
- `maxCommentBytes` must be `> 0` and `<= MAX_COMMENT_BYTES`.
- New posts default to:
  - `commentsEnabled = true`
  - `qnnsOnlyComments = false`
  - `maxCommentBytes = MAX_COMMENT_BYTES`
- Comment policy changes affect future comments only.

## Publish Comment

Comments are stored directly in contract state because they are byte-capped.

```solidity
function publishComment(
    uint256 postId,
    uint256 parentCommentId,
    string calldata commenterName,
    bytes calldata markdown
) external payable returns (uint256 commentId);
```

Rules:

- `postId` must exist, `posts[postId].latestContentId` must be finalized, and the post must not be deleted.
- `posts[postId].commentsEnabled` must be true.
- If `parentCommentId != 0`, it must exist and belong to the same `postId`.
- If `commenterName` is non-empty, normalize it, compute `commenterNameHash`, and verify `qnns.ownerOf(uint256(commenterNameHash)) == msg.sender`.
- If `commenterName` is empty, store `commenterNameHash = bytes32(0)` and display the raw wallet address.
- If `posts[postId].qnnsOnlyComments` is true, `commenterName` must be non-empty and verified.
- Store the commenter name snapshot when one is provided.
- `markdown.length > 0 && markdown.length <= posts[postId].maxCommentBytes`.
- Store `markdown` in `comments[commentId].markdown`.
- Store `bodyHash = keccak256(markdown)`.
- Emit `CommentPublished` without the markdown body.

## Edit, Delete, Or Hide Comment

```solidity
function editComment(uint256 commentId, bytes calldata markdown) external;
function deleteComment(uint256 commentId) external;
function hideComment(uint256 commentId) external;
```

Rules:

- Only `comments[commentId].commenter` may edit or delete their comment.
- Edit replaces `comments[commentId].markdown`, `bodyHash`, `bodyBytes`, and `updatedAt`.
- Delete clears `comments[commentId].markdown` and sets `deletedAt`.
- Only the post controller may hide a comment from default rendering.
- Hidden comments remain readable from contract state unless also deleted by the commenter.
- UI should distinguish "deleted by commenter" from "hidden by author."

The chain may still expose old comment markdown through transaction calldata or archival history.

## Getter API

Recommended view functions:

```solidity
function getPost(uint256 postId) external view returns (Post memory);
function getContent(uint256 contentId) external view returns (Content memory);
function getPostChunk(uint256 postId, uint16 chunkIndex) external view returns (bytes memory);
function getContentChunk(uint256 contentId, uint16 chunkIndex) external view returns (bytes memory);
function getComment(uint256 commentId) external view returns (Comment memory);
function getCommentsByPost(uint256 postId, uint256 offset, uint256 limit) external view returns (uint256[] memory);
function getPostsByAuthor(bytes32 authorNameHash, uint256 offset, uint256 limit) external view returns (uint256[] memory);
```

The official frontend should use `getPostChunk(postId, chunkIndex)` for current canonical rendering. `getContentChunk` can be exposed for diagnostics or if historical active content versions are later supported.

## Markdown Rules

Supported MVP markdown:

- Headings
- Paragraphs
- Bold/italic
- Blockquotes
- Ordered and unordered lists
- Links
- Inline code
- Code blocks
- Images only if `https://`, `ipfs://`, or `ar://`

Disallowed or sanitized:

- Raw HTML
- Inline JavaScript
- Data URLs
- Unsafe image protocols
- Embedded iframes/scripts

The canonical markdown bytes are UTF-8. The frontend must render from verified bytes read from the contract, not from untrusted indexer HTML.

## Rendering Pipeline

1. Resolve route `/{name}/{slug}`.
2. Compute `authorNameHash` from `name`.
3. Compute `slugHash` from `slug`.
4. Read `postIdByAuthorAndSlugHash[authorNameHash][slugHash]`.
5. Read `posts[postId]`.
6. If `deletedAt != 0`, render a tombstone.
7. Read `contents[posts[postId].latestContentId]`.
8. Read chunks `0...chunkCount - 1` through `getPostChunk`.
9. Concatenate bytes.
10. Verify client-side:
    - Rolling commitment equals `expectedCommitment`.
    - `keccak256(fullMarkdownBytes) == rawBodyHash`.
    - Byte length equals `bodyBytes`.
11. Decode UTF-8.
12. Sanitize markdown.
13. Render.

Comments:

1. Read comment IDs for the post.
2. Read `comments[commentId]`.
3. Hide deleted comments or hidden comments by default.
4. Verify `keccak256(markdown) == bodyHash`.
5. Decode, sanitize, and render.

## Indexer Requirements

An indexer is not protocol-canonical, but it is required for a good UX.

Indexer responsibilities:

- Track authors, posts, edits, comments, and moderation events.
- Cache current rendered-safe markdown output.
- Provide search, feeds, pagination, notifications, and subscriber emails.
- Track incomplete staged posts/edits.
- Honor canonical edit/delete/hide state.

The canonical current post page should be recoverable from normal contract reads. Historical recovery of old edited/deleted bytes may require archive data and is not part of the official rendering path.

The indexer should wait for a configurable confirmation depth before sending subscriber notifications or treating posts as final in feeds.

## Plugins And Adapters

Plugins and adapters extend distribution, imports, notifications, and embeds. They must not control canonical QNS Publish state unless the post controller explicitly signs a QNS Publish transaction.

The core contract should not include a generic plugin registry in v1. Keep the contract focused on canonical posts/comments and expose enough metadata for adapters to build on top.

### Adapter Principles

- QNS Publish is canonical for current article/comment content.
- External networks are distribution surfaces or import sources.
- External comments/replies are not canonical QNS comments unless posted through `publishComment`.
- External edits/deletes do not mutate QNS content.
- QNS edits/deletes should be propagated by adapters where possible, but external networks may preserve old copies.
- Adapters must clearly label mirrored/imported/external content in the UI.
- Any adapter that submits an on-chain action must be authorized by the post/comment controller.

### Adapter Metadata

Adapters should track external references off-chain first:

```text
postId
adapterType: nostr | farcaster | activitypub | rss | custom
externalId
externalUrl
mode: canonical-link | teaser | full-mirror | import
createdAt
lastSyncedAt
status
```

A later contract version may add a lightweight metadata registry:

```solidity
function setExternalReference(
    uint256 postId,
    string calldata adapterType,
    string calldata externalId,
    string calldata externalUrl
) external;
```

If added, only `posts[postId].controller` may set or clear external references. V1 can leave this entirely off-chain.

### Nostr Adapter

QNS already stores a Nostr pubkey in the QNNS profile. The Nostr adapter should use that field for identity linking where available.

Supported modes:

- **Canonical link**: publish a Nostr note that links to the QNS post.
- **Teaser**: publish title, summary, canonical QNS URL, `postId`, and `rawBodyHash`.
- **Full mirror**: publish the full markdown as a Nostr long-form event. This is optional because it creates another durable copy outside QNS.
- **Import**: import a Nostr long-form article into QNS Publish after the user proves control of the Nostr key.

Recommended Nostr mapping:

- Long-form article: NIP-23 `kind:30023`.
- Article body: markdown.
- Slug: Nostr `d` tag mapped from QNS slug.
- Title: Nostr `title` tag.
- Published timestamp: Nostr `published_at` tag.
- QNS reference tags: include `qns:name`, `qns:postId`, `qns:bodyHash`, and canonical QNS URL where client conventions allow.
- Replies/comments: display Nostr replies in an "External discussion" tab unless the commenter posts on-chain through QNS Publish.

Nostr import rules:

- User provides a signed Nostr event.
- Adapter verifies the Nostr event signature.
- Adapter checks the importing wallet controls the QNS author name.
- User reviews markdown and publishes through QNS Publish.
- The resulting QNS post records the external Nostr event ID in adapter metadata.

### Farcaster Adapter

Farcaster should be treated primarily as a distribution and app surface.

Supported modes:

- **Share cast**: prompt the author to cast a link to the QNS article.
- **Mini App**: render QNS Publish as a Farcaster Mini App so users can read, subscribe, and open the publish/comment flow.
- **Embed**: expose OpenGraph/Farcaster metadata for rich article previews.
- **Import**: import a cast or long-form external content into QNS Publish only after user review and QNS controller transaction.

Farcaster adapter rules:

- QNS remains canonical for article/comment state.
- Farcaster casts are links, teasers, embeds, or mirrors.
- Farcaster replies are external discussion by default.
- Mini App notifications may be used for subscribers who add the app inside Farcaster, but subscription state remains app/backend state unless a future on-chain subscription contract is added.

### ActivityPub/RSS Adapter

These adapters are straightforward distribution layers:

- RSS feed per author: `/{name}/feed.xml`.
- RSS item points to the canonical QNS article URL and includes title, summary, timestamp, and body hash.
- ActivityPub actor per QNS name can publish article links or full mirrors.
- External ActivityPub replies are displayed separately unless bridged through on-chain QNS comments.

### Plugin Safety

- Never let adapters silently publish on-chain.
- Every on-chain post/edit/comment/import must go through wallet confirmation.
- Avoid full mirrors by default; prefer canonical links and teasers.
- Label external discussion separately from canonical on-chain comments.
- Do not promise external deletion; mirrors may remain available even after QNS canonical deletion.
- Rate-limit adapter-triggered notifications.
- Keep adapter failures non-fatal to canonical QNS reads.

## Subscriptions

### MVP: Off-Chain Free Subscriptions

Free subscriptions should not require a transaction.

Flow:

1. User connects wallet.
2. User clicks Subscribe.
3. App asks user to sign an EIP-191-style message:

```text
Subscribe to QNS Publish author:
authorNameHash: 0x...
subscriber: 0x...
timestamp: ...
nonce: ...
```

4. Backend stores subscription record.
5. Optional email verification links an email to the wallet subscription.
6. Notifications are sent after the indexer sees a finalized post beyond the confirmation threshold.

Subscription records must support unsubscribe, nonce replay protection, and privacy controls for wallet/email linkage.

### Later: Paid On-Chain Subscriptions

Add a separate `QNSSubscription` contract if paid memberships become important.

Potential model:

```solidity
function createTier(bytes32 authorNameHash, string calldata label, uint256 pricePerPeriod, uint64 periodSeconds) external;
function subscribe(bytes32 authorNameHash, uint256 tierId) external payable;
function cancel(bytes32 authorNameHash, uint256 tierId) external;
function subscriptionExpiresAt(bytes32 authorNameHash, uint256 tierId, address subscriber) external view returns (uint256);
```

Paid tier gating can then be enforced by frontend/indexer policy, or by publishing encrypted markdown where paid subscribers receive decryption access through a separate mechanism.

## Fees And Anti-Spam

The base chain fee may be enough for posts. Comments may need stronger anti-spam controls.

Options:

- No protocol fee: user only pays gas.
- Flat comment fee sent to post author.
- Flat comment fee burned.
- Author-configured comment fee.
- QNNS-name-only comments for stricter identity.
- Author allowlist/blocklist.
- Per-post comments enabled/disabled.
- Per-post QNNS-only comment mode.
- Per-post max comment size up to `MAX_COMMENT_BYTES`.
- Minimum wallet age or prior QNNS ownership requirement, enforced off-chain in UI only.

MVP recommendation:

- Posts: gas only.
- Comments: gas only with `MAX_COMMENT_BYTES = 1024`.
- Add author-level hide support.
- Add per-post comments enabled/disabled.
- Add per-post QNNS-only comments and max comment byte settings.
- Revisit explicit comment fees after observing spam.

## Security Considerations

- Verify QNNS ownership at initial publish time.
- Store original post controller and require it for all future post edits/deletes.
- Use two-step controller transfer for key rotation.
- Slugs must be unique per author.
- Slugs should be normalized before hashing.
- Deleted posts permanently reserve their slug.
- Enforce byte limits on-chain.
- Do not emit full markdown bodies in events.
- Use sequential chunk indexes and a rolling commitment for staged content.
- Reject duplicate, out-of-order, oversized, or missing chunks.
- Do not make delete/edit language imply global erasure from chain history.
- Never render unsanitized markdown.
- Make all cost estimates visible before wallet confirmation.
- The UI must warn users that on-chain publication can be permanent even when canonical state is later edited/deleted.

## Open Questions

- Should compression be supported in v1, or only raw UTF-8 markdown?
- Should edit history ever be opt-in preserved in current contract state, or should v1 always replace current content?
- Should comment fees go to the post author, burn, treasury, or nowhere?
- Should paid subscriptions be part of v1 or intentionally deferred?
- Should external adapter references stay off-chain in v1, or should we add `setExternalReference` to the first contract?

## Required Contract Tests

Before mainnet deployment, test at least:

- A QNNS owner can publish under their name.
- A non-owner cannot publish under someone else's QNNS name.
- `authorName` is normalized consistently before hashing.
- Post chunks must be sequential.
- Duplicate, missing, oversized, and out-of-order chunks revert.
- Finalization reverts when `rollingCommitment != expectedCommitment`.
- Finalization reverts when written bytes do not match `bodyBytes`.
- Published posts are not visible until finalized.
- The original publishing wallet can edit/delete after transferring the QNNS name away.
- The new QNNS name owner cannot edit/delete old posts.
- Deleted posts keep their slug reserved.
- Edit finalization switches `latestContentId` only after the new content finalizes.
- Deleted content no longer returns through canonical chunk getters.
- Controller handoff requires proposal by current controller and acceptance by pending controller.
- Comment policy rejects comments when disabled.
- QNNS-only comment policy rejects wallet-only comments.
- Per-post max comment byte policy is enforced.
- Commenter can edit/delete their own comment.
- Post controller can hide comments.
- Hidden comments remain in state unless commenter deletes them.
- Full markdown bodies are not emitted in events.
- Adapter-triggered on-chain imports require explicit wallet confirmation.
- External replies are not included in canonical comment getters.
- Nostr/Farcaster mirror failures do not affect canonical QNS reads.

## MVP Scope

1. `QNSPublish.sol` with post publish, staged chunks, finalize, edit, canonical delete, controller handoff, comment policy, comment, comment edit/delete, and author hide.
2. Contract-state-backed markdown body storage.
3. Metadata-only events for indexing.
4. SDK helpers for publishing, reconstructing, and verifying post/comment bodies.
5. Frontend routes for author profile posts and post detail.
6. Wallet-signed off-chain free subscriptions.
7. Off-chain adapter metadata for Nostr/Farcaster/RSS distribution.
8. Admin-free protocol by default, with only fee collector/configuration if needed.

## Non-Goals For V1

- Rich-text editor beyond markdown.
- Paid subscriptions.
- Encrypted subscriber-only posts.
- Global algorithmic feed.
- In-protocol search.
- Hard erasure from archival chain history.
- Full HTML publishing.
