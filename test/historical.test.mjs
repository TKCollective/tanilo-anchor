// The first testnet3 batch (examples/historical/testnet3-2026-10-05) is kept as written. Its proofs must keep
// verifying offline, against the receipts in examples/receipts, for as long as this repository exists.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verifyProofOffline } from '../src/proof.mjs';
import { rootOf, digestToBytes } from '../src/merkle.mjs';
import { canonicalSha256OfEnvelope } from '../src/receipt.mjs';

const dir = new URL('../examples/historical/testnet3-2026-10-05/', import.meta.url);
const names = ['evaluate-demo-2026-09-30', 'evaluate-demo-2026-10-02', 'sample_receipt_attached_jws'];
const ROOT = 'bc014ab6e6295dbf4eaa685e23df922cb555ecc830aff3b846e35672bd3f9599';
const OLD_CONTRACT = '0x801fB569593ae8fd9E906059cA6d9e584F4Bc30b';

test('historical testnet3 proofs verify offline against the example receipts', () => {
  const hashes = names.map((n) => canonicalSha256OfEnvelope(JSON.parse(readFileSync(new URL(`../examples/receipts/${n}.json`, import.meta.url), 'utf8'))));
  assert.equal(rootOf(hashes.map(digestToBytes)).toString('hex'), ROOT);
  names.forEach((n, i) => {
    const proof = JSON.parse(readFileSync(new URL(`${n}.anchor.json`, dir), 'utf8'));
    assert.deepEqual(verifyProofOffline(proof, hashes[i]), { ok: true, reason: null, root: ROOT });
    assert.equal(proof.leaf_index, i);
    const evm = proof.anchors.find((a) => a.kind === 'evm-contract');
    assert.equal(evm.contract, OLD_CONTRACT);
    assert.equal(evm.chain, 'eip155:48816');
    assert.equal(evm.tx_hash, '0xdd231627808cee501127efb5627235debefe610522bf8dec9c488c7cde6d0492');
    assert.equal(evm.block_time, '2026-10-05T02:45:33.000Z');
    assert.equal(verifyProofOffline(proof, hashes[(i + 1) % 3]).ok, false);
  });
});
