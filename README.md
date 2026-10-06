# tanilo-anchor

Proof of when for Tanilo receipts.

A Tanilo receipt is signed, and the signature shows which key signed it. A signature does not show *when*: the time inside a receipt is the issuer's own statement. Anchoring adds one thing. The hashes of a batch of receipts are combined into a Merkle tree, and the tree's 32-byte root is published in a transaction on GOAT Network. Each receipt then has a short inclusion proof. Anyone holding the receipt and its proof can show that the receipt's canonical bytes existed no later than the time of that block.

**Status: live on GOAT mainnet since 2026-10-06.** New Tanilo receipts from `/evaluate` and `/v1/verify-facts` are anchored through the contract below. GOAT's own documentation calls this network "Alpha Mainnet". The service is in free beta.

## What an anchor shows, and what it does not

| It shows | It does not show |
|---|---|
| The receipt's canonical bytes existed no later than the anchoring block's time. | Who issued the receipt. The signature shows which key signed it. |
| The receipt was in the batch whose root is on-chain: the path from its hash to the root can be recomputed offline. | That the claim in the receipt is true. |
| | That the receipt is not older than it says. An anchor bounds the time from above only. |

Only hashes are involved. A leaf is a receipt's `canonical_sha256`; the chain sees one 32-byte root per batch. No receipt content goes into a batch, a proof or a transaction.

