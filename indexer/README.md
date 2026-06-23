# QNNS Subgraph

Indexes the deployed QNNS registry for fast owner-to-domain reads. Contract reads
remain the source of truth for writes and verification.

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
