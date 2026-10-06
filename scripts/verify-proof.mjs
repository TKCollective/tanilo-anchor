// Verify one proof record: offline Merkle check first, then (if an RPC is reachable) the on-chain anchor.
//   TANILO_ANCHOR_CONTRACT=0x... node scripts/verify-proof.mjs <receipt.json> <receipt.anchor.json> [--offline]
// The on-chain check asks only the contract named in TANILO_ANCHOR_CONTRACT (the one you trust), never one
// the proof names by itself.
import { readFileSync } from 'node:fs';
import { loadChainForReading } from '../src/config.mjs';
import { verifyProofOffline } from '../src/proof.mjs';
import { digestToBytes } from '../src/merkle.mjs';
import { makeEvmAnchor } from '../src/anchors/evm.mjs';
import { canonicalSha256OfEnvelope } from '../src/receipt.mjs';

const [receiptPath, proofPath] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const offline = process.argv.includes('--offline');
const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
const proof = JSON.parse(readFileSync(proofPath, 'utf8'));
// The hash is recomputed from the receipt's signed payload whenever the file carries one; a stated
// canonical_sha256 is then only compared with it, never trusted in its place.
const hasPayload = typeof (receipt.jws ?? receipt).payload === 'string';
const canonical = hasPayload ? canonicalSha256OfEnvelope(receipt) : receipt.canonical_sha256;
if (hasPayload && receipt.canonical_sha256 !== undefined && receipt.canonical_sha256 !== canonical) {
  console.log(JSON.stringify({ canonical_sha256: canonical, error: `the file states canonical_sha256 ${receipt.canonical_sha256}, but its signed payload hashes to ${canonical}` }, null, 2));
  process.exit(1);
}

const result = { canonical_sha256: canonical, canonical_recomputed_from_payload: hasPayload, merkle: verifyProofOffline(proof, canonical), anchors: [] };
if (result.merkle.ok && !offline) {
  const root = Buffer.from(proof.root, 'hex');
  for (const rec of proof.anchors) {
    if (rec.kind?.startsWith('evm-')) {
      const chain = loadChainForReading(rec.chain_id);   // the network the record names; read-only
      const a = makeEvmAnchor({ chain, mode: rec.kind === 'evm-contract' ? 'contract' : 'calldata', contractAddress: process.env.TANILO_ANCHOR_CONTRACT });
      result.anchors.push({ kind: rec.kind, ...(await a.verify(root, rec)) });
    } else {
      result.anchors.push({ kind: rec.kind, status: 'indeterminate', reason: 'unknown anchor kind' });
    }
  }
}
console.log(JSON.stringify(result, null, 2));
process.exit(result.merkle.ok ? 0 : 1);
