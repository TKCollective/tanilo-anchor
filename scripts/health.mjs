// One-command health check of anchoring on the live API. Read-only.
//   node scripts/health.mjs            public figures: batches, queue, last run, last batch
//   node scripts/health.mjs --full     also the text of the last error (asks for CRON_SECRET, input hidden)
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
const problems = [];
const HOUR = 3600000;
const queuedFor = s.oldest_queued_at ? Date.now() - Date.parse(s.oldest_queued_at) : 0;
const runAge = s.last_run ? Date.now() - Date.parse(s.last_run.at) : Infinity;
if (!s.queueing_new_receipts) problems.push('queueing is switched off (ANCHOR_QUEUE is not 1)');
if (!s.contract) problems.push('no contract address is configured');
if (s.last_run && s.last_run.status !== 'ok') problems.push(`the last run ${ago(s.last_run.at)} ended "${s.last_run.status}"`);
if (runAge > 2.5 * HOUR) problems.push(s.last_run ? `no run for ${ago(s.last_run.at).replace(' ago', '')} (expected about hourly)` : 'no run has been recorded yet');
if (queuedFor > 2.5 * HOUR) problems.push(`the oldest queued hash has waited since ${s.oldest_queued_at}`);

console.log(`Anchoring health   ${API}   checked ${s.checked_at}`);
console.log(`  network / contract   ${s.chain}   ${s.contract}`);
console.log(`  queueing receipts    ${s.queueing_new_receipts ? 'on' : 'OFF'}`);
console.log(`  batches anchored     ${s.batches_total}`);
console.log(`  queue depth          ${s.queue_depth}${s.oldest_queued_at ? `   (oldest queued ${ago(s.oldest_queued_at)})` : ''}`);
console.log(`  last run             ${s.last_run ? `${s.last_run.status}, ${ago(s.last_run.at)}: ${s.last_run.batches} batch(es), ${s.last_run.hashes_anchored} hash(es)` : 'none recorded'}`);
if (s.last_batch) {
  console.log(`  last batch           ${s.last_batch.batch_id}   ${s.last_batch.tree_size} hash(es)   block time ${s.last_batch.block_time} (${ago(s.last_batch.block_time)})`);
  console.log(`                       ${s.last_batch.explorer_tx || s.last_batch.tx_hash}`);
} else console.log('  last batch           none yet');
console.log(`  last error           ${s.last_error_at ? `at ${s.last_error_at} (${ago(s.last_error_at)})${'last_error' in s ? `: ${s.last_error}` : '   (run with --full to see the text)'}` : 'none recorded'}`);
if (full && !('last_error' in s)) console.log('  note                 the secret was not accepted, so the error text is not shown');
console.log(problems.length ? `\nNEEDS A LOOK\n${problems.map((p) => '  - ' + p).join('\n')}` : '\nHEALTHY');
process.exit(problems.length ? 1 : 0);
