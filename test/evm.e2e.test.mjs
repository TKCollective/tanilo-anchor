// End-to-end against a local Hardhat JSON-RPC node, which this file starts and stops itself.
// The signing key below is Hardhat's published dev account #0: public test material, worth nothing, never used on GOAT.
import { test, after } from 'node:test';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { ethers } from 'ethers';
import { makeEvmAnchor, deployAnchorContract, encodeCalldata, decodeCalldata, guardChain } from '../src/anchors/evm.mjs';
import { createBatcher } from '../src/batcher.mjs';
import { verifyProofOffline } from '../src/proof.mjs';

const HARDHAT_DEV_KEY_0 = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const PORT = 18545 + Math.floor(Math.random() * 500);
const chain = { caip2: 'eip155:31337', chainId: 31337, rpcUrls: [`http://127.0.0.1:${PORT}`], nativeCurrency: { symbol: 'ETH', decimals: 18 } };
const env = { TEST_KEY: HARDHAT_DEV_KEY_0 };
const canon = (s) => 'sha256-' + createHash('sha256').update(s).digest('hex');

const node = spawn(process.execPath, ['node_modules/hardhat/dist/src/cli.js', 'node', '--port', String(PORT)], { cwd: new URL('..', import.meta.url), stdio: 'ignore' });
after(() => { try { node.kill('SIGKILL'); } catch {} });
async function nodeUp() {
  for (let i = 0; i < 100; i++) {
    const p = new ethers.JsonRpcProvider(chain.rpcUrls[0], 31337, { staticNetwork: true });
    try { await p.getBlockNumber(); p.destroy(); return true; } catch { p.destroy(); await new Promise((r) => setTimeout(r, 200)); }
  }
  return false;
}
const up = await nodeUp();

test('calldata encoding round-trips', () => {
  const root = Buffer.alloc(32, 7);
  const d = decodeCalldata(encodeCalldata(root, 1234));
  assert.ok(d.root.equals(root)); assert.equal(d.leafCount, 1234);
  assert.equal(decodeCalldata('0x00'), null);
});

test('mainnet guard refuses chainId 2345 without ALLOW_MAINNET', () => {
  assert.throws(() => guardChain(2345, {}), /refusing/);
  guardChain(2345, { ALLOW_MAINNET: '1' });
  guardChain(48816, {});
});

test('contract mode: deploy, anchor a batch, verify on-chain, reject unknown root', { skip: !up && 'local node did not start' }, async () => {
  const dep = await deployAnchorContract({ chain, privateKeyEnv: 'TEST_KEY', env });
  const anchor = makeEvmAnchor({ chain, mode: 'contract', contractAddress: dep.address, privateKeyEnv: 'TEST_KEY', env });
  const batches = [];
  const b = createBatcher({ anchors: [anchor], maxLeaves: 1000, maxAgeMs: 0, onBatch: async (r) => batches.push(r) });
  for (let i = 0; i < 50; i++) await b.add(canon(`r${i}`), `r${i}`);
  const r = await b.flush();
  const rec = r.anchors[0];
  assert.equal(rec.kind, 'evm-contract');
  assert.equal(rec.contract, dep.address);
  console.log(`  gas: deploy=${dep.gas_used} anchor(contract)=${rec.gas_used}`);
  for (const p of r.proofs) assert.ok(verifyProofOffline(p, p.leaf).ok);
  const v = await anchor.verify(Buffer.from(r.root, 'hex'), rec);
  assert.equal(v.status, 'confirmed'); assert.equal(v.observed.tx_matches_root, true);
  const bad = await anchor.verify(Buffer.alloc(32, 9), rec);
  assert.equal(bad.status, 'failed');
  // A proof that names a contract the verifier does not trust is not confirmed, whatever that contract would say.
  const dep2 = await deployAnchorContract({ chain, privateKeyEnv: 'TEST_KEY', env });
  const elsewhere = makeEvmAnchor({ chain, mode: 'contract', contractAddress: dep2.address, privateKeyEnv: 'TEST_KEY', env });
  const rec2 = await elsewhere.publish(Buffer.from(r.root, 'hex'), { leafCount: 50, batchId: 'elsewhere' });
  assert.equal((await anchor.verify(Buffer.from(r.root, 'hex'), rec2)).status, 'indeterminate');
  assert.equal((await makeEvmAnchor({ chain, mode: 'contract' }).verify(Buffer.from(r.root, 'hex'), rec)).status, 'indeterminate');
  // Re-anchoring the same root reverts (AlreadyAnchored)
  await assert.rejects(() => anchor.publish(Buffer.from(r.root, 'hex'), { leafCount: 1, batchId: 'dup' }));
  // Non-publisher cannot anchor
  const other = makeEvmAnchor({ chain, mode: 'contract', contractAddress: dep.address, privateKeyEnv: 'K', env: { K: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' } });
  await assert.rejects(() => other.publish(Buffer.alloc(32, 1), { leafCount: 1, batchId: 'x' }));
});

test('calldata mode: anchor and verify, wrong root fails', { skip: !up && 'local node did not start' }, async () => {
  const anchor = makeEvmAnchor({ chain, mode: 'calldata', privateKeyEnv: 'TEST_KEY', env });
  const root = createHash('sha256').update('root').digest();
  const rec = await anchor.publish(root, { leafCount: 1000, batchId: 'b' });
  assert.equal(rec.kind, 'evm-calldata');
  console.log(`  gas: anchor(calldata)=${rec.gas_used}`);
  assert.equal((await anchor.verify(root, rec)).status, 'confirmed');
  assert.equal((await anchor.verify(Buffer.alloc(32, 1), rec)).status, 'failed');
  assert.equal((await anchor.verify(root, { ...rec, chain_id: 1 })).status, 'indeterminate');
});
