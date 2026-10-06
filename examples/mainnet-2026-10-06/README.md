# Example: a receipt anchored on GOAT mainnet (6 October 2026)

`receipt.json` is a test receipt issued by Tanilo's live `POST /v1/verify-facts` on 2026-10-06 (a `regex_match` check on a test string; it says nothing about any customer). `proof.anchor.json` is its `tanilo.anchor.v1` proof, exactly as `GET /v1/anchor/proof/{canonical_sha256}` returned it.

| | |
|---|---|
| Receipt hash (`canonical_sha256`) | `sha256-67d3ddb5888ac75266974c3277987556fe5a36df97d32d014f6a5f279384c51f` |
| Network | GOAT Network, `eip155:2345` |
| Contract | `0xddCC4eb18b39a520b874046b91b748B5E8cE7C54` |
| Batch | `batch-326302795a1ce8be3447e02a30158e43` |
| Root | `326302795a1ce8be3447e02a30158e43b0ab7bded209eaeb3036cff340318bc7` |
| Transaction | `0x8d5d2db89fe694d1b04c98f72bdf961876008b79bb1c6864047025984233ffce` |
| Block | 15874006, at 2026-10-06T00:36:56Z |

Check it, from the repository root:

```
# offline: the receipt's hash is recomputed from its signed payload, and the path is recomputed to the root
node scripts/verify-proof.mjs examples/mainnet-2026-10-06/receipt.json examples/mainnet-2026-10-06/proof.anchor.json --offline

# against the chain, with the standard library only
python3 - <<'PY'
import json, sys
sys.path.insert(0, "python")
from tanilo_anchor_verify import verify_anchor, evm_contract_lookup
proof = json.load(open("examples/mainnet-2026-10-06/proof.anchor.json"))
lookup = evm_contract_lookup("https://rpc.goat.network", trusted_contracts=["0xddCC4eb18b39a520b874046b91b748B5E8cE7C54"], chain_id=2345)
a = verify_anchor(proof["leaf"], proof, {"evm-contract": lookup})
print(a.status, a.anchored_at)
PY
```

Expected: `"ok": true` from the first, and `anchored 2026-10-06T00:36:56Z` from the second.

What this shows: the receipt existed by 2026-10-06T00:36:56Z. It does not show when the receipt was issued, who issued it (check the signature with `tanilo-receipt-verify` for that), or that the claim in it is true.

The proof's `tree_size` is 5: this batch held five hashes. Batch sizes are otherwise not published.
