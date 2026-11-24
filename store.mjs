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

function getNeonEndpoint() {
  if (process.env.NEON_SQL_URL) return process.env.NEON_SQL_URL;
  try {
    const rawHost = new URL(NEON_URL.replace(/^postgres(ql)?:/i, 'https:')).host;
    // Neon HTTP /sql API is hosted on the primary host without '-pooler'
    const directHost = rawHost.replace('-pooler', '');
    return `https://${directHost}/sql`;
  } catch (_) {
    return '';
  }
}

export async function neonQuery(query, params = []) {
  if (!useNeon) return [];
  const endpoint = getNeonEndpoint();
  if (!endpoint) return [];

  let res = null;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Neon-Connection-String': NEON_URL, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, params }),
      signal: AbortSignal.timeout(10000)
    });
  } catch (err) {
    // If direct host failed, try with rawHost
    try {
      const rawHost = new URL(NEON_URL.replace(/^postgres(ql)?:/i, 'https:')).host;
      res = await fetch(`https://${rawHost}/sql`, {
        method: 'POST',
        headers: { 'Neon-Connection-String': NEON_URL, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, params }),
        signal: AbortSignal.timeout(10000)
      });
    } catch (_) {
      throw err;
    }
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Neon HTTP ${res.status}`);
  return data.rows || [];
}

async function neonInit() {
  if (!neonReady) {
    neonReady = (async () => {
      // 1. Core KV table (Atomic state store for fast JSON snapshots)
      await neonQuery(
        'CREATE TABLE IF NOT EXISTS aura_kv (key text PRIMARY KEY, value text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())'
      );
      // 2. Users table
      await neonQuery(
        `CREATE TABLE IF NOT EXISTS users (
          id varchar(255) PRIMARY KEY,
          name varchar(255),
          email varchar(255),
          password_hash text,
          avatar text,
          auth_provider text,
          created_at timestamptz DEFAULT now()
        )`
      ).catch(() => {});
      // 3. User Listening Events Table (Permanent behavior log)
      await neonQuery(
        `CREATE TABLE IF NOT EXISTS user_listening_events (
          id text PRIMARY KEY,
          user_id text NOT NULL,
          song_id text NOT NULL,
          event_type text NOT NULL,
          listened_sec integer DEFAULT 0,
          depth_score real DEFAULT 0,
          context_key text,
          created_at timestamptz DEFAULT now()
        )`
      ).catch(() => {});
      // 4. User Taste Profiles & DNA Table (Structured relational profile)
      await neonQuery(
        `CREATE TABLE IF NOT EXISTS user_taste_profiles (
          user_id text PRIMARY KEY,
          persona text,
          top_moods jsonb,
          top_genres jsonb,
          top_artists jsonb,
          tag_weights jsonb,
          contextual_taste jsonb,
          volatility_type text,
          milestones jsonb,
          last_updated timestamptz DEFAULT now()
        )`
      ).catch(() => {});
      // 5. Index for fast querying user events
      await neonQuery(
        'CREATE INDEX IF NOT EXISTS idx_listening_user_created ON user_listening_events (user_id, created_at DESC)'
      ).catch(() => {});
    })().catch(e => { neonReady = null; throw e; });
  }
  return neonReady;
}

// ── Sync user directly into Neon Postgres 'users' table ──
export async function syncUserToNeon(user) {
  if (!useNeon || !user || !user.email) return;
  try {
    await neonInit();
    const id = String(user.id || user._id || `user_${Date.now()}`);
    const name = String(user.name || user.email.split('@')[0]);
    const email = String(user.email).toLowerCase().trim();

    await neonQuery(
      `INSERT INTO users (id, name, email) 
       VALUES ($1, $2, $3) 
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email`,
      [id, name, email]
    );
  } catch (err) {
    // Fallback: If conflict on id without constraint, try insert or update by email
    try {
      const id = String(user.id || user._id || `user_${Date.now()}`);
      const name = String(user.name || user.email.split('@')[0]);
      const email = String(user.email).toLowerCase().trim();
      const existing = await neonQuery('SELECT id FROM users WHERE email = $1 LIMIT 1', [email]);
      if (existing && existing.length > 0) {
        await neonQuery('UPDATE users SET name = $1 WHERE email = $2', [name, email]);
      } else {
        await neonQuery('INSERT INTO users (id, name, email) VALUES ($1, $2, $3)', [id, name, email]);
      }
    } catch (e2) {
      console.warn('[NEON] user table sync notice:', e2.message);
    }
  }
}

export async function syncAllUsersToNeon(users) {
  if (!useNeon || !Array.isArray(users)) return;
  for (const u of users) {
    if (u && u.email) await syncUserToNeon(u);
  }
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
