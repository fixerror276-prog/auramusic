// Tiny Redis client for Upstash / Vercel KV over their REST API (no dependencies).
// If the env vars are missing, `redisEnabled` is false and the server keeps using
// database.json + process memory exactly as before.

const BASE = (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '').replace(/\/+$/, '');
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '';

export const redisEnabled = Boolean(BASE && TOKEN);

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
  const raw = await command(['GET', key]);
  return raw == null ? null : JSON.parse(raw);
}

// Stores an already-serialised JSON string at `key`.
export async function kvSetRaw(key, jsonString) {
  return command(['SET', key, jsonString]);
}
