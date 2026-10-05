"""Test for stamp_batches.py with a local fake API and a stand-in `ots` command.

    python3 ots/test_stamp_batches.py

STUB DISCLOSURE: no OpenTimestamps calendar is contacted. The stand-in `ots` only
writes a marker file, so this checks the script's bookkeeping (which files it
fetches, stamps, skips and upgrades), not OpenTimestamps itself.
"""
import json
import os
import pathlib
import shutil
import stat
import subprocess
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

HERE = pathlib.Path(__file__).resolve().parent
DOCS = {}
for n in (1, 2, 3):
    bid = "batch-" + format(n, "032x")
    DOCS[bid] = json.dumps({"anchor_version": "tanilo.anchor.v1", "kind": "batch", "batch_id": bid, "root": format(n, "064x"), "leaves": []}, separators=(",", ":"))
BAD = "batch-" + "f" * 32
DOCS[BAD] = json.dumps({"batch_id": BAD, "root": "00" * 32})


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_GET(self):
        if self.path.startswith("/v1/anchor/batches?"):
            rows = [{"batch_id": b, "root": json.loads(d)["root"] if b != BAD else "11" * 32} for b, d in DOCS.items()]
            rows.append({"batch_id": "../../etc/passwd", "root": "x"})
            body = json.dumps({"batches": rows, "next_before": None}).encode()
        else:
            body = DOCS[self.path.rsplit("/", 1)[1]].encode()
        self.send_response(200)
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main():
    srv = HTTPServer(("127.0.0.1", 0), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    tmp = pathlib.Path(tempfile.mkdtemp())
    work = tmp / "ots"
    work.mkdir()
    shutil.copy(HERE / "stamp_batches.py", work / "stamp_batches.py")
    fake = tmp / "ots-bin"
    fake.write_text('#!/bin/sh\nif [ "$1" = stamp ]; then printf pending > "$2.ots"; fi\nif [ "$1" = upgrade ]; then cp "$2" "$2.bak"; printf complete > "$2"; fi\n')
    fake.chmod(fake.stat().st_mode | stat.S_IEXEC)
    env = dict(os.environ, ANCHOR_API=f"http://127.0.0.1:{srv.server_address[1]}", OTS_BIN=str(fake))
    ok = True

    def check(cond, msg):
        nonlocal ok
        print(("PASS: " if cond else "FAIL: ") + msg)
        ok = ok and cond

    r1 = subprocess.run([sys.executable, str(work / "stamp_batches.py")], env=env, capture_output=True, text=True)
    files = sorted(p.name for p in (work / "batches").iterdir())
    check(r1.returncode == 1 and "skip " + BAD in r1.stdout, "a document that does not match the index is skipped and the run reports a failure")
    check(files == sorted([f"{b}.json" for b in DOCS if b != BAD] + [f"{b}.json.ots" for b in DOCS if b != BAD]), f"three batch files and three .ots files, nothing else ({len(files)} files)")
    check(all((work / "batches" / f"{b}.json").read_text() == d for b, d in DOCS.items() if b != BAD), "each batch file is byte-identical to what the API served")
    check(not (tmp / "etc").exists() and all(p.name.startswith("batch-") for p in (work / "batches").iterdir()), "an index entry with a path in its id is ignored")
    check("stamped 3, upgraded 3, failed 1" in r1.stdout, f"counts reported ({r1.stdout.strip().splitlines()[-1]})")
    r2 = subprocess.run([sys.executable, str(work / "stamp_batches.py")], env=env, capture_output=True, text=True)
    check("stamped 0, upgraded 0" in r2.stdout, "a second run stamps nothing again and changes nothing")
    check(not list((work / "batches").glob("*.bak")), "no .bak files are left behind")
    srv.shutdown()
    shutil.rmtree(tmp)
    print("ALL PASS" if ok else "FAILED")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
