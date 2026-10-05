// Batcher: collect receipt canonical hashes, close a batch every N receipts or every T ms
// (whichever first), build the RFC 6962 tree, publish the root through every anchor backend,
// and emit one proof record per receipt. Storage is pluggable; the default keeps everything
// in memory and the CLI writes JSON files. Receipts are keyed by canonical_sha256, so the
// same receipt submitted twice occupies one leaf.
import { randomUUID } from 'node:crypto';
import { buildTree, digestToBytes } from './merkle.mjs';
import { makeProofRecord } from './proof.mjs';
import { assertAnchor } from './anchors/interface.mjs';

export function createBatcher({ anchors, maxLeaves = 1000, maxAgeMs = 60 * 60 * 1000, onBatch = async () => {}, now = () => Date.now() }) {
  anchors.forEach(assertAnchor);
  let pending = new Map(); // canonical_sha256 -> receipt id (opaque, for the caller's bookkeeping)
  let openedAt = null;
  let timer = null;
  let closing = null;

  function add(canonicalSha256, receiptId = null) {
    digestToBytes(canonicalSha256); // validate shape early
    if (pending.size === 0) {
      openedAt = now();
      if (maxAgeMs > 0 && typeof setTimeout === 'function') {
        timer = setTimeout(() => { flush().catch(() => {}); }, maxAgeMs);
        timer.unref?.();
      }
    }
    if (!pending.has(canonicalSha256)) pending.set(canonicalSha256, receiptId);
    if (pending.size >= maxLeaves) return flush();
    return null;
  }

  /** Close the current batch and anchor it. Resolves to the batch result (or null if nothing pending). */
  async function flush() {
    if (closing) return closing;
    if (pending.size === 0) return null;
    const leavesHex = [...pending.keys()];
    const ids = [...pending.values()];
    pending = new Map();
    if (timer) { clearTimeout(timer); timer = null; }
    closing = (async () => {
      const leaves = leavesHex.map(digestToBytes);
      const tree = buildTree(leaves);
      const batchId = `batch-${new Date(now()).toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
      const batchedAt = new Date(now()).toISOString();
      const anchorRecords = [];
      const anchorErrors = [];
      for (const a of anchors) {
        try { anchorRecords.push(await a.publish(tree.root, { leafCount: leaves.length, batchId })); }
        catch (e) { anchorErrors.push({ kind: a.kind, error: e.message }); }
      }
      if (anchorRecords.length === 0) {
        // No anchor succeeded: put the leaves back so the next flush retries them.
        leavesHex.forEach((h, i) => { if (!pending.has(h)) pending.set(h, ids[i]); });
        throw new Error(`every anchor failed: ${JSON.stringify(anchorErrors)}`);
      }
      const proofs = leavesHex.map((h, i) => makeProofRecord({
        canonicalSha256: h, leafIndex: i, treeSize: leaves.length, auditPath: tree.proofFor(i),
        root: tree.root, batchId, batchedAt, anchors: anchorRecords,
      }));
      const result = { batchId, batchedAt, root: tree.root.toString('hex'), leafCount: leaves.length, receiptIds: ids, anchors: anchorRecords, anchorErrors, proofs, openedAt };
      await onBatch(result);
      return result;
    })();
    try { return await closing; } finally { closing = null; }
  }

  return { add, flush, size: () => pending.size, openedAt: () => openedAt };
}
