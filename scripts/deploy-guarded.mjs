// Deploy TaniloAnchor with checks before and after, asking for the key with hidden input.
//
//   node scripts/deploy-guarded.mjs --network mainnet --check-only     read-only: chain, gas price, cost (no key)
//   node scripts/deploy-guarded.mjs --network mainnet                  the real deploy on GOAT mainnet (chain 2345)
//   node scripts/deploy-guarded.mjs --network testnet3                 the same on GOAT testnet3
//
// What it does, in order:
//   1. checks the RPC really serves the chain you named;
//   2. reads the gas price and works out what the deploy will cost;
//   3. asks for the anchoring key (input hidden; GOAT_ANCHOR_PRIVATE_KEY is used if set). The key is never
//      printed, logged or written anywhere. Only its address is shown;
//   4. checks the address holds enough for the deploy;
//   5. on mainnet, asks you to type DEPLOY ON MAINNET;
//   6. deploys build/TaniloAnchor.json (the committed build) with the key's address as publisher;
//   7. checks the code now at the new address is byte-identical to the build, and that publisher() is the key's address;
//   8. prints the contract address and writes build/deployment.<chainId>.json (not committed; no secrets in it).
//
// "local" exists for the tests: it deploys to a local chain and takes the confirmation from CONFIRM_PHRASE.
import { ethers } from 'ethers';
import { readFileSync, writeFileSync } from 'node:fs';

const NETWORKS = {
  mainnet: { label: 'GOAT MAINNET', chainId: 2345, rpc: 'https://rpc.goat.network', explorer: 'https://explorer.goat.network', coin: 'BTC', phrase: 'DEPLOY ON MAINNET' },
  testnet3: { label: 'GOAT testnet3', chainId: 48816, rpc: 'https://rpc.testnet3.goat.network', explorer: 'https://explorer.testnet3.goat.network', coin: 'testnet BTC', phrase: null },
  local: { label: 'local test chain', chainId: 31337, rpc: 'http://127.0.0.1:8545', explorer: null, coin: 'test ETH', phrase: 'DEPLOY ON LOCAL' },
};
const args = process.argv.slice(2);
const name = args[args.indexOf('--network') + 1];
const net = args.includes('--network') ? NETWORKS[name] : null;
const checkOnly = args.includes('--check-only');
if (!net) { console.error('usage: node scripts/deploy-guarded.mjs --network mainnet|testnet3 [--check-only]'); process.exit(2); }
const rpcUrl = process.env.GOAT_RPC_URL || net.rpc;
const DEPLOY_GAS = 291000n; // measured: 290,935 on a local chain, 290,923 on GOAT testnet3

function ask(prompt, hidden) {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) return reject(new Error('no terminal to type into'));
    process.stdout.write(prompt);
    process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.setEncoding('utf8');
    let buf = '';
    const onData = (d) => {
      for (const ch of d) {
        if (ch === '\r' || ch === '\n') { process.stdin.setRawMode(false); process.stdin.pause(); process.stdin.off('data', onData); process.stdout.write('\n'); return resolve(buf.trim()); }
        if (ch === '\u0003') { process.stdin.setRawMode(false); process.stdout.write('\n'); return reject(new Error('cancelled')); }
        if (ch === '\u007f' || ch === '\b') { buf = buf.slice(0, -1); continue; }
        buf += ch; if (!hidden) process.stdout.write(ch);
      }
    };
    process.stdin.on('data', onData);
  });
}
const stop = (msg, code = 1) => { console.log(`\nSTOPPED: ${msg}\nNothing was deployed.`); process.exit(code); };

