// One-command health check of anchoring on the live API. Read-only.
//   node scripts/health.mjs            what is public: number of batches, last batch, last run, time of the last error
//   node scripts/health.mjs --full     also queue depth, batch sizes and the last error's text
//                                      (asks for CRON_SECRET, input hidden). Counts are not public.
//   ANCHOR_API=https://api.tanilo.io   override the API base
// Exit code 0 when healthy, 1 when something needs a look.
const API = (process.env.ANCHOR_API || 'https://api.tanilo.io').replace(/\/+$/, '');
const full = process.argv.includes('--full');

function askHidden(prompt) {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) return reject(new Error('no terminal to type into'));
    process.stdout.write(prompt);
    process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.setEncoding('utf8');
    let buf = '';
    const onData = (d) => {
      for (const ch of d) {
        if (ch === '\r' || ch === '\n') { process.stdin.setRawMode(false); process.stdin.pause(); process.stdin.off('data', onData); process.stdout.write('\n'); return resolve(buf.trim()); }
        if (ch === '\u0003') { process.stdin.setRawMode(false); process.stdout.write('\n'); return reject(new Error('cancelled')); }
        if (ch === '\u007f' || ch === '\b') buf = buf.slice(0, -1); else buf += ch;
      }
    };
    process.stdin.on('data', onData);
  });
}
const ago = (iso) => {
  if (!iso) return 'never';
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return m < 90 ? `${m} min ago` : m < 2880 ? `${(m / 60).toFixed(1)} h ago` : `${(m / 1440).toFixed(1)} days ago`;
};
const get = async (path, headers = {}) => {
  const r = await fetch(API + path, { headers, signal: AbortSignal.timeout(20000) });
  let json = null; try { json = await r.json(); } catch {}
  return { status: r.status, json };
};

const headers = {};
if (full) headers.authorization = 'Bearer ' + (process.env.CRON_SECRET || await askHidden('Paste CRON_SECRET and press Enter (input is hidden): '));
const st = await get('/v1/anchor/status', headers);
if (st.status !== 200 || !st.json) { console.log(`PROBLEM  ${API}/v1/anchor/status answered ${st.status}`); process.exit(1); }
const s = st.json;
const op = s.operator || null;   // present only when the secret was accepted
const problems = [];
const HOUR = 3600000;
const lastRun = op ? op.last_run : s.last_run;
const runAge = lastRun ? Date.now() - Date.parse(lastRun.at) : Infinity;
const queuedFor = op && op.oldest_queued_at ? Date.now() - Date.parse(op.oldest_queued_at) : 0;
if (!s.queueing_new_receipts) problems.push('queueing is switched off (ANCHOR_QUEUE is not 1)');
if (!s.contract) problems.push('no contract address is configured');
if (lastRun && lastRun.status !== 'ok') problems.push(`the last run ${ago(lastRun.at)} ended "${lastRun.status}"`);
if (runAge > 2.5 * HOUR) problems.push(lastRun ? `no run for ${ago(lastRun.at).replace(' ago', '')} (expected about hourly)` : 'no run has been recorded yet');
if (queuedFor > 2.5 * HOUR) problems.push(`the oldest queued hash has waited since ${op.oldest_queued_at}`);

console.log(`Anchoring health   ${API}   checked ${s.checked_at}`);
console.log(`  network / contract   ${s.chain}   ${s.contract}`);
console.log(`  queueing receipts    ${s.queueing_new_receipts ? 'on' : 'OFF'}`);
console.log(`  batches anchored     ${s.batches_total}`);
console.log(`  last run             ${lastRun ? `${lastRun.status}, ${ago(lastRun.at)}${op ? `: ${lastRun.batches} batch(es), ${lastRun.hashes_anchored} hash(es)` : ''}` : 'none recorded'}`);
if (s.last_batch) {
  console.log(`  last batch           ${s.last_batch.batch_id}   block time ${s.last_batch.block_time} (${ago(s.last_batch.block_time)})${op && op.last_batch_size != null ? `   ${op.last_batch_size} hash(es)` : ''}`);
  console.log(`                       ${s.last_batch.explorer_tx || s.last_batch.tx_hash}`);
} else console.log('  last batch           none yet');
if (op) console.log(`  queue depth          ${op.queue_depth}${op.oldest_queued_at ? `   (oldest queued ${ago(op.oldest_queued_at)})` : ''}`);
else console.log('  queue depth          not public; run with --full');
console.log(`  last error           ${s.last_error_at ? `at ${s.last_error_at} (${ago(s.last_error_at)})${op ? `: ${op.last_error}` : '   (run with --full to see the text)'}` : 'none recorded'}`);
if (full && !op) console.log('  note                 the secret was not accepted, so counts and the error text are not shown');
console.log(problems.length ? `\nNEEDS A LOOK\n${problems.map((p) => '  - ' + p).join('\n')}` : '\nHEALTHY');
process.exit(problems.length ? 1 : 0);
