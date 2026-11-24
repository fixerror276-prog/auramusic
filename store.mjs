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
      // 4. User Likes Table (User favorite songs matching Neon schema)
      await neonQuery(
        `CREATE TABLE IF NOT EXISTS user_likes (
          user_id varchar(255) NOT NULL,
          song_id varchar(255) NOT NULL,
          song_data jsonb NOT NULL,
          created_at timestamptz DEFAULT now(),
          PRIMARY KEY (user_id, song_id)
        )`
      ).catch(() => {});
      // 5. User Playlists Table
      await neonQuery(
        `CREATE TABLE IF NOT EXISTS user_playlists (
          id varchar(255) PRIMARY KEY,
          user_id varchar(255) NOT NULL,
          name varchar(255) NOT NULL,
          description text,
          songs jsonb DEFAULT '[]'::jsonb,
          is_system boolean DEFAULT false,
          created_at timestamptz DEFAULT now(),
          updated_at timestamptz DEFAULT now()
        )`
      ).catch(() => {});
      // 6. User Taste Profiles & DNA Table (Structured relational profile)
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
      // 7. Indexes
      await neonQuery(
        'CREATE INDEX IF NOT EXISTS idx_listening_user_created ON user_listening_events (user_id, created_at DESC)'
      ).catch(() => {});
      await neonQuery(
        'CREATE INDEX IF NOT EXISTS idx_playlists_user ON user_playlists (user_id)'
      ).catch(() => {});
      // 8. User Profiles Table (Community Identity & Bio)
      await neonQuery(
        `CREATE TABLE IF NOT EXISTS user_profiles (
          user_id varchar(255) PRIMARY KEY,
          username varchar(100) UNIQUE,
          display_name varchar(255),
          bio text DEFAULT '',
          avatar_url text DEFAULT '',
          created_at timestamptz DEFAULT now(),
          updated_at timestamptz DEFAULT now()
        )`
      ).catch(() => {});
      // Ensure visibility & cover columns exist on user_playlists (Default: private)
      await neonQuery(
        `ALTER TABLE user_playlists ADD COLUMN IF NOT EXISTS visibility varchar(50) DEFAULT 'private'`
      ).catch(() => {});
      await neonQuery(
        `ALTER TABLE user_playlists ADD COLUMN IF NOT EXISTS cover_url text DEFAULT ''`
      ).catch(() => {});
      await neonQuery(
        `ALTER TABLE user_playlists ADD COLUMN IF NOT EXISTS likes_count integer DEFAULT 0`
      ).catch(() => {});
      // 9. Community Playlist Likes Table
      await neonQuery(
        `CREATE TABLE IF NOT EXISTS playlist_likes (
          user_id varchar(255) NOT NULL,
          playlist_id varchar(255) NOT NULL,
          created_at timestamptz DEFAULT now(),
          PRIMARY KEY (user_id, playlist_id)
        )`
      ).catch(() => {});
      // 10. Saved Community Playlists (Library Bookmarks)
      await neonQuery(
        `CREATE TABLE IF NOT EXISTS saved_playlists (
          user_id varchar(255) NOT NULL,
          playlist_id varchar(255) NOT NULL,
          created_at timestamptz DEFAULT now(),
          PRIMARY KEY (user_id, playlist_id)
        )`
      ).catch(() => {});
      // 11. User Follow Relationships
      await neonQuery(
        `CREATE TABLE IF NOT EXISTS user_follows (
          follower_id varchar(255) NOT NULL,
          following_id varchar(255) NOT NULL,
          created_at timestamptz DEFAULT now(),
          PRIMARY KEY (follower_id, following_id)
        )`
      ).catch(() => {});
      // 12. Community Performance Indexes
      await neonQuery(
        'CREATE INDEX IF NOT EXISTS idx_playlists_visibility ON user_playlists (visibility, created_at DESC)'
      ).catch(() => {});
      await neonQuery(
        'CREATE INDEX IF NOT EXISTS idx_playlist_likes_pid ON playlist_likes (playlist_id)'
      ).catch(() => {});
      await neonQuery(
        'CREATE INDEX IF NOT EXISTS idx_saved_playlists_uid ON saved_playlists (user_id)'
      ).catch(() => {});
      await neonQuery(
        'CREATE INDEX IF NOT EXISTS idx_user_follows_following ON user_follows (following_id)'
      ).catch(() => {});
      await neonQuery(
        'CREATE INDEX IF NOT EXISTS idx_user_follows_follower ON user_follows (follower_id)'
      ).catch(() => {});
    })().catch(e => { neonReady = null; throw e; });
  }
  return neonReady;
}