const artifact = JSON.parse(readFileSync(new URL('../build/TaniloAnchor.json', import.meta.url), 'utf8'));
const provider = new ethers.JsonRpcProvider(rpcUrl, net.chainId, { staticNetwork: true });
try {
  console.log(`Network: ${net.label} (chain ${net.chainId})`);
  const live = Number(BigInt(await provider.send('eth_chainId', [])));
  if (live !== net.chainId) stop(`the RPC serves chain ${live}, not ${net.chainId}`);
  console.log(`  OK    the RPC serves chain ${live}`);
  const gasPrice = BigInt(await provider.send('eth_gasPrice', []));
  const cost = DEPLOY_GAS * gasPrice;
  console.log(`        gas price now:       ${gasPrice} wei`);
  console.log(`        deploy will cost:    about ${ethers.formatEther(cost)} ${net.coin} (${DEPLOY_GAS} gas)`);
  console.log(`        build to deploy:     build/TaniloAnchor.json, compiler ${artifact.compiler}, ${(artifact.deployedBytecode.length - 2) / 2} bytes of runtime code`);
  if (checkOnly) { console.log('\n--check-only: stopping before the key is asked for. Nothing was sent.'); process.exit(0); }

  let key = process.env.GOAT_ANCHOR_PRIVATE_KEY || await ask(`\nPaste the ${net.label} anchor key and press Enter (input is hidden): `, true);
  key = key.startsWith('0x') ? key : '0x' + key;
  let wallet;
  try { wallet = new ethers.Wallet(key, provider); } catch { stop('that is not a private key (64 hex digits)'); }
  const [balance, nonce] = await Promise.all([provider.getBalance(wallet.address), provider.getTransactionCount(wallet.address)]);
  console.log(`        key's address:       ${wallet.address}`);
  console.log(`        balance:             ${ethers.formatEther(balance)} ${net.coin}`);
  console.log(`        transactions so far: ${nonce}${nonce === 0 ? ' (a new wallet, as expected)' : ''}`);
  if (balance < cost * 2n) stop(`the address holds less than twice the deploy cost (${ethers.formatEther(cost * 2n)} ${net.coin}); fund it first`);
  console.log('  OK    the address holds enough for the deploy');
  if (net.phrase) {
    console.log(`\n  This deploys a contract on ${net.label} from ${wallet.address}. It costs real ${net.coin} and cannot be undone.`);
    const typed = process.env.CONFIRM_PHRASE && name === 'local' ? process.env.CONFIRM_PHRASE : await ask(`  Type ${net.phrase} and press Enter to continue (anything else stops): `, false);
    if (typed !== net.phrase) stop('the confirmation was not typed');
  }

  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
  const contract = await factory.deploy(wallet.address);
  const tx = contract.deploymentTransaction();
  console.log(`\n  sent: ${tx.hash}\n  waiting for it to be mined ...`);
  const rcpt = await tx.wait(1);
  if (rcpt.status !== 1) stop(`the deploy transaction ${tx.hash} failed`);
  const address = await contract.getAddress();
  const code = await provider.getCode(address);
  const sameCode = code.toLowerCase() === artifact.deployedBytecode.toLowerCase();
  const publisher = await new ethers.Contract(address, artifact.abi, provider).publisher();
  const block = await provider.getBlock(rcpt.blockNumber);
  console.log(`  ${sameCode ? 'OK  ' : 'FAIL'}  the code at ${address} is ${sameCode ? '' : 'NOT '}byte-identical to build/TaniloAnchor.json`);
  console.log(`  ${publisher === wallet.address ? 'OK  ' : 'FAIL'}  publisher() is ${publisher}`);
  const out = { network: name, chain: `eip155:${net.chainId}`, address, publisher, deployer: wallet.address, tx_hash: tx.hash, block_number: rcpt.blockNumber, block_time: new Date(Number(block.timestamp) * 1000).toISOString(), gas_used: rcpt.gasUsed.toString(), fee_native: ethers.formatEther(rcpt.gasUsed * (rcpt.gasPrice ?? 0n)), code_matches_build: sameCode };
  writeFileSync(new URL(`../build/deployment.${net.chainId}.json`, import.meta.url), JSON.stringify(out, null, 2) + '\n');
  console.log(`\n  CONTRACT ADDRESS: ${address}`);
  if (net.explorer) console.log(`  ${net.explorer}/address/${address}`);
  console.log(`  fee paid: ${out.fee_native} ${net.coin}; details written to build/deployment.${net.chainId}.json`);
  process.exit(sameCode && publisher === wallet.address ? 0 : 1);
} catch (e) {
  let m = String(e && (e.shortMessage || e.message) || e).replace(/\s+/g, ' ').slice(0, 300);
  stop(m);
}
