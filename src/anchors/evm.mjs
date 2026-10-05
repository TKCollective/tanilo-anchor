// EVM anchor for GOAT (or any EIP-155 chain). Two publication modes:
//   'contract' : TaniloAnchor.anchor(root, leafCount, batchId); verifiable with one eth_call anchoredAt(root)
//   'calldata' : 0-value self-transfer whose data = "TANILO01" || root || leafCount(8 BE); verifiable by fetching the tx
// The signer is built from an env var the caller names; the key never touches logs or records.
import { ethers } from 'ethers';
import { readFileSync } from 'node:fs';
import { STATUS } from './interface.mjs';

export const CALLDATA_MAGIC = Buffer.from('TANILO01', 'ascii'); // 8 bytes, version 01
const artifact = () => JSON.parse(readFileSync(new URL('../../build/TaniloAnchor.json', import.meta.url), 'utf8'));

export function encodeCalldata(root, leafCount) {
  const n = Buffer.alloc(8); n.writeBigUInt64BE(BigInt(leafCount));
  return '0x' + Buffer.concat([CALLDATA_MAGIC, root, n]).toString('hex');
}
export function decodeCalldata(hexData) {
  const b = Buffer.from(hexData.replace(/^0x/, ''), 'hex');
  if (b.length !== 48 || !b.subarray(0, 8).equals(CALLDATA_MAGIC)) return null;
  return { root: b.subarray(8, 40), leafCount: Number(b.readBigUInt64BE(40)) };
}

export function batchIdToBytes32(batchId) {
  return ethers.keccak256(ethers.toUtf8Bytes(String(batchId)));
}

/** Refuse mainnet unless explicitly allowed. */
export function guardChain(chainId, env = process.env) {
  if (Number(chainId) === 2345 && env.ALLOW_MAINNET !== '1') {
    throw new Error('refusing to anchor on GOAT mainnet (chainId 2345): set ALLOW_MAINNET=1 only after review');
  }
}

