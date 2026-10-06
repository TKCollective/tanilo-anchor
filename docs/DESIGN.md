# Design notes

## Choices

| Choice | Decision | Why |
|---|---|---|
| Hash function | SHA-256 everywhere, not keccak | It matches `canonical_sha256` and needs nothing beyond a standard library to check. |
| Tree | RFC 6962, with leaf prefix `0x00` and node prefix `0x01`, split at the largest power of two below the size | Well specified, no leaf duplication, safe against second-preimage tricks, and the audit-path check is published. |
| Leaf | The receipt's `canonical_sha256`, verbatim | The proof binds to the value the signature verifier already outputs. |
| Leaf order | Queue order, each hash once | Order carries no meaning. |
| Batch id | `batch-` plus the first 32 hex digits of the root | A batch rebuilt after a failure gets the same id. |
| Publication | A contract call, not raw calldata | One `eth_call` answers "is this root anchored, and when". The contract accepts roots from one address only and never overwrites a root's first time. |
| Trigger | A recurring scheduled call | A run with nothing queued sends no transaction; a run sends one transaction per batch of up to 1,000 hashes. |

## Gas

Measured on a local EVM (Hardhat), not on GOAT:

| Operation | Gas |
|---|---|
| Deploy `TaniloAnchor` (once) | 290,935 |
| `anchor(root, leafCount, batchId)` | 71,792 to 71,804 |
| Calldata-only transaction, 48-byte payload | 22,710 to 22,740 |

On GOAT testnet3 on 2026-10-05: deploying the contract used 290,923 gas, the one batch anchored through the first contract used 71,804, and a gas estimate for `anchor()` was 72,672. The contract path costs about three times the calldata path per batch and is the one used, for the reasons in the table above.

## What the service does (in the Tanilo API)

1. After a receipt is signed, its `canonical_sha256` and the time go on a queue. Nothing else about the receipt is queued. A cached reply that replays an earlier receipt queues nothing.
2. A scheduled call drains the queue: up to 1,000 hashes per batch, leaving out any hash that already has a proof.
3. The root is anchored with one transaction (the leaf count sent to the contract is 0), and the batch document and a pointer per hash are stored, under a prefix for that network.
4. Before the transaction is sent, the exact batch (its ordered hashes, its root, and a fingerprint of the queue entries it was built from) is saved as the pending batch. Only after the batch is stored is the queue trimmed, in the same storage transaction that clears the pending record. A failure before the transaction leaves the hashes queued for the next run.
5. A run that stopped after its transaction and before the batch was stored is finished by the next run, with exactly the saved hashes, whatever has been queued since: that run asks the contract whether the saved root is already anchored, finds that it is, rebuilds the record from the chain and sends no second transaction. Hashes queued in the meantime go into the next batch. This case, with new hashes arriving in between, is covered by a test in the service's own suite (the service is not open source, so that test is not in this repository); the same test shows the earlier version of the code sending a second transaction for a merged batch, which is the defect this fixed.
6. A proof is computed on request from the batch document and checked before it is returned.

## Limits worth knowing

- **Upper bound only.** An anchor shows the canonical payload existed by the block's timestamp. It says nothing about how much earlier it existed, or about when the signature was made.
- **Delay, and no promised interval.** A queued hash has no proof until a later batch is anchored and stored. The lookup cannot tell "not anchored yet" from "never queued".
- **Best-effort queueing.** If the queue cannot be reached when a receipt is signed, the receipt is still returned and that receipt gets no anchor unless it is queued again.
- **Tree size.** The audit path, not the stated `tree_size`, is what the root commits to. A wrong `tree_size` that changes the path's shape fails; one that keeps the same shape recomputes the same root.
- **Finality.** GOAT documents fast sequencer confirmation and later publication to Bitcoin. A block timestamp is the chain's statement of when the block was made. The checkers read the contract's current state through an RPC endpoint; they do not establish finality, and a reorganization can change or remove a confirmation.
- **Testnets reset.** A proof that points at a reset chain can no longer be confirmed.
- **Scheduler.** GitHub's scheduled workflows are best effort: in this repository's first day, 2 of about 19 hourly runs started. They are also switched off in a public repository after 60 days without activity. The scheduled call now comes from a Vercel Cron entry in the API's configuration, once a day (that plan's limit); the workflow is a manual trigger.
- **Proof custody.** Roots alone are not enough to rebuild proofs; the batch files are. A batch file is given to anyone who names a hash that is in that batch, so a holder can keep it.
- **Batch sizes are not confidential.** Batch counts are omitted from the public index and the on-chain count field is set to zero (that 0 is itself public). But a proof carries `tree_size`, and anyone with a hash from a batch can retrieve its ordered hash list, so anyone with one hash can learn that batch's size. Keeping sizes confidential would need padding every batch to a fixed size with random leaves and not serving hash lists. Not done.

## Open question

Whether to add a batch statement signed by the Tanilo receipt key (root, tree size, batch id, transaction). That would tie a batch to the issuer's key rather than only to the publisher address. Not done.
