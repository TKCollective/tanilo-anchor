// RFC 6962 Merkle Tree Hash over SHA-256, with domain separation:
//   leaf     = SHA256(0x00 || data)
//   interior = SHA256(0x01 || left || right)
//   split    = largest power of two strictly less than n (unbalanced, no duplication)
// Leaves are the raw 32-byte digests of each receipt's canonical_sha256.
// Proofs are RFC 6962 §2.1.1 audit paths: (leaf_index, tree_size, path[]).
import { createHash } from 'node:crypto';

const sha256 = (...parts) => {
  const h = createHash('sha256');
  for (const p of parts) h.update(p);
  return h.digest();
};

export const LEAF_PREFIX = Buffer.from([0x00]);
export const NODE_PREFIX = Buffer.from([0x01]);

export function leafHash(data) {
  return sha256(LEAF_PREFIX, data);
}

export function nodeHash(left, right) {
  return sha256(NODE_PREFIX, left, right);
}

/** Largest power of two strictly less than n (n >= 2). */
export function splitPoint(n) {
  let k = 1;
  while (k * 2 < n) k *= 2;
  return k;
}

/** Decode "sha256-<64 hex>" (Tanilo canonical_sha256 form) or bare hex into 32 bytes. */
export function digestToBytes(s) {
  if (typeof s !== 'string') throw new TypeError('digest must be a string');
  const hex = s.startsWith('sha256-') ? s.slice(7) : s.startsWith('0x') ? s.slice(2) : s;
  if (!/^[0-9a-f]{64}$/.test(hex)) throw new Error(`not a lowercase 64-hex sha256 digest: ${s}`);
  return Buffer.from(hex, 'hex');
}

export function rootOf(leaves) {
  if (!Array.isArray(leaves)) throw new TypeError('leaves must be an array');
  if (leaves.length === 0) return sha256(); // RFC 6962: MTH({}) = SHA256()
  return mth(leaves.map(leafHash));
}

function mth(hashes) {
  const n = hashes.length;
  if (n === 1) return hashes[0];
  const k = splitPoint(n);
  return nodeHash(mth(hashes.slice(0, k)), mth(hashes.slice(k)));
}

/** Audit path for leaf m of a tree with n leaves (RFC 6962 §2.1.1). */
export function inclusionProof(leaves, m) {
  const n = leaves.length;
  if (!Number.isInteger(m) || m < 0 || m >= n) throw new RangeError(`leaf index ${m} out of range [0,${n})`);
  return path(leaves.map(leafHash), m);
}

function path(hashes, m) {
  const n = hashes.length;
  if (n === 1) return [];
  const k = splitPoint(n);
  if (m < k) return [...path(hashes.slice(0, k), m), mth(hashes.slice(k))];
  return [...path(hashes.slice(k), m - k), mth(hashes.slice(0, k))];
}

/** Recompute the root from a leaf, its index, the tree size and the audit path (RFC 6962 §2.1.1 algorithm). */
export function rootFromProof(leaf, leafIndex, treeSize, auditPath) {
  if (!Number.isInteger(leafIndex) || leafIndex < 0 || leafIndex >= treeSize) return null;
  let fn = leafIndex;
  let sn = treeSize - 1;
  let r = leafHash(leaf);
  for (const p of auditPath) {
    if (sn === 0) return null; // path too long
    if (fn % 2 === 1 || fn === sn) {
      r = nodeHash(p, r);
      while (fn % 2 === 0 && fn !== 0) { fn >>= 1; sn >>= 1; }
    } else {
      r = nodeHash(r, p);
    }
    fn >>= 1; sn >>= 1;
  }
  return sn === 0 ? r : null; // path too short
}

export function verifyInclusion(leaf, leafIndex, treeSize, auditPath, expectedRoot) {
  const r = rootFromProof(leaf, leafIndex, treeSize, auditPath);
  return r !== null && r.equals(expectedRoot);
}

export function buildTree(leaves) {
  const root = rootOf(leaves);
  return {
    root,
    treeSize: leaves.length,
    proofFor: (i) => inclusionProof(leaves, i),
  };
}
