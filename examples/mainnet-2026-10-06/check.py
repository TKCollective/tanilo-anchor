"""Check the mainnet example: signature first, then the anchor. Run from the repository root:

    curl -sS https://tanilo.io/.well-known/jwks.json -o jwks.json
    python3 examples/mainnet-2026-10-06/check.py

Needs: pip install tanilo-receipt-verify
"""
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent.parent / "python"))

from tanilo_receipt_verify import verify
from tanilo_anchor_verify import verify_anchor, evm_contract_lookup

CONTRACT = "0xddCC4eb18b39a520b874046b91b748B5E8cE7C54"   # the contract you trust

receipt = json.load(open(HERE / "receipt.json"))
jwks = json.load(open("jwks.json"))                       # a key set you have authenticated as the issuer's
proof = json.load(open(HERE / "proof.anchor.json"))

# 1. The signature, and the hash recomputed from the signed payload.
r = verify(receipt, jwks_by_issuer={"https://tanilo.io/.well-known/jwks.json": jwks})
print("signature:", r.status, "| canonical_sha256 recomputed by the verifier:", r.canonical_sha256)
if r.status != "valid":
    sys.exit("the receipt did not verify; stopping before the anchor check")

# 2. Offline: the path from the verifier's hash (never the proof's own leaf) to the proof's root.
print("path verifies offline:", verify_anchor(r.canonical_sha256, proof).merkle_ok)

# 3. Against the chain: the trusted contract's current anchoredAt(root), as the RPC endpoint reports it.
lookup = evm_contract_lookup("https://rpc.goat.network", trusted_contracts=[CONTRACT], chain_id=2345)
a = verify_anchor(r.canonical_sha256, proof, {"evm-contract": lookup})
print(a.status, a.anchored_at)
