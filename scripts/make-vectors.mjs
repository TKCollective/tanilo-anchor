// Writes vectors/merkle-proofs.json: for trees of 1 to 12 leaves, every leaf's tanilo.anchor.v1 proof
// (with no anchors), plus cases that must not verify. Deterministic: leaf i is sha256("receipt-" + i).
// Other implementations (the Python checker) are tested against this file.
//   node scripts/make-vectors.mjs
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { buildTree, digestToBytes } from '../src/merkle.mjs';
import { makeProofRecord, verifyProofOffline } from '../src/proof.mjs';

const canon = (i) => 'sha256-' + createHash('sha256').update(`receipt-${i}`).digest('hex');
const valid = [];
for (let n = 1; n <= 12; n++) {
  const hashes = Array.from({ length: n }, (_, i) => canon(i));
  const tree = buildTree(hashes.map(digestToBytes));
  for (let i = 0; i < n; i++) {
    const proof = makeProofRecord({ canonicalSha256: hashes[i], leafIndex: i, treeSize: n, auditPath: tree.proofFor(i), root: tree.root, batchId: `batch-${tree.root.toString('hex').slice(0, 32)}`, batchedAt: '2026-10-05T00:00:00.000Z', anchors: [] });
    if (!verifyProofOffline(proof, hashes[i]).ok) throw new Error(`self-check failed n=${n} i=${i}`);
    valid.push({ name: `n${n}-leaf${i}`, canonical_sha256: hashes[i], proof });
  }
}
const base = valid.find((v) => v.name === 'n7-leaf4');
const mut = (name, why, change, canonical = base.canonical_sha256) => {
  const proof = JSON.parse(JSON.stringify(base.proof)); change(proof);
  if (verifyProofOffline(proof, canonical).ok) throw new Error(`invalid vector verifies: ${name}`);
  return { name, why, canonical_sha256: canonical, proof };
};
const invalid = [
  mut('wrong-receipt', "the proof's leaf is another receipt's hash", () => {}, canon(99)),
  mut('wrong-root', 'the stated root is not the recomputed one', (p) => { p.root = 'ff'.repeat(32); }),
  mut('wrong-index', 'the leaf index is off by one', (p) => { p.leaf_index += 1; }),
  // A tree size that changes the shape of the path. (A size that keeps the same shape, such as 8 here, recomputes
  // to the same root: the path, not the stated size, is what the root commits to.)
  mut('wrong-tree-size', 'a tree size that changes the path shape', (p) => { p.tree_size = 5; }),
  mut('path-truncated', 'one path element is missing', (p) => { p.path.pop(); }),
  mut('path-extended', 'one path element too many', (p) => { p.path.push(p.path[0]); }),
  mut('path-swapped', 'two path elements are swapped', (p) => { [p.path[0], p.path[1]] = [p.path[1], p.path[0]]; }),
  mut('path-element-changed', 'one byte of a path element differs', (p) => { p.path[0] = (p.path[0][0] === '0' ? '1' : '0') + p.path[0].slice(1); }),
  mut('path-uppercase', 'path elements must be lower-case hex', (p) => { p.path[0] = p.path[0].toUpperCase(); }),
  mut('path-not-a-list', 'path is a string', (p) => { p.path = p.path.join(''); }),
  mut('unknown-version', 'anchor_version is not tanilo.anchor.v1', (p) => { p.anchor_version = 'tanilo.anchor.v2'; }),
  mut('unknown-leaf-alg', 'leaf_hash_alg is not rfc6962-sha256', (p) => { p.leaf_hash_alg = 'sha256'; }),
  mut('index-negative', 'leaf index below zero', (p) => { p.leaf_index = -1; }),
  mut('index-not-integer', 'leaf index is a string', (p) => { p.leaf_index = '4'; }),
  mut('leaf-without-domain-prefix', 'root computed without the 0x00 leaf prefix does not match', (p) => { p.root = createHash('sha256').update(digestToBytes(p.leaf)).digest('hex'); }),
];
const out = { description: 'tanilo.anchor.v1 Merkle inclusion vectors. Leaves are sha256("receipt-" + i). Every entry in "valid" must recompute to proof.root; no entry in "invalid" may.', license: 'CC0-1.0', leaf_hash_alg: 'rfc6962-sha256', valid, invalid };
writeFileSync(new URL('../vectors/merkle-proofs.json', import.meta.url), JSON.stringify(out, null, 1) + '\n');
console.log(`wrote ${valid.length} valid and ${invalid.length} invalid vectors`);