export function makeEvmAnchor({ chain, rpcUrl, mode = 'contract', contractAddress, privateKeyEnv = 'GOAT_ANCHOR_PRIVATE_KEY', env = process.env, confirmations = 1 }) {
  if (!['contract', 'calldata'].includes(mode)) throw new Error(`unknown evm anchor mode ${mode}`);
  const provider = new ethers.JsonRpcProvider(rpcUrl ?? chain.rpcUrls[0], chain.chainId, { staticNetwork: true });
  let signer = null;
  const getSigner = () => {
    if (signer) return signer;
    const pk = env[privateKeyEnv];
    if (!pk) throw new Error(`${privateKeyEnv} is not set (set it as a Sensitive env var; never commit it)`);
    signer = new ethers.Wallet(pk, provider);
    return signer;
  };
  const kind = mode === 'contract' ? 'evm-contract' : 'evm-calldata';

  async function publish(root, { leafCount, batchId }) {
    guardChain(chain.chainId, env);
    const s = getSigner();
    let tx;
    if (mode === 'contract') {
      if (!contractAddress) throw new Error('contractAddress required in contract mode');
      const c = new ethers.Contract(contractAddress, artifact().abi, s);
      tx = await c.anchor('0x' + root.toString('hex'), leafCount, batchIdToBytes32(batchId));
    } else {
      tx = await s.sendTransaction({ to: s.address, value: 0n, data: encodeCalldata(root, leafCount) });
    }
    const rcpt = await tx.wait(confirmations);
    if (rcpt.status !== 1) throw new Error(`anchor tx ${tx.hash} reverted`);
    const block = await provider.getBlock(rcpt.blockNumber);
    const price = rcpt.gasPrice ?? tx.gasPrice ?? 0n;
    return {
      kind,
      chain: chain.caip2,
      chain_id: chain.chainId,
      contract: mode === 'contract' ? contractAddress : null,
      publisher: s.address,
      tx_hash: tx.hash,
      block_number: rcpt.blockNumber,
      block_hash: rcpt.blockHash,
      block_time: new Date(Number(block.timestamp) * 1000).toISOString(),
      gas_used: rcpt.gasUsed.toString(),
      effective_gas_price_wei: price.toString(),
      fee_native: ethers.formatEther(rcpt.gasUsed * price),
      explorer_tx: chain.explorer ? `${chain.explorer}/tx/${tx.hash}` : null,
    };
  }

  async function verify(root, record) {
    try {
      if (record.chain_id !== chain.chainId) return { status: STATUS.INDETERMINATE, reason: `record is for chain ${record.chain_id}, verifier configured for ${chain.chainId}` };
      const rootHex = '0x' + root.toString('hex');
      if (mode === 'contract') {
        // The anchoring time is read from a contract, so only the contract this verifier was configured with is
        // asked. An unknown contract could report any time it likes.
        if (!contractAddress) return { status: STATUS.INDETERMINATE, reason: 'no trusted contract address configured' };
        if (typeof record.contract !== 'string' || record.contract.toLowerCase() !== contractAddress.toLowerCase()) {
          return { status: STATUS.INDETERMINATE, reason: `record names contract ${record.contract}, which is not the trusted contract ${contractAddress}` };
        }
        const c = new ethers.Contract(contractAddress, artifact().abi, provider);
        const at = await c.anchoredAt(rootHex);
        if (at === 0n) return { status: STATUS.FAILED, reason: 'contract has no anchoring for this root', observed: { contract: record.contract } };
        // Cross-check the record's claimed tx actually emitted Anchored(root)
        const rcpt = await provider.getTransactionReceipt(record.tx_hash);
        const emitted = rcpt && rcpt.to?.toLowerCase() === record.contract.toLowerCase() && rcpt.logs.some((l) => l.topics[1]?.toLowerCase() === rootHex);
        return {
          status: STATUS.CONFIRMED,
          reason: null,
          observed: { anchored_at: new Date(Number(at) * 1000).toISOString(), tx_matches_root: Boolean(emitted), block_number: rcpt?.blockNumber ?? null },
        };
      }
      const tx = await provider.getTransaction(record.tx_hash);
      if (!tx) return { status: STATUS.INDETERMINATE, reason: 'tx not found on this RPC (wrong chain, pruned, or not yet indexed)' };
      const d = decodeCalldata(tx.data);
      if (!d || !d.root.equals(root)) return { status: STATUS.FAILED, reason: 'tx calldata does not commit to this root' };
      if (tx.blockNumber == null) return { status: STATUS.PENDING, reason: 'tx seen but not yet mined' };
      const block = await provider.getBlock(tx.blockNumber);
      return { status: STATUS.CONFIRMED, reason: null, observed: { block_number: tx.blockNumber, block_time: new Date(Number(block.timestamp) * 1000).toISOString(), from: tx.from } };
    } catch (e) {
      return { status: STATUS.INDETERMINATE, reason: `rpc error: ${e.shortMessage ?? e.message}` };
    }
  }

  return { kind, chain, mode, provider, publish, verify, getPublisherAddress: () => getSigner().address };
}

/** Deploy TaniloAnchor; publisher defaults to the deployer. Returns {address, tx_hash, gas_used}. */
export async function deployAnchorContract({ chain, rpcUrl, privateKeyEnv = 'GOAT_ANCHOR_PRIVATE_KEY', env = process.env, publisherAddress }) {
  guardChain(chain.chainId, env);
  const pk = env[privateKeyEnv];
  if (!pk) throw new Error(`${privateKeyEnv} is not set`);
  const provider = new ethers.JsonRpcProvider(rpcUrl ?? chain.rpcUrls[0], chain.chainId, { staticNetwork: true });
  const wallet = new ethers.Wallet(pk, provider);
  const { abi, bytecode } = artifact();
  const factory = new ethers.ContractFactory(abi, bytecode, wallet);
  const c = await factory.deploy(publisherAddress ?? wallet.address);
  const rcpt = await c.deploymentTransaction().wait(1);
  return { address: await c.getAddress(), tx_hash: rcpt.hash, gas_used: rcpt.gasUsed.toString(), deployer: wallet.address };
}
