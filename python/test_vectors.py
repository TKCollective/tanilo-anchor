"""Runs the standalone Python checker over vectors/merkle-proofs.json (written by the Node implementation).

    python3 python/test_vectors.py

tanilo_anchor_verify.py is a byte-identical copy of tanilo_receipt_verify/anchor.py
in TKCollective/tanilo-receipt-verify, where the full test suite lives.
"""
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from tanilo_anchor_verify import verify_anchor  # noqa: E402

V = json.loads((pathlib.Path(__file__).resolve().parent.parent / "vectors" / "merkle-proofs.json").read_text())
bad = []
for v in V["valid"]:
    r = verify_anchor(v["canonical_sha256"], v["proof"])
    if not (r.merkle_ok is True and r.root == v["proof"]["root"] and r.status == "indeterminate"):
        bad.append(v["name"])
for v in V["invalid"]:
    r = verify_anchor(v["canonical_sha256"], v["proof"], {"evm-contract": lambda root, rec: {"status": "confirmed"}})
    if not (r.status == "not_anchored" and r.merkle_ok is False):
        bad.append(v["name"])
print(f"{len(V['valid'])} valid and {len(V['invalid'])} invalid vectors checked; {len(bad)} disagreements")
if bad:
    print("DISAGREE:", bad)
    sys.exit(1)
