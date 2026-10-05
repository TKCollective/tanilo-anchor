// Deploy TaniloAnchor. Usage: ANCHOR_CHAIN=goat-testnet3 GOAT_ANCHOR_PRIVATE_KEY=<in env, never on the CLI> node scripts/deploy.mjs
import { writeFileSync } from 'node:fs';
import { loadChain } from '../src/config.mjs';
import { deployAnchorContract } from '../src/anchors/evm.mjs';

const chain = loadChain();
const r = await deployAnchorContract({ chain });
console.log(JSON.stringify({ chain: chain.caip2, ...r, explorer: chain.explorer ? `${chain.explorer}/address/${r.address}` : null }, null, 2));
writeFileSync(new URL(`../build/deployment.${chain.chainId}.json`, import.meta.url), JSON.stringify({ chain: chain.caip2, ...r, deployed_at: new Date().toISOString() }, null, 2));
console.error(`\nSet TANILO_ANCHOR_CONTRACT=${r.address} in the environment that runs the batcher.`);
