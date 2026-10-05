// Anchor a batch of receipts from the CLI.
//   node scripts/anchor-batch.mjs <receipts-dir-or-json> [--mode contract|calldata] [--out proofs/]
// Each input is a receipt JWS envelope ({payload, signatures}) or an object with canonical_sha256.
// The canonical hash is recomputed from the JWS payload with the same JCS the verifier uses.
import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { loadChain } from '../src/config.mjs';
import { createBatcher } from '../src/batcher.mjs';
import { makeEvmAnchor } from '../src/anchors/evm.mjs';
import { canonicalSha256OfEnvelope } from '../src/receipt.mjs';

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const input = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1]?.startsWith('--') !== true);
if (!input) { console.error('usage: anchor-batch.mjs <receipts-dir-or-json> [--mode contract|calldata] [--out dir]'); process.exit(2); }
const mode = flag('--mode', 'contract');
const outDir = flag('--out', 'proofs');
const chain = loadChain();

const files = statSync(input).isDirectory() ? readdirSync(input).filter((f) => f.endsWith('.json')).map((f) => join(input, f)) : [input];
const anchors = [makeEvmAnchor({ chain, mode, contractAddress: process.env.TANILO_ANCHOR_CONTRACT })];

mkdirSync(outDir, { recursive: true });
const batcher = createBatcher({
  anchors, maxLeaves: Number(process.env.ANCHOR_MAX_LEAVES ?? 1000), maxAgeMs: 0,
  onBatch: async (b) => {
    writeFileSync(join(outDir, `${b.batchId}.json`), JSON.stringify({ ...b, proofs: undefined }, null, 2));
    b.proofs.forEach((p, i) => writeFileSync(join(outDir, `${basename(b.receiptIds[i], '.json')}.anchor.json`), JSON.stringify(p, null, 2)));
  },
});
for (const f of files) {
  const env = JSON.parse(readFileSync(f, 'utf8'));
  const h = env.canonical_sha256 ?? canonicalSha256OfEnvelope(env);
  await batcher.add(h, f);
}
const b = await batcher.flush();
console.log(JSON.stringify({ batchId: b.batchId, root: b.root, leafCount: b.leafCount, anchors: b.anchors, anchorErrors: b.anchorErrors, proofsWrittenTo: outDir }, null, 2));
