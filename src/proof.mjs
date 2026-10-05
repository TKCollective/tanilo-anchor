// Inclusion-proof record format carried next to each receipt ("tanilo.anchor.v1").
// Everything a verifier needs offline is here; the `anchors[]` entries additionally
// point at where the root was published so an online check can confirm it.
import { digestToBytes, rootFromProof } from './merkle.mjs';

export const PROOF_VERSION = 'tanilo.anchor.v1';
export const LEAF_HASH_ALG = 'rfc6962-sha256';

const hex = (b) => Buffer.from(b).toString('hex');

export function makeProofRecord({ canonicalSha256, leafIndex, treeSize, auditPath, root, batchId, batchedAt, anchors }) {
  return {
    anchor_version: PROOF_VERSION,
    leaf: canonicalSha256,                  // "sha256-<hex>", the receipt's canonical_sha256
    leaf_hash_alg: LEAF_HASH_ALG,          // leaf = SHA256(0x00 || digest), node = SHA256(0x01 || l || r)
    leaf_index: leafIndex,
    tree_size: treeSize,
    path: auditPath.map(hex),              // sibling hashes, leaf → root (RFC 6962 audit path)
    root: hex(root),
    batch_id: batchId,
    batched_at: batchedAt,                 // RFC 3339, when the batch closed (issuer clock, not evidence)
    anchors,                               // one entry per anchor backend; see src/anchors/*.mjs
  };
}

/**
 * Offline part of anchor verification: does this receipt's canonical hash sit under the stated root?
 * Returns {ok, reason, root}. No network. Mirrors the three-state style of tanilo-receipt-verify:
 * a structural problem is "invalid", never a throw.
 */
export function verifyProofOffline(record, canonicalSha256) {
  try {
    if (!record || typeof record !== 'object') return { ok: false, reason: 'proof record is not an object' };
    if (record.anchor_version !== PROOF_VERSION) return { ok: false, reason: `unsupported anchor_version ${record.anchor_version}` };
    if (record.leaf_hash_alg !== LEAF_HASH_ALG) return { ok: false, reason: `unsupported leaf_hash_alg ${record.leaf_hash_alg}` };
    if (canonicalSha256 !== undefined && record.leaf !== canonicalSha256) {
      return { ok: false, reason: `proof leaf ${record.leaf} is not this receipt's canonical_sha256 ${canonicalSha256}` };
    }
    const leaf = digestToBytes(record.leaf);
    if (!Array.isArray(record.path)) return { ok: false, reason: 'path is not an array' };
    const path = record.path.map((h) => {
      if (typeof h !== 'string' || !/^[0-9a-f]{64}$/.test(h)) throw new Error(`bad path element ${h}`);
      return Buffer.from(h, 'hex');
    });
    const root = rootFromProof(leaf, record.leaf_index, record.tree_size, path);
    if (root === null) return { ok: false, reason: 'audit path does not reduce to a root for leaf_index/tree_size' };
    const stated = Buffer.from(String(record.root), 'hex');
    if (stated.length !== 32 || !root.equals(stated)) return { ok: false, reason: 'recomputed root does not match record.root' };
    return { ok: true, reason: null, root: hex(root) };
  } catch (e) {
    return { ok: false, reason: `malformed proof: ${e.message}` };
  }
}
