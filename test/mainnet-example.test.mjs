// The mainnet example (examples/mainnet-2026-10-06) must keep verifying offline: the hash recomputed from
// the receipt's signed payload is the proof's leaf, and the path recomputes to the anchored root.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verifyProofOffline } from '../src/proof.mjs';
import { canonicalSha256OfEnvelope } from '../src/receipt.mjs';

test('mainnet example: receipt hash from the signed payload, proof to the anchored root', () => {
  const dir = new URL('../examples/mainnet-2026-10-06/', import.meta.url);
  const receipt = JSON.parse(readFileSync(new URL('receipt.json', dir), 'utf8'));
  const proof = JSON.parse(readFileSync(new URL('proof.anchor.json', dir), 'utf8'));
  const h = canonicalSha256OfEnvelope(receipt);
  assert.equal(h, 'sha256-67d3ddb5888ac75266974c3277987556fe5a36df97d32d014f6a5f279384c51f');
  assert.equal(h, receipt.canonical_sha256);
  assert.deepEqual(verifyProofOffline(proof, h), { ok: true, reason: null, root: '326302795a1ce8be3447e02a30158e43b0ab7bded209eaeb3036cff340318bc7' });
  const a = proof.anchors[0];
  assert.equal(a.chain, 'eip155:2345');
  assert.equal(a.contract, '0xddCC4eb18b39a520b874046b91b748B5E8cE7C54');
  assert.equal(a.tx_hash, '0x8d5d2db89fe694d1b04c98f72bdf961876008b79bb1c6864047025984233ffce');
  assert.equal(a.block_time, '2026-10-06T00:36:56.000Z');
});
