// Recompute canonical_sha256 of a receipt JWS envelope: base64url-decode `payload`, JCS-canonicalize
// (RFC 8785), SHA-256. Mirrors tanilo-receipt-verify's jcs(): UTF-16 code-unit key order, JSON.stringify emit.
import { createHash } from 'node:crypto';

export function jcs(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(jcs).join(',') + ']';
  const keys = Object.keys(v).sort((a, b) => Buffer.from(a, 'utf16le').swap16().compare(Buffer.from(b, 'utf16le').swap16()));
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + jcs(v[k])).join(',') + '}';
}

export function canonicalSha256OfEnvelope(envelope) {
  const jws = envelope.jws ?? envelope;
  if (typeof jws.payload !== 'string') throw new Error('envelope has no JWS payload string');
  const payload = JSON.parse(Buffer.from(jws.payload, 'base64url').toString('utf8'));
  return 'sha256-' + createHash('sha256').update(jcs(payload), 'utf8').digest('hex');
}
