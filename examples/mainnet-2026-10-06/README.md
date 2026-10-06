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
| Block | 15874006, timestamp 2026-10-06T00:36:56Z |

## Check it

From the repository root. This needs Python 3, `curl`, and `pip install tanilo-receipt-verify`.

```
curl -sS https://tanilo.io/.well-known/jwks.json -o jwks.json
python3 examples/mainnet-2026-10-06/check.py
```

`check.py` does three things, in this order:

1. verifies the receipt's signature with `tanilo-receipt-verify` against `jwks.json`, and takes the `canonical_sha256` the verifier recomputes from the signed payload;
2. recomputes, offline, the path from that hash to the proof's root;
3. asks the contract named above, through `https://rpc.goat.network`, when that root was anchored.

Expected output:

```
signature: valid | canonical_sha256 recomputed by the verifier: sha256-67d3ddb5888ac75266974c3277987556fe5a36df97d32d014f6a5f279384c51f
path verifies offline: True
anchored 2026-10-06T00:36:56Z
```

The hash passed to the anchor check is the verifier's, never the proof's own `leaf`. The anchor check alone does not check the receipt's signature, and it does not check that a hash corresponds to the receipt you hold; step 1 does both.

## What this shows

The receipt's canonical payload existed by the block timestamp 2026-10-06T00:36:56Z, under the hash and chain assumptions. It does not establish when the signature was created or the receipt issued, or that the claim in the receipt is true. The signature check shows which key signed the receipt; associating that key with an issuer requires a key you have authenticated as the issuer's. Downloading the key set from `tanilo.io` in the command above is a convenience, not that authentication.

Step 3 relies on the RPC endpoint's answer for the contract's current `anchoredAt(root)`. It does not independently verify the transaction details in the proof, and it does not establish finality.

The proof's `tree_size` is 5: this batch held five hashes. Batch counts are omitted from the public index, and are not confidential.
