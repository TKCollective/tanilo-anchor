// Rebuild build/TaniloAnchor.json from contracts/TaniloAnchor.sol with solc-js.
// solc is not a dependency of this repository (its own dependencies carry open advisories), and the
// committed build is what gets deployed. To check that the build is reproducible, install the exact
// compiler without saving it, then run this script and compare:
//   npm install --no-save solc@0.8.37
//   node scripts/compile.mjs && git diff --stat build/TaniloAnchor.json     (expect no change)
import solc from 'solc';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const source = readFileSync(new URL('../contracts/TaniloAnchor.sol', import.meta.url), 'utf8');
const input = {
  language: 'Solidity',
  sources: { 'TaniloAnchor.sol': { content: source } },
  settings: {
    optimizer: { enabled: true, runs: 1000 },
    evmVersion: 'paris', // conservative target; works on any post-Merge EVM, GOAT included
    outputSelection: { '*': { TaniloAnchor: ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object'] } },
  },
};
const out = JSON.parse(solc.compile(JSON.stringify(input)));
const errors = (out.errors || []).filter((e) => e.severity === 'error');
if (errors.length) { console.error(errors.map((e) => e.formattedMessage).join('\n')); process.exit(1); }
const c = out.contracts['TaniloAnchor.sol'].TaniloAnchor;
mkdirSync(new URL('../build', import.meta.url), { recursive: true });
writeFileSync(new URL('../build/TaniloAnchor.json', import.meta.url), JSON.stringify({
  contractName: 'TaniloAnchor',
  compiler: solc.version(),
  abi: c.abi,
  bytecode: '0x' + c.evm.bytecode.object,
  deployedBytecode: '0x' + c.evm.deployedBytecode.object,
}, null, 2));
console.log(`compiled TaniloAnchor with solc ${solc.version()}; deployed bytecode ${c.evm.deployedBytecode.object.length / 2} bytes`);