How many receipts a batch holds is not published: see [What is public](#what-is-public).

## How it works

1. **Leaf.** A receipt's `canonical_sha256`: the SHA-256 of the RFC 8785 canonical bytes of its signed payload. It is the same value `tanilo-receipt-verify` recomputes.
2. **Tree.** RFC 6962 (Certificate Transparency) Merkle tree over SHA-256. A leaf hash is `SHA256(0x00 || digest)` and a node hash is `SHA256(0x01 || left || right)`. Leaves are in queue order; a hash appears once.
3. **Root on-chain.** `TaniloAnchor.anchor(root, leafCount, batchId)`. The contract stores the block time at which a root was first anchored, accepts roots only from one publisher address, and refuses a root that is already anchored, so a root's first time cannot be overwritten.
4. **Proof.** One `tanilo.anchor.v1` record per receipt: the leaf, its index, the tree size, the audit path, the root, and where the root was published.
5. **Batch file.** Each batch's ordered list of hashes is kept, and is given to anyone who holds a receipt in that batch, so that holder can rebuild the batch's proofs without depending on Tanilo keeping them.

```json
{
  "anchor_version": "tanilo.anchor.v1",
  "leaf": "sha256-<the receipt's canonical_sha256>",
  "leaf_hash_alg": "rfc6962-sha256",
  "leaf_index": 1,
  "tree_size": 3,
  "path": ["<64 hex>", "<64 hex>"],
  "root": "<64 hex>",
  "batch_id": "batch-<first 32 hex of the root>",
  "batched_at": "<when the batch was built, by the issuer's clock; not evidence>",
  "anchors": [
    { "kind": "evm-contract", "chain": "eip155:2345", "chain_id": 2345,
      "contract": "0xddCC4eb18b39a520b874046b91b748B5E8cE7C54",
      "publisher": "0x…", "tx_hash": "0x…", "block_number": 0, "block_hash": "0x…",
      "block_time": "<the evidential time>", "gas_used": "…", "effective_gas_price_wei": "…",
      "fee_native": "…", "explorer_tx": "https://explorer.goat.network/tx/0x…" }
  ]
}
```

`block_time` is the time that counts. `batched_at` is informational.

## What is public

| Public | Not public |
|---|---|
| For each batch: its id, root, transaction and block time (`GET /v1/anchor/batches`). | How many receipts a batch holds. The index and the status route carry no counts. |
| A receipt's proof, to anyone who has its `canonical_sha256` (`GET /v1/anchor/proof/{canonical_sha256}`). | The number passed to the contract as `leafCount`: the service sends 0, so the public event does not carry the batch size. |
| | A batch's list of hashes, except to someone who names a hash that is in it (`GET /v1/anchor/batches/{batch_id}?leaf={canonical_sha256}`). |

One thing cannot be hidden from a receipt's own holder: a proof carries `tree_size`, because an RFC 6962 path cannot be checked without it. So the holder of a receipt learns the size of that receipt's batch. The pattern of hours in which a batch exists at all is also visible to everyone.

Batches anchored on testnet before 2026-10-06 predate this: their sizes were public, and their on-chain events carry the real count. The mainnet example in `examples/mainnet-2026-10-06/` shows the size of its own batch (five), because a proof does.

## Checking a proof

Two steps, and they answer different questions.

**Offline: is this receipt under this root?** No network needed.

```
node scripts/verify-proof.mjs receipt.json receipt.anchor.json --offline
```

**On-chain: was this root published, and when?** Ask the contract you trust.

```
TANILO_ANCHOR_CONTRACT=0xddCC4eb18b39a520b874046b91b748B5E8cE7C54 \
  node scripts/verify-proof.mjs receipt.json receipt.anchor.json
```

The checker asks only the contract address **you** give it, never one the proof names by itself. The anchoring time is read from a contract, and an unknown contract could report any time it likes. A proof that names a different contract is reported as `indeterminate`.

In Python, with the standard library only (`python/tanilo_anchor_verify.py`; the same module is prepared for `tanilo-receipt-verify` 0.2.0, which is not released yet):

```python
from tanilo_anchor_verify import verify_anchor, evm_contract_lookup

lookup = evm_contract_lookup("https://rpc.goat.network",
                             trusted_contracts=["0xddCC4eb18b39a520b874046b91b748B5E8cE7C54"],
                             chain_id=2345)
a = verify_anchor(canonical_sha256, proof, {"evm-contract": lookup})
print(a.status, a.anchored_at)
```

Three outcomes, never an exception:

| Outcome | Meaning |
|---|---|
| `anchored` | The path verifies and the trusted contract holds the root. `anchored_at` is the block time. |
| `not_anchored` | The path does not verify, or the trusted contract was asked and does not hold the root. |
| `indeterminate` | The path verifies but publication was not confirmed: no lookup supplied, the RPC unreachable or on another chain, or a contract you did not list. |

Anchor status sits beside signature validity and is never folded into it. An anchored receipt with a bad signature is still invalid. A valid receipt with no anchor is still valid; it just has no time bound.

## The contract

`contracts/TaniloAnchor.sol`, 49 lines. `build/TaniloAnchor.json` is the committed build (solc 0.8.37, optimizer on, 981 bytes of runtime code).

| Network | Chain | Address | Status |
|---|---|---|---|
| GOAT Network (mainnet) | `eip155:2345` | `0xddCC4eb18b39a520b874046b91b748B5E8cE7C54` | **current**, since 2026-10-06; publisher `0x1C17bde3592DEa74Ef18c74061BF0E77E300aF96` |
| GOAT testnet3 | `eip155:48816` | `0x821b832D25d8E18BD3A761B935bfaf1c2F761D58` | historical: used for the pre-launch trial on 2026-10-05 |
| GOAT testnet3 | `eip155:48816` | `0x801fB569593ae8fd9E906059cA6d9e584F4Bc30b` | historical: retired on 2026-10-05; one batch, kept as an example |

The mainnet contract was deployed in transaction [`0xb05be04587d5b55778163f0c100504f8c3c0d945528099c2b4564dcfe7c1afb7`](https://explorer.goat.network/tx/0xb05be04587d5b55778163f0c100504f8c3c0d945528099c2b4564dcfe7c1afb7) (block 15873757, 2026-10-06T00:22:23Z). That transaction's input is exactly `bytecode` from `build/TaniloAnchor.json` followed by the publisher address.

The code at all three addresses is byte-identical to `deployedBytecode` in `build/TaniloAnchor.json`, and that build is reproducible from the source with solc 0.8.37. You can compare them yourself with `eth_getCode`.

The testnet contracts are history, not part of the service. Testnet batches are no longer listed or served by the API, and testnets can be reset. About the first testnet contract: Retired on 2026-10-05; no new roots will be anchored through it. Its anchored batch remains verifiable. The batch and its three proofs are in `examples/historical/testnet3-2026-10-05/`, unchanged, with a note on how they differ from what the code writes today. To check a proof from that batch on-chain, name that contract as the one you trust.

Publishing is guarded. `scripts/deploy.mjs` and `scripts/anchor-batch.mjs` default to testnet3 and refuse mainnet (`config/chains.json` lists it with `enabled: false`, and the code refuses chain 2345 unless `ALLOW_MAINNET=1`). `scripts/deploy-guarded.mjs` deploys to mainnet only after a typed confirmation. Checking a proof is read-only and works on any listed network.

## What is in this repository

```
contracts/TaniloAnchor.sol      the root registry
build/TaniloAnchor.json         its committed build (ABI and bytecode)
src/merkle.mjs                  RFC 6962 tree, audit paths, path verification
src/proof.mjs                   the tanilo.anchor.v1 record and its offline check
src/anchors/evm.mjs             publish and verify on an EVM chain (contract or calldata mode)
src/batcher.mjs                 batch by count or by time
scripts/                        guarded deploy, anchor a folder of receipts, verify a proof, make a wallet, make vectors, health check
python/tanilo_anchor_verify.py  the Python checker (standard library only)
vectors/merkle-proofs.json      78 valid and 15 invalid inclusion vectors (CC0-1.0)
ots/                            not in use: an OpenTimestamps step that needs public batch files
.github/workflows/              a manual trigger that asks the API to anchor what is queued
examples/receipts/              three published receipts used by the examples
examples/mainnet-2026-10-06/    a receipt anchored on mainnet, with its proof and the commands to check it
examples/historical/            the first testnet3 batch and its proofs, kept as written
docs/                           design notes; how to fund a mainnet wallet; the mainnet launch runbook
```

The service side (the queue that collects receipt hashes after signing, the batch route, and the lookups under `/v1/anchor`) lives in the Tanilo API, which is not open source. `src/merkle.mjs` and `src/proof.mjs` are the exact files the API uses to build trees and proofs.

## Tests

```
npm ci
npm test                         # 20 tests; the end-to-end ones start their own local chain
python3 python/test_vectors.py   # the Python checker against the Node-made vectors
python3 ots/test_stamp_batches.py
```

The end-to-end tests deploy the contract to a local Hardhat chain, anchor a batch, verify it, and check that a second anchoring of the same root, an anchoring from another address, and a proof naming an untrusted contract are all refused. A local chain is not GOAT: these tests say the code and the contract behave as written, not how GOAT behaves.

`npm audit` reports no known vulnerabilities for this dependency set (`ethers`, and `hardhat` 3 for tests only) as of 2026-10-05.

## OpenTimestamps (not in use)

`ots/stamp_batches.py` timestamps each published batch file with OpenTimestamps, as a second anchor that does not depend on GOAT. It needs the batch files to be public. They no longer are, because a public list of hashes shows how many receipts a batch holds. The script is kept for a later version that stamps the root only; the workflow no longer calls it.

It was tested with a stand-in for the `ots` command only and has not been run against the public calendars. (The earlier prototype did submit one root to the calendars, for the historical batch; that entry is still `pending` in those proofs and has not been upgraded.) That prototype used the `opentimestamps` npm package, which was removed because of unpatched vulnerabilities in its dependencies.

## Keys

The anchoring key is a dedicated key used for nothing else. It is read from the `GOAT_ANCHOR_PRIVATE_KEY` environment variable at the moment of use. Nothing in this repository prints, logs or stores it. `npm run new-wallet` creates one and prints only its address. Use a new wallet for mainnet, never the testnet one.

If the key leaks, an attacker can anchor roots of their own through the contract and spend its gas balance. They cannot change a root that is already anchored or its time. Rotate with `setPublisher`.

## Licence

Apache-2.0 (see `LICENSE` and `NOTICE`), copyright TK Collective LLC. The vectors are CC0-1.0. The contract file keeps its original MIT identifier; see `NOTICE`.

Contact: joe@tanilo.io
