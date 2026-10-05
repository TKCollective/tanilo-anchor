# Historical example: the first testnet3 batch (5 October 2026)

These four files are kept exactly as they were written on 2026-10-05. They are a record, not a template.

| | |
|---|---|
| Network | GOAT testnet3, `eip155:48816` |
| Contract | `0x801fB569593ae8fd9E906059cA6d9e584F4Bc30b` (retired) |
| Publisher | `0x4151115C0C7c40a9F79d4e91d9F81986CeF5657c` |
| Transaction | `0xdd231627808cee501127efb5627235debefe610522bf8dec9c488c7cde6d0492` |
| Block | 17232424, at 2026-10-05T02:45:33Z |
| Root | `bc014ab6e6295dbf4eaa685e23df922cb555ecc830aff3b846e35672bd3f9599` |
| Leaves | the three receipts in `examples/receipts/`, in file-name order |

**Retired on 2026-10-05; no new roots will be anchored through it. Its anchored batch remains verifiable.** The contract still answers `anchoredAt(root)` with the block time, and the three proofs here still recompute to the root. To check them on-chain, name this contract as the one you trust:

```
TANILO_ANCHOR_CONTRACT=0x801fB569593ae8fd9E906059cA6d9e584F4Bc30b \
  node scripts/verify-proof.mjs examples/receipts/evaluate-demo-2026-10-02.json \
  examples/historical/testnet3-2026-10-05/evaluate-demo-2026-10-02.anchor.json
```

New testnet anchors go through `0x821b832D25d8E18BD3A761B935bfaf1c2F761D58`.

**Differences from what the code writes today.**

- `batch_id` is time-based (`batch-2026-10-05T02-45-30-174Z-12c38687`). Today a batch id is derived from the root.
- The batch file is in the earlier prototype's shape (`batchId`, `receiptIds`), not today's batch document.
- Each proof carries a second anchor entry of kind `opentimestamps` with status `pending`. It was made by the earlier prototype, which submitted the root to the public OpenTimestamps calendars. It has not been upgraded or verified since. Today's checkers do not know that kind and report that entry as indeterminate; they do not treat it as a failure.

**Testnet.** Testnets can be reset. If testnet3 is reset, the on-chain half of this example can no longer be confirmed; the offline half still can.
