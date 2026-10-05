"""Optional second anchor: OpenTimestamps over each published batch file.

For every batch in the public index that has no file here yet, download the batch
document exactly as published, save it as ots/batches/<batch_id>.json, and run
`ots stamp` on it. For every .ots file here that is not complete yet, run
`ots upgrade` (a timestamp is complete once a Bitcoin block commits to it, usually
within hours).

What this adds: a commitment to the batch file's bytes that does not depend on GOAT.
The batch file lists the root and every receipt hash in the batch, so anyone holding
it and its .ots can check it with the standard `ots verify`.

Uses the maintained Python client (`pip install opentimestamps-client`), called as the
`ots` command. No key or secret is involved. Only public batch files are sent to the
calendars, and only their SHA-256.

    ANCHOR_API=https://api.tanilo.io python3 ots/stamp_batches.py
"""
import json
import os
import pathlib
import re
import subprocess
import sys
import urllib.request

API = (os.environ.get("ANCHOR_API") or "https://api.tanilo.io").rstrip("/")
OTS = os.environ.get("OTS_BIN") or "ots"
DIR = pathlib.Path(__file__).resolve().parent / "batches"
BATCH_ID = re.compile(r"^batch-[0-9a-f]{32}$")
MAX_PAGES = int(os.environ.get("OTS_MAX_PAGES") or 5)


def get(url):
    req = urllib.request.Request(url, headers={"accept": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def main():
    DIR.mkdir(parents=True, exist_ok=True)
    stamped = upgraded = failed = 0
    before = None
    for _ in range(MAX_PAGES):
        page = json.loads(get(f"{API}/v1/anchor/batches?limit=100" + (f"&before={before}" if before else "")))
        for b in page.get("batches", []):
            bid = b.get("batch_id")
            if not isinstance(bid, str) or not BATCH_ID.match(bid):
                continue
            f = DIR / f"{bid}.json"
            if f.exists():
                continue
            raw = get(f"{API}/v1/anchor/batches/{bid}")
            doc = json.loads(raw)
            if doc.get("batch_id") != bid or doc.get("root") != b.get("root"):
                print(f"skip {bid}: the document does not match the index")
                failed += 1
                continue
            f.write_bytes(raw)
            r = subprocess.run([OTS, "stamp", str(f)], capture_output=True, text=True)
            if r.returncode != 0 or not pathlib.Path(str(f) + ".ots").exists():
                print(f"stamp failed for {bid}: {r.stderr.strip()[:200]}")
                f.unlink()
                failed += 1
                continue
            stamped += 1
        before = page.get("next_before")
        if not before:
            break
    for o in sorted(DIR.glob("*.json.ots")):
        was = o.read_bytes()
        subprocess.run([OTS, "upgrade", str(o)], capture_output=True, text=True)
        bak = pathlib.Path(str(o) + ".bak")
        if bak.exists():
            bak.unlink()
        if o.read_bytes() != was:
            upgraded += 1
    print(f"stamped {stamped}, upgraded {upgraded}, failed {failed}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
