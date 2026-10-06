// scripts/deploy-guarded.mjs against a local chain: it deploys the committed build, checks the code and the
// publisher, never prints the key, and stops when the confirmation is not given or the wallet is empty.
// The key is Hardhat's published dev account #0 (public test material).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, existsSync, rmSync } from 'node:fs';
import { ethers } from 'ethers';

const KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const PORT = 19545 + Math.floor(Math.random() * 400);
const RPC = `http://127.0.0.1:${PORT}`;
const root = new URL('..', import.meta.url);
const node = spawn(process.execPath, ['node_modules/hardhat/dist/src/cli.js', 'node', '--port', String(PORT)], { cwd: root, stdio: 'ignore' });
const record = new URL('../build/deployment.31337.json', import.meta.url);
after(() => { try { node.kill('SIGKILL'); } catch {} try { rmSync(record); } catch {} });
for (let i = 0; i < 100; i++) { const p = new ethers.JsonRpcProvider(RPC, 31337, { staticNetwork: true }); try { await p.getBlockNumber(); p.destroy(); break; } catch { p.destroy(); await new Promise((r) => setTimeout(r, 200)); } }
const run = (args, env = {}) => spawnSync(process.execPath, ['scripts/deploy-guarded.mjs', ...args], { cwd: root, encoding: 'utf8', env: { ...process.env, GOAT_RPC_URL: RPC, GOAT_ANCHOR_PRIVATE_KEY: '', CONFIRM_PHRASE: '', ...env } });

test('--check-only reads the chain and the cost, asks for no key, deploys nothing', () => {
  const r = run(['--network', 'local', '--check-only']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /the RPC serves chain 31337/);
  assert.match(r.stdout, /deploy will cost/);
  assert.match(r.stdout, /Nothing was sent/);
});

test('the wrong network name for the RPC is refused before anything else', () => {
  const r = run(['--network', 'mainnet', '--check-only']);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /serves chain 31337, not 2345/);
  assert.match(r.stdout, /Nothing was deployed/);
});

test('without the typed confirmation nothing is deployed', async () => {
  const p = new ethers.JsonRpcProvider(RPC, 31337, { staticNetwork: true });
  const before = await p.getTransactionCount(new ethers.Wallet(KEY).address);
  const r = run(['--network', 'local'], { GOAT_ANCHOR_PRIVATE_KEY: KEY, CONFIRM_PHRASE: 'yes' });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /the confirmation was not typed/);
  assert.equal(await p.getTransactionCount(new ethers.Wallet(KEY).address), before);
  p.destroy();
});

test('an unfunded wallet is refused', () => {
  const r = run(['--network', 'local'], { GOAT_ANCHOR_PRIVATE_KEY: ethers.Wallet.createRandom().privateKey, CONFIRM_PHRASE: 'DEPLOY ON LOCAL' });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /holds less than twice the deploy cost/);
});

test('a full deploy: code identical to the build, publisher is the key, key never printed', async () => {
  const r = run(['--network', 'local'], { GOAT_ANCHOR_PRIVATE_KEY: KEY, CONFIRM_PHRASE: 'DEPLOY ON LOCAL' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /byte-identical to build\/TaniloAnchor\.json/);
  const address = /CONTRACT ADDRESS: (0x[0-9a-fA-F]{40})/.exec(r.stdout)[1];
  const p = new ethers.JsonRpcProvider(RPC, 31337, { staticNetwork: true });
  const art = JSON.parse(readFileSync(new URL('../build/TaniloAnchor.json', import.meta.url), 'utf8'));
  assert.equal((await p.getCode(address)).toLowerCase(), art.deployedBytecode.toLowerCase());
  assert.equal(await new ethers.Contract(address, art.abi, p).publisher(), new ethers.Wallet(KEY).address);
  p.destroy();
  assert.ok(existsSync(record));
  const rec = readFileSync(record, 'utf8');
  for (const text of [r.stdout, r.stderr, rec]) { assert.ok(!text.includes(KEY)); assert.ok(!text.includes(KEY.slice(2))); }
  assert.equal(JSON.parse(rec).address, address);
  assert.equal(JSON.parse(rec).code_matches_build, true);
});
