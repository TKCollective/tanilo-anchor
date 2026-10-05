// Verify one proof record: offline Merkle check first, then (if an RPC is reachable) the on-chain anchor.
//   TANILO_ANCHOR_CONTRACT=0x... node scripts/verify-proof.mjs <receipt.json> <receipt.anchor.json> [--offline]
// The on-chain check asks only the contract named in TANILO_ANCHOR_CONTRACT (the one you trust), never one
// the proof names by itself.
import { readFileSync } from 'node:fs';
import { loadChain } from '../src/config.mjs';
import { verifyProofOffline } from '../src/proof.mjs';
import { digestToBytes } from '../src/merkle.mjs';
import { makeEvmAnchor } from '../src/anchors/evm.mjs';
import { canonicalSha256OfEnvelope } from '../src/receipt.mjs';

const [receiptPath, proofPath] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const offline = process.argv.includes('--offline');
const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
const proof = JSON.parse(readFileSync(proofPath, 'utf8'));
const canonical = receipt.canonical_sha256 ?? canonicalSha256OfEnvelope(receipt);

const result = { canonical_sha256: canonical, merkle: verifyProofOffline(proof, canonical), anchors: [] };
if (result.merkle.ok && !offline) {
  const root = Buffer.from(proof.root, 'hex');
  for (const rec of proof.anchors) {
    if (rec.kind?.startsWith('evm-')) {
      const chain = loadChain(process.env.ANCHOR_CHAIN ?? (rec.chain_id === 31337 ? 'local' : 'goat-testnet3'));
      const a = makeEvmAnchor({ chain, mode: rec.kind === 'evm-contract' ? 'contract' : 'calldata', contractAddress: process.env.TANILO_ANCHOR_CONTRACT });
      result.anchors.push({ kind: rec.kind, ...(await a.verify(root, rec)) });
    } else {
      result.anchors.push({ kind: rec.kind, status: 'indeterminate', reason: 'unknown anchor kind' });
    }
  }
}
console.log(JSON.stringify(result, null, 2));
process.exit(result.merkle.ok ? 0 : 1);
