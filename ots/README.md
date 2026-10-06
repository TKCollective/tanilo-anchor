# Not in use

`stamp_batches.py` downloads every batch file from the public batch index and timestamps it with OpenTimestamps.
Batch files are no longer public (a public list of hashes shows how many receipts a batch holds), so this script
cannot fetch them and the workflow no longer calls it. It is kept for a later version that stamps the root only.

`test_stamp_batches.py` still passes: it runs the script against a local stand-in for the API and for the `ots` command.