// ── Sync individual like directly into Neon 'user_likes' table ──
export async function syncLikeToNeon(userId, song, isLiked = true) {
  if (!useNeon || !userId || !song) return;
  try {
    await neonInit();
    const uid = String(userId).toLowerCase().trim();
    const songId = String(song.id || song.videoId || '').trim();
    if (!songId) return;

    if (isLiked) {
      await neonQuery(
        `INSERT INTO user_likes (user_id, song_id, song_data, created_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (user_id, song_id) DO UPDATE SET song_data = EXCLUDED.song_data, created_at = now()`,
        [uid, songId, JSON.stringify(song)]
      );
    } else {
      await neonQuery(
        `DELETE FROM user_likes WHERE user_id = $1 AND song_id = $2`,
        [uid, songId]
      );
    }
  } catch (err) {
    console.warn('[NEON] user_likes table sync notice:', err.message);
  }
}

// ── Sync playlist directly into Neon 'user_playlists' table ──
export async function syncPlaylistToNeon(userId, playlist) {
  if (!useNeon || !userId || !playlist) return;
  try {
    await neonInit();
    const uid = String(userId).toLowerCase().trim();
    const plId = String(playlist.id || playlist._id || `pl_${Date.now()}`);
    const name = String(playlist.name || 'My Playlist');
    const desc = String(playlist.description || '');
    const songsJson = JSON.stringify(playlist.songs || []);
    const isSys = Boolean(playlist.isSystem || playlist._system);
    const visibility = String(playlist.visibility || 'private');
    const coverUrl = String(playlist.coverUrl || '');
    const likesCount = Number(playlist.likesCount || 0);

    await neonQuery(
      `INSERT INTO user_playlists (id, user_id, name, description, songs, is_system, visibility, cover_url, likes_count, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
       ON CONFLICT (id) DO UPDATE SET 
         name = EXCLUDED.name, 
         description = EXCLUDED.description, 
         songs = EXCLUDED.songs,
         visibility = EXCLUDED.visibility,
         cover_url = EXCLUDED.cover_url,
         likes_count = EXCLUDED.likes_count,
         updated_at = now()`,
      [plId, uid, name, desc, songsJson, isSys, visibility, coverUrl, likesCount]
    );
  } catch (err) {
    console.warn('[NEON] user_playlists table sync notice:', err.message);
  }
}

// ── Sync user profile into Neon 'user_profiles' table ──
export async function syncProfileToNeon(userId, profile) {
  if (!useNeon || !userId || !profile) return;
  try {
    await neonInit();
    const uid = String(userId).toLowerCase().trim();
    const username = profile.username ? String(profile.username).toLowerCase().trim() : null;
    const displayName = String(profile.displayName || profile.name || '');
    const bio = String(profile.bio || '');
    const avatarUrl = String(profile.avatarUrl || profile.avatar || '');

    await neonQuery(
      `INSERT INTO user_profiles (user_id, username, display_name, bio, avatar_url, updated_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (user_id) DO UPDATE SET
         username = COALESCE(EXCLUDED.username, user_profiles.username),
         display_name = EXCLUDED.display_name,
         bio = EXCLUDED.bio,
         avatar_url = EXCLUDED.avatar_url,
         updated_at = now()`,
      [uid, username, displayName, bio, avatarUrl]
    );
  } catch (err) {
    console.warn('[NEON] user_profiles sync notice:', err.message);
  }
}

// ── Sync playlist like into Neon 'playlist_likes' table ──
export async function syncPlaylistLikeToNeon(userId, playlistId, isLiked = true) {
  if (!useNeon || !userId || !playlistId) return;
  try {
    await neonInit();
    const uid = String(userId).toLowerCase().trim();
    const pid = String(playlistId).trim();
    if (isLiked) {
      await neonQuery(
        `INSERT INTO playlist_likes (user_id, playlist_id, created_at)
         VALUES ($1, $2, now())
         ON CONFLICT (user_id, playlist_id) DO NOTHING`,
        [uid, pid]
      );
    } else {
      await neonQuery(
        `DELETE FROM playlist_likes WHERE user_id = $1 AND playlist_id = $2`,
        [uid, pid]
      );
    }
  } catch (err) {
    console.warn('[NEON] playlist_likes sync notice:', err.message);
  }
}

