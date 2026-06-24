# QNNS Subgraph

Indexes the deployed QNNS registry for fast owner-to-domain reads, and the
`QNSAnchorRegistry` for publications (which module each name currently anchors).
Contract reads remain the source of truth for writes and verification.

Data sources:

- **QNNS** — `Domain` / `Account` / `Auction` / `DomainEvent` (names, ownership, profiles).
- **QNSAnchorRegistry** — `Publication` (a module anchored to a name, from
  `AnchorSet` / `AnchorCleared`). Powers the publishing feed without scanning logs.

Note: set the `QNSAnchorRegistry` `startBlock` in `subgraph.yaml` to the registry's
actual deploy block (currently the QNNS launch block as a safe floor).

Target endpoint after deploy:

```txt
https://graph.quai.network/subgraphs/name/qns/qnns
```

Build and deploy with a Graph CLI environment:

```sh
graph codegen indexer/subgraph.yaml
graph build indexer/subgraph.yaml
graph create qns/qnns --node <graph-admin-url>
graph deploy qns/qnns --node <graph-admin-url> --ipfs <ipfs-url> indexer/subgraph.yaml
```

Frontend reads from `NEXT_PUBLIC_QNS_SUBGRAPH_URL` when set, otherwise it uses
the default endpoint above and falls back to direct RPC event scanning if the
subgraph is unavailable.
