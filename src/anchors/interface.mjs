// Chain-agnostic anchor interface. Every backend publishes the same 32-byte root and
// returns a JSON-serialisable record that goes into proof.anchors[]. Verification takes
// that record back and reports one of three states, never throws:
//   { status: 'confirmed' | 'pending' | 'failed' | 'indeterminate', reason, observed }
//
//   publish(root: Buffer, meta: {leafCount, batchId}) -> Promise<AnchorRecord>
//   verify(root: Buffer, record: AnchorRecord)        -> Promise<AnchorStatus>
//   kind: string   e.g. 'evm-contract', 'evm-calldata'
export const STATUS = Object.freeze({
  CONFIRMED: 'confirmed',          // anchor observed at the publication point and it commits to this root
  PENDING: 'pending',              // submitted; not yet mined
  FAILED: 'failed',                // the publication point was checked and does NOT commit to this root
  INDETERMINATE: 'indeterminate',  // could not check (no RPC, unknown record shape)
});

export function assertAnchor(a) {
  for (const m of ['kind', 'publish', 'verify']) {
    if (!(m in a)) throw new TypeError(`anchor backend missing ${m}`);
  }
  return a;
}