// ── Sync saved playlist bookmark into Neon 'saved_playlists' table ──
export async function syncSavedPlaylistToNeon(userId, playlistId, isSaved = true) {
  if (!useNeon || !userId || !playlistId) return;
  try {
    await neonInit();
    const uid = String(userId).toLowerCase().trim();
    const pid = String(playlistId).trim();
    if (isSaved) {
      await neonQuery(
        `INSERT INTO saved_playlists (user_id, playlist_id, created_at)
         VALUES ($1, $2, now())
         ON CONFLICT (user_id, playlist_id) DO NOTHING`,
        [uid, pid]
      );
    } else {
      await neonQuery(
        `DELETE FROM saved_playlists WHERE user_id = $1 AND playlist_id = $2`,
        [uid, pid]
      );
    }
  } catch (err) {
    console.warn('[NEON] saved_playlists sync notice:', err.message);
  }
}

// ── Sync user follow relationship into Neon 'user_follows' table ──
export async function syncUserFollowToNeon(followerId, followingId, isFollowing = true) {
  if (!useNeon || !followerId || !followingId) return;
  try {
    await neonInit();
    const fId = String(followerId).toLowerCase().trim();
    const targetId = String(followingId).toLowerCase().trim();
    if (fId === targetId) return;

    if (isFollowing) {
      await neonQuery(
        `INSERT INTO user_follows (follower_id, following_id, created_at)
         VALUES ($1, $2, now())
         ON CONFLICT (follower_id, following_id) DO NOTHING`,
        [fId, targetId]
      );
    } else {
      await neonQuery(
        `DELETE FROM user_follows WHERE follower_id = $1 AND following_id = $2`,
        [fId, targetId]
      );
    }
  } catch (err) {
    console.warn('[NEON] user_follows sync notice:', err.message);
  }
}

// ── Delete playlist from Neon ──
export async function deletePlaylistFromNeon(playlistId) {
  if (!useNeon || !playlistId) return;
  try {
    await neonInit();
    await neonQuery('DELETE FROM user_playlists WHERE id = $1', [String(playlistId)]);
  } catch (err) {
    console.warn('[NEON] delete playlist notice:', err.message);
  }
}

// ── Sync listening event into Neon 'user_listening_events' table ──
export async function syncListeningEventToNeon(userId, event) {
  if (!useNeon || !userId || !event) return;
  try {
    await neonInit();
    const id = `evt_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const uid = String(userId).toLowerCase().trim();
    const songId = String(event.song?.videoId || event.song?.id || event.videoId || 'unknown');
    const eventType = String(event.type || 'play');
    const listenedSec = Number(event.listenedSec) || 0;
    const depthScore = Number(event.depth) || 0;
    const contextKey = String(event.ctx || event.contextKey || 'any');

    await neonQuery(
      `INSERT INTO user_listening_events (id, user_id, song_id, event_type, listened_sec, depth_score, context_key, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now())`,
      [id, uid, songId, eventType, listenedSec, depthScore, contextKey]
    );
  } catch (err) {
    console.warn('[NEON] user_listening_events sync notice:', err.message);
  }
}

// ── Sync taste profile DNA into Neon 'user_taste_profiles' table ──
export async function syncTasteProfileToNeon(userId, profile) {
  if (!useNeon || !userId || !profile) return;
  try {
    await neonInit();
    const uid = String(userId).toLowerCase().trim();
    const dna = profile.dnaCard || {};
    const persona = String(dna.persona || 'The Music Explorer 🌍');
    const topMoods = JSON.stringify(dna.topMoods || []);
    const topGenres = JSON.stringify(dna.topGenres || []);
    const topArtists = JSON.stringify(dna.topArtists || []);
    const tagWeights = JSON.stringify(profile.tagWeights || {});
    const contextual = JSON.stringify(profile.contexts || {});
    const volatility = String(dna.volatility?.label || 'STABLE_LOYALIST');
    const milestones = JSON.stringify(profile.milestones || []);

    await neonQuery(
      `INSERT INTO user_taste_profiles (user_id, persona, top_moods, top_genres, top_artists, tag_weights, contextual_taste, volatility_type, milestones, last_updated)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
       ON CONFLICT (user_id) DO UPDATE SET
         persona = EXCLUDED.persona,
         top_moods = EXCLUDED.top_moods,
         top_genres = EXCLUDED.top_genres,
         top_artists = EXCLUDED.top_artists,
         tag_weights = EXCLUDED.tag_weights,
         contextual_taste = EXCLUDED.contextual_taste,
         volatility_type = EXCLUDED.volatility_type,
         milestones = EXCLUDED.milestones,
         last_updated = now()`,
      [uid, persona, topMoods, topGenres, topArtists, tagWeights, contextual, volatility, milestones]
    );
  } catch (err) {
    console.warn('[NEON] user_taste_profiles sync notice:', err.message);
  }
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
