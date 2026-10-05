import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { rootOf, inclusionProof, verifyInclusion, rootFromProof, leafHash, nodeHash, digestToBytes } from '../src/merkle.mjs';
import { makeProofRecord, verifyProofOffline } from '../src/proof.mjs';

const sha = (...p) => { const h = createHash('sha256'); p.forEach((x) => h.update(x)); return h.digest(); };
const leaves = (n) => Array.from({ length: n }, (_, i) => sha(Buffer.from(`receipt-${i}`)));

test('RFC 6962 shapes: empty, single, two, three', () => {
  assert.equal(rootOf([]).toString('hex'), sha().toString('hex'));
  const [a, b, c] = leaves(3);
  assert.ok(rootOf([a]).equals(leafHash(a)));
  assert.ok(rootOf([a, b]).equals(nodeHash(leafHash(a), leafHash(b))));
  assert.ok(rootOf([a, b, c]).equals(nodeHash(nodeHash(leafHash(a), leafHash(b)), leafHash(c))));
});

test('leaf and node hashing are domain separated', () => {
  const [a, b] = leaves(2);
  // A node hash can never collide with a leaf hash of the concatenation because of the prefix byte.
  assert.notEqual(nodeHash(a, b).toString('hex'), leafHash(Buffer.concat([a, b])).toString('hex'));
});

test('every leaf of trees sized 1..70 has a verifying proof and tampering fails', () => {
  for (let n = 1; n <= 70; n++) {
    const L = leaves(n);
    const root = rootOf(L);
    for (let i = 0; i < n; i++) {
      const p = inclusionProof(L, i);
      assert.ok(verifyInclusion(L[i], i, n, p, root), `n=${n} i=${i}`);
      // wrong leaf
      assert.ok(!verifyInclusion(sha(Buffer.from('x')), i, n, p, root));
      // wrong index (when it changes the path shape or sibling order)
      if (n > 1) assert.ok(!verifyInclusion(L[i], (i + 1) % n, n, p, root) || n === 1);
      // truncated / extended path
      if (p.length) assert.equal(rootFromProof(L[i], i, n, p.slice(1)), null);
      assert.equal(rootFromProof(L[i], i, n, [...p, p[0] ?? root]), null);
    }
  }
});

test('proof record round-trips through the offline verifier', () => {
  const canon = ['sha256-' + sha(Buffer.from('r1')).toString('hex'), 'sha256-' + sha(Buffer.from('r2')).toString('hex'), 'sha256-' + sha(Buffer.from('r3')).toString('hex')];
  const L = canon.map(digestToBytes);
  const root = rootOf(L);
  const rec = makeProofRecord({ canonicalSha256: canon[2], leafIndex: 2, treeSize: 3, auditPath: inclusionProof(L, 2), root, batchId: 'b', batchedAt: 'now', anchors: [] });
  assert.deepEqual(verifyProofOffline(rec, canon[2]), { ok: true, reason: null, root: root.toString('hex') });
  assert.equal(verifyProofOffline(rec, canon[0]).ok, false);
  assert.equal(verifyProofOffline({ ...rec, root: 'ff'.repeat(32) }).ok, false);
  assert.equal(verifyProofOffline({ ...rec, anchor_version: 'x' }).ok, false);
  assert.equal(verifyProofOffline(null).ok, false);
  assert.equal(verifyProofOffline({ ...rec, path: 'nope' }).ok, false);
});

test('digestToBytes accepts tanilo sha256- form and rejects junk', () => {
  assert.equal(digestToBytes('sha256-' + 'ab'.repeat(32)).length, 32);
  assert.throws(() => digestToBytes('sha256-' + 'AB'.repeat(32)));
  assert.throws(() => digestToBytes('sha256-abc'));
});
