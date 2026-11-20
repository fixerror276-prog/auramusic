// Persistent storage for users, OTPs, sessions, playlists, likes... (no dependencies, plain fetch).
// Pick ONE by setting its environment variables on the server:
//   Neon (Postgres):   DATABASE_URL  (or POSTGRES_URL)   e.g. postgres://user:pass@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require
//   Upstash / Vercel KV: UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN  (or KV_REST_API_URL + KV_REST_API_TOKEN)
// Neon wins when both are set. With neither, the server keeps using database.json + process memory.

const NEON_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.NEON_DATABASE_URL || '';
const useNeon = /^postgres(ql)?:\/\//i.test(NEON_URL);

const BASE = (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '').replace(/\/+$/, '');
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '';

// True when some persistent store is configured (kept under the old name the server imports).
export const redisEnabled = useNeon || Boolean(BASE && TOKEN);
export const storeKind = useNeon ? 'neon' : (BASE && TOKEN ? 'redis' : 'none');

// ── Neon: SQL over HTTPS (works on serverless, no driver needed) ──
let neonReady = null;
async function neonQuery(query, params = []) {
  const host = new URL(NEON_URL.replace(/^postgres(ql)?:/i, 'https:')).host;
  const endpoint = process.env.NEON_SQL_URL || `https://${host}/sql`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Neon-Connection-String': NEON_URL, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, params }),
    signal: AbortSignal.timeout(10000)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Neon HTTP ${res.status}`);
  return data.rows || [];
}
function neonInit() {
  if (!neonReady) {
    neonReady = neonQuery(
      'CREATE TABLE IF NOT EXISTS aura_kv (key text PRIMARY KEY, value text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())'
    ).catch(e => { neonReady = null; throw e; });
  }
  return neonReady;
}

async function command(args) {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(8000)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    throw new Error(data.error || `Redis HTTP ${res.status}`);
  }
  return data.result;
}

// Returns the parsed JSON stored at `key`, or null when it does not exist.
export async function kvGetJson(key) {
  if (useNeon) {
    await neonInit();
    const rows = await neonQuery('SELECT value FROM aura_kv WHERE key = $1', [key]);
    if (rows.length) return JSON.parse(rows[0].value);
    // First run on Neon: bring over what the old Upstash Redis store already had (if it is still configured).
    if (BASE && TOKEN) {
      const raw = await command(['GET', key]).catch(() => null);
      if (raw != null) { await kvSetRaw(key, raw); return JSON.parse(raw); }
    }
    return null;
  }
  const raw = await command(['GET', key]);
  return raw == null ? null : JSON.parse(raw);
}

// Stores an already-serialised JSON string at `key`.
export async function kvSetRaw(key, jsonString) {
  if (useNeon) {
    await neonInit();
    await neonQuery(
      'INSERT INTO aura_kv (key, value, updated_at) VALUES ($1, $2, now()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()',
      [key, jsonString]
    );
    return 'OK';
  }
  return command(['SET', key, jsonString]);
}
