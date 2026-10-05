// Create a dedicated anchoring wallet WITHOUT printing the private key.
// macOS: the key is copied to the clipboard (pbcopy) so you can paste it into your password manager,
// then the clipboard is cleared after 60 seconds. Only the public address is printed.
//   node scripts/new-wallet.mjs            (label: testnet)
//   node scripts/new-wallet.mjs --mainnet  (label: mainnet; use a NEW wallet for mainnet, never the testnet one)
import { ethers } from 'ethers';
import { spawnSync } from 'node:child_process';

const w = ethers.Wallet.createRandom();
const copy = spawnSync('pbcopy', { input: w.privateKey });
if (copy.status !== 0) {
  console.error('pbcopy not available (not macOS?). Nothing was printed or saved. Re-run on a Mac or adapt to xclip/wl-copy.');
  process.exit(1);
}
console.log(`Address (public, safe to share): ${w.address}`);
const label = process.argv.includes('--mainnet') ? 'GOAT MAINNET anchor key' : 'GOAT testnet anchor key';
console.log(`Private key is on your clipboard ONLY. Paste it into your password manager now as "${label}".`);
console.log('Clipboard clears in 60 s.');
setTimeout(() => { spawnSync('pbcopy', { input: '' }); console.log('Clipboard cleared.'); }, 60_000);
