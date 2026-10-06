import { readFileSync } from 'node:fs';
export function loadChain(name = process.env.ANCHOR_CHAIN ?? 'goat-testnet3') {
  const chains = JSON.parse(readFileSync(new URL('../config/chains.json', import.meta.url), 'utf8'));
  const c = chains[name];
  if (!c) throw new Error(`unknown chain ${name}; known: ${Object.keys(chains).filter((k) => !k.startsWith('_')).join(', ')}`);
  if (!c.enabled) throw new Error(`chain ${name} is disabled in config/chains.json`);
  return { ...c, rpcUrls: process.env.GOAT_RPC_URL ? [process.env.GOAT_RPC_URL, ...c.rpcUrls] : c.rpcUrls };
}

/** A chain by its id, for READ-ONLY use (checking a proof). The `enabled` flag guards publishing
 *  (deploying, anchoring); checking a proof on a listed network is always allowed. */
export function loadChainForReading(chainId) {
  const chains = JSON.parse(readFileSync(new URL('../config/chains.json', import.meta.url), 'utf8'));
  const c = Object.entries(chains).filter(([k]) => !k.startsWith('_')).map(([, v]) => v).find((v) => v.chainId === chainId);
  if (!c) throw new Error(`no chain with id ${chainId} in config/chains.json`);
  return { ...c, rpcUrls: process.env.GOAT_RPC_URL ? [process.env.GOAT_RPC_URL, ...c.rpcUrls] : c.rpcUrls };
}
