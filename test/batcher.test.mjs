import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createBatcher } from '../src/batcher.mjs';
import { verifyProofOffline } from '../src/proof.mjs';

const canon = (s) => 'sha256-' + createHash('sha256').update(s).digest('hex');
const fakeAnchor = (kind, fail = false) => ({
  kind, published: [],
  async publish(root, meta) { if (fail) throw new Error('down'); this.published.push({ root: root.toString('hex'), ...meta }); return { kind, root: root.toString('hex'), ...meta }; },
  async verify() { return { status: 'confirmed' }; },
});

test('flushes at maxLeaves and emits a verifying proof per receipt', async () => {
  const a = fakeAnchor('fake');
  const batches = [];
  const b = createBatcher({ anchors: [a], maxLeaves: 4, maxAgeMs: 0, onBatch: async (r) => batches.push(r) });
  const hashes = ['a', 'b', 'c', 'd', 'e'].map(canon);
  for (const h of hashes) await b.add(h, h.slice(7, 15));
  assert.equal(batches.length, 1);
  assert.equal(batches[0].leafCount, 4);
  assert.equal(b.size(), 1);
  for (const p of batches[0].proofs) assert.equal(verifyProofOffline(p, p.leaf).ok, true, p.leaf);
  assert.equal(batches[0].proofs[0].anchors[0].kind, 'fake');
  await b.flush();
  assert.equal(batches.length, 2);
  assert.equal(batches[1].leafCount, 1);
});

test('duplicate receipts occupy one leaf', async () => {
  const b = createBatcher({ anchors: [fakeAnchor('fake')], maxLeaves: 100, maxAgeMs: 0 });
  await b.add(canon('x')); await b.add(canon('x'));
  assert.equal(b.size(), 1);
});

test('time trigger flushes an idle batch', async () => {
  const batches = [];
  const b = createBatcher({ anchors: [fakeAnchor('fake')], maxLeaves: 100, maxAgeMs: 30, onBatch: async (r) => batches.push(r) });
  await b.add(canon('t'));
  await new Promise((r) => setTimeout(r, 120));
  assert.equal(batches.length, 1);
});

test('one failing anchor is recorded; all failing re-queues the leaves', async () => {
  const batches = [];
  const b = createBatcher({ anchors: [fakeAnchor('ok'), fakeAnchor('bad', true)], maxLeaves: 100, maxAgeMs: 0, onBatch: async (r) => batches.push(r) });
  await b.add(canon('p'));
  const r = await b.flush();
  assert.equal(r.anchors.length, 1);
  assert.deepEqual(r.anchorErrors, [{ kind: 'bad', error: 'down' }]);

  const b2 = createBatcher({ anchors: [fakeAnchor('bad', true)], maxLeaves: 100, maxAgeMs: 0 });
  await b2.add(canon('q'));
  await assert.rejects(() => b2.flush(), /every anchor failed/);
  assert.equal(b2.size(), 1);
});
