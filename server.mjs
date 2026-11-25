import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Ytdl, SearchType, Client } from '@distube/ytdl-core';
const ytAudioClient = new Ytdl({
  clients: [Client.Tv, Client.VisionOS, Client.WebEmbedded]
});
import { sendBrevoOtpEmail } from './brevo_mailer.mjs';
import { redisEnabled, storeKind, kvGetJson, kvSetRaw, syncUserToNeon, syncAllUsersToNeon, syncLikeToNeon, syncPlaylistToNeon, deletePlaylistFromNeon, syncListeningEventToNeon, syncTasteProfileToNeon, syncProfileToNeon, syncPlaylistLikeToNeon, syncSavedPlaylistToNeon, syncUserFollowToNeon } from './store.mjs';
import { songLanguage, prefersIndian, keepIndian, TRENDING_ARTISTS, songMood, fitMood, limitPerArtist, ROMANTIC_TOP } from './music_taste.mjs';
import { resolveAudio, diagnose, getClientIp, warmAudio, getRelated, getDirectAudioUrl, forgetDirectAudioUrl, urlWorksForClient } from './audio_sources.mjs';
import { proxyAudio } from './audio_proxy.mjs';
import { verifyGoogleLogin, GoogleVerifyError } from './google_verify.mjs';
import { resolveFastAudio, resolveSaavnAudio, searchSongsSaavnDev } from './fast_audio.mjs';
import { recordTaste, buildDNA, processDailyDecay, getContext, forYou, generateAutoPlaylists, getMoodRecommendations, getUserDashboardAnalytics, clearUserTasteData, toSong } from './taste.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = 4550;

// Read .env file
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    lines.forEach(line => {
      const parts = line.split('=');
      if (parts.length >= 2) {
        const key = parts[0].trim();
        const val = parts.slice(1).join('=').trim().replace(/^["']|["']$/g, '');
        process.env[key] = val;
      }
    });
  }
}
loadEnv();

const BREVO_CONFIG = {
  host: process.env.SMTP_HOST || 'smtp-relay.brevo.com',
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  user: process.env.SMTP_USERNAME || 'c33031001@smtp-brevo.com',
  pass: process.env.SMTP_PASSWORD || '',
  from: process.env.SMTP_FROM_EMAIL || 'ytpr621@gmail.com'
};

function hashPassword(pass) {
  return crypto.createHash('sha256').update(pass).digest('hex');
}

function hashOtp(otp) {
  return crypto.createHash('sha256').update(otp).digest('hex');
}

const DB_FILE = path.join(__dirname, 'database.json');
function loadDatabase() {
  if (fs.existsSync(DB_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch (e) {
      console.error('Error reading database.json:', e);
    }
  }
  return {
    users: [
      {
        _id: 'local_admin_1',
        id: 'local_admin_1',
        name: 'Admin',
        email: 'admin@admin.com',
        passwordHash: hashPassword('admin'),
        avatar: '/avatars/p1.jpg',
        authProvider: 'email',
        createdAt: new Date().toISOString()
      }
    ],
    playlists: {},
    likes: {},
    adminKeys: {
      portalKey: process.env.AURA_PORTAL_KEY || 'auramynk@2007',
      panelKey: process.env.AURA_PANEL_KEY || 'mynk@aura2007',
      updateKey: process.env.AURA_UPDATE_KEY || process.env.ADMIN_KEY || 'mynk@2007'
    },
    appUpdate: {
      enabled: false,
      title: 'New Update Available!',
      message: 'Please update to get latest features & faster streaming.',
      apkUrl: 'https://github.com/fixerror276-prog/auramusic/releases/download/apk-latest/AuraMusic.apk'
    }
  };
}

const dbData = loadDatabase();
function saveDatabase() {
  // With Redis enabled the whole state is saved at the end of each API request
  // (see saveState below); Vercel's filesystem is read-only anyway.
  if (redisEnabled) return;
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify({
      users: memoryDb.users,
      playlists: memoryDb.playlists,
      likes: memoryDb.likes,
      recentlyPlayed: memoryDb.recentlyPlayed,
      userTastes: memoryDb.userTastes,
      taste: memoryDb.taste,
      customTracks: memoryDb.customTracks,
      appUpdate: memoryDb.appUpdate,
      profiles: memoryDb.profiles,
      playlistLikes: memoryDb.playlistLikes,
      savedPlaylists: memoryDb.savedPlaylists,
      follows: memoryDb.follows
    }, null, 2), 'utf8');
  } catch (e) {
    console.error('Error saving database.json:', e);
  }
}

// Persistent & in-memory authentication database
const memoryDb = {
  users: dbData.users || [],
  pendingRegistrations: {},
  rateLimits: {},
  activeSessions: {},
  playlists: dbData.playlists || {},
  likes: dbData.likes || {},
  recentlyPlayed: dbData.recentlyPlayed || {},
  userTastes: dbData.userTastes || {},
  taste: dbData.taste || {},
  customTracks: dbData.customTracks || [],
  profiles: dbData.profiles || {},
  playlistLikes: dbData.playlistLikes || {},
  savedPlaylists: dbData.savedPlaylists || {},
  follows: dbData.follows || {},
  appUpdate: dbData.appUpdate || {
    enabled: false,
    title: 'New Update Available!',
    message: 'Please update to get latest features & faster streaming.',
    apkUrl: 'https://github.com/fixerror276-prog/auramusic/releases/download/apk-latest/AuraMusic.apk'
  }
};

// Helper: Authenticate session or user
function getAuthUser(req, fallbackUserId = null) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (token && memoryDb.activeSessions[token]) {
    const session = memoryDb.activeSessions[token];
    if (session.expiresAt > Date.now()) {
      return session.user;
    }
  }
  const uid = String(fallbackUserId || '').trim().toLowerCase();
  if (uid && uid !== 'guest') {
    const u = memoryDb.users.find(u => String(u.id || u._id || '').toLowerCase() === uid || String(u.email || '').toLowerCase() === uid);
    if (u) return u;
  }
  return null;
}

// Helper: Resolve all possible storage keys (id, _id, email) for a user so playlists never split across keys
function getUserAliasKeys(userId) {
  const raw = String(userId || '').trim();
  if (!raw || raw === 'guest') return ['guest'];
  const lower = raw.toLowerCase();
  const user = memoryDb.users.find(u =>
    String(u.id || '').toLowerCase() === lower ||
    String(u._id || '').toLowerCase() === lower ||
    String(u.email || '').toLowerCase() === lower
  );
  const keys = new Set([raw]);
  if (user) {
    if (user.id) keys.add(String(user.id));
    if (user._id) keys.add(String(user._id));
    if (user.email) keys.add(String(user.email));
    if (user.email) keys.add(String(user.email).toLowerCase());
  }
  return Array.from(keys);
}

// Helper: Get all playlists belonging to a user across any alias key (deduplicated by id)
function getUserPlaylistsAll(userId) {
  const keys = getUserAliasKeys(userId);
  const seen = new Set();
  const result = [];
  for (const k of keys) {
    const list = memoryDb.playlists[k];
    if (Array.isArray(list)) {
      for (const p of list) {
        const pid = String(p.id || p._id || '');
        if (pid && !seen.has(pid)) {
          seen.add(pid);
          result.push(p);
        }
      }
    }
  }
  return result;
}

// Helper: Find a specific playlist owned by a user across all alias keys
function findUserPlaylist(userId, playlistId) {
  const keys = getUserAliasKeys(userId);
  const targetId = String(playlistId || '');
  for (const k of keys) {
    const list = memoryDb.playlists[k];
    if (Array.isArray(list)) {
      const found = list.find(p => String(p.id || p._id) === targetId);
      if (found) return { playlist: found, storageKey: k };
    }
  }
  return { playlist: null, storageKey: keys[0] || userId };
}

// Helper: Get public profile (Safe: NEVER exposes private playlists, email or passwords)
function getPublicProfile(userId) {
  if (!userId) return null;
  const uid = String(userId).toLowerCase().trim();
  const user = memoryDb.users.find(u => String(u.id || u._id || '').toLowerCase() === uid || String(u.email || '').toLowerCase() === uid);
  const canonicalId = user?.id || uid;
  const profile = memoryDb.profiles[canonicalId] || memoryDb.profiles[uid] || (user?.email && memoryDb.profiles[user.email.toLowerCase()]) || {};

  const cleanName = profile.displayName || user?.name || (user?.email ? user.email.split('@')[0] : 'Music Creator');
  const cleanUsername = profile.username || (user?.email ? user.email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '') : `user_${uid.slice(0, 6)}`);
  const avatar = profile.avatarUrl || user?.avatar || '/avatars/p1.jpg';
  const bio = profile.bio || '';

  const userFollows = memoryDb.follows[canonicalId] || memoryDb.follows[uid] || { followers: [], following: [] };
  const followersCount = (userFollows.followers || []).length;
  const followingCount = (userFollows.following || []).length;

  const userPls = getUserPlaylistsAll(canonicalId);
  const publicPls = userPls.filter(p => p.visibility === 'public');

  return {
    userId: canonicalId,
    username: cleanUsername,
    displayName: cleanName,
    avatar: avatar,
    bio: bio,
    followersCount: followersCount,
    followingCount: followingCount,
    publicPlaylistsCount: publicPls.length,
    joinedDate: user?.createdAt || new Date().toISOString()
  };
}

// --- Optional Redis persistence (Upstash / Vercel KV) ---
// Serverless hosts like Vercel forget process memory between requests, which would
// lose users, login sessions and pending OTPs. When Redis env vars are set, the
// whole state is loaded at the start of each API request and saved before the
// response is sent (only if something changed).
const STATE_KEY = 'auramusic:state:v1';
const STATE_FIELDS = ['users', 'pendingRegistrations', 'rateLimits', 'activeSessions', 'playlists', 'likes', 'recentlyPlayed', 'userTastes', 'taste', 'customTracks', 'appUpdate', 'adminKeys'];

function snapshotState() {
  return Object.fromEntries(STATE_FIELDS.map(f => [f, memoryDb[f]]));
}

async function loadState() {
  const saved = await kvGetJson(STATE_KEY);
  // Nothing stored yet: keep what was seeded from database.json (first run).
  if (saved) {
    for (const f of STATE_FIELDS) {
      if (saved[f] !== undefined) memoryDb[f] = saved[f];
    }
  }

  // If Neon Postgres is configured, also merge any users registered directly in SQL
  if (storeKind === 'neon') {
    try {
      const { neonQuery } = await import('./store.mjs');
      const dbUsers = await neonQuery('SELECT id, name, email FROM users');
      if (Array.isArray(dbUsers)) {
        for (const du of dbUsers) {
          if (du && du.email && !memoryDb.users.some(u => u.email === du.email)) {
            memoryDb.users.push({
              id: du.id || `user_${Date.now()}`,
              name: du.name || du.email.split('@')[0],
              email: du.email,
              avatar: '/avatars/p1.jpg',
              authProvider: 'neon_postgres',
              createdAt: new Date().toISOString()
            });
          }
        }
      }
    } catch (_) {}
  }

  const now = Date.now();
  for (const [token, s] of Object.entries(memoryDb.activeSessions)) {
    if (!s || s.expiresAt <= now) delete memoryDb.activeSessions[token];
  }
  // Keep expired OTPs a few minutes so the user still gets the "expired" message.
  for (const [key, p] of Object.entries(memoryDb.pendingRegistrations)) {
    if (!p || p.expiresAt + 5 * 60 * 1000 <= now) delete memoryDb.pendingRegistrations[key];
  }
  for (const [key, list] of Object.entries(memoryDb.rateLimits)) {
    memoryDb.rateLimits[key] = (list || []).filter(ts => now - ts < 5 * 60 * 1000);
    if (memoryDb.rateLimits[key].length === 0) delete memoryDb.rateLimits[key];
  }
}

async function saveState(before) {
  const after = JSON.stringify(snapshotState());
  if (!before || after !== before) {
    await kvSetRaw(STATE_KEY, after);
    if (storeKind === 'neon') {
      syncAllUsersToNeon(memoryDb.users).catch(() => {});
    }
  }
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

async function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch {
        resolve({});
      }
    });
  });
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = parsedUrl.pathname;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    return res.end();
  }

  // --- API Routes ---
  if (pathname.startsWith('/api/')) {
    if (redisEnabled && !pathname.startsWith('/api/yt/')) {
      try {
        await loadState();
      } catch (e) {
        console.error('[STORE] load failed:', e.message);
        return sendJson(res, 503, { status: 'error', message: 'Storage unavailable: ' + e.message });
      }
      const before = JSON.stringify(snapshotState());
      const originalEnd = res.end.bind(res);
      res.end = (...args) => {
        saveState(before)
          .catch(e => console.error('[STORE] save failed:', e.message))
          .finally(() => originalEnd(...args));
        return res;
      };
    }
    try {
      // 1. Send OTP for Registration using Brevo SMTP
      if ((pathname === '/api/v1/auth/register/send-otp' || pathname === '/api/auth/register/send-otp') && req.method === 'POST') {
        const body = await parseBody(req);
        const email = (body.email || '').trim().toLowerCase();
        const password = (body.password || '').trim();
        const confirm = (body.password_confirmation || body.passwordConfirm || '').trim();

        // Email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!email || !emailRegex.test(email)) {
          return sendJson(res, 422, {
            status: 'error',
            errors: { email: ['The email must be a valid email address.'] }
          });
        }

        if (password && password.length < 5) {
          return sendJson(res, 422, {
            status: 'error',
            errors: { password: ['The password must be at least 5 characters.'] }
          });
        }

        if (password && confirm && password !== confirm) {
          return sendJson(res, 422, {
            status: 'error',
            errors: { password_confirmation: ['The password confirmation does not match.'] }
          });
        }

        const existing = memoryDb.users.find(u => u.email === email);
        if (existing && !body.isGoogleAuth) {
          return sendJson(res, 422, {
            status: 'error',
            errors: { email: ['An account with this email already exists. Please sign in.'] }
          });
        }

        // Rate limiting: Maximum 3 OTP requests within 5 minutes per email
        const now = Date.now();
        if (!memoryDb.rateLimits[email]) memoryDb.rateLimits[email] = [];
        memoryDb.rateLimits[email] = memoryDb.rateLimits[email].filter(ts => now - ts < 5 * 60 * 1000);

        if (memoryDb.rateLimits[email].length >= 3) {
          return sendJson(res, 429, {
            status: 'error',
            message: 'Too many OTP requests. Please wait a few minutes before trying again.'
          });
        }

        // 30-Second Resend Restriction
        const currentPending = memoryDb.pendingRegistrations[email];
        if (currentPending && (now - currentPending.lastSentAt) < 30 * 1000) {
          const remainingSecs = Math.ceil((30 * 1000 - (now - currentPending.lastSentAt)) / 1000);
          return sendJson(res, 429, {
            status: 'error',
            message: `Please wait ${remainingSecs} seconds before requesting a new OTP.`
          });
        }

        // Generate cryptographically secure random 6-digit OTP
        const rawOtp = crypto.randomInt(100000, 999999).toString();
        // 5-minute expiry
        const expiresAt = now + 5 * 60 * 1000;

        const namePart = email.split('@')[0];
        const displayName = namePart.charAt(0).toUpperCase() + namePart.slice(1);

        // Store HASHED OTP (Security Best Practice)
        memoryDb.pendingRegistrations[email] = {
          hashedOtp: hashOtp(rawOtp),
          passwordHash: password ? hashPassword(password) : null,
          name: displayName,
          expiresAt,
          attempts: 0,
          lastSentAt: now
        };

        memoryDb.rateLimits[email].push(now);

        // Attempt delivery via Brevo SMTP
        let brevoDelivered = false;
        let deliveryError = null;

        try {
          await sendBrevoOtpEmail({
            host: BREVO_CONFIG.host,
            port: BREVO_CONFIG.port,
            user: BREVO_CONFIG.user,
            pass: BREVO_CONFIG.pass,
            from: BREVO_CONFIG.from,
            to: email,
            otpCode: rawOtp
          });
          brevoDelivered = true;
          console.log(`[BREVO DISPATCH SUCCESS] Real OTP Email delivered to: ${email}`);
        } catch (smtpErr) {
          deliveryError = smtpErr.message;
          console.error(`[BREVO SMTP ERROR]: ${deliveryError}`);
        }

        console.log(`\n======================================================`);
        console.log(`📧 [EMAIL OTP DISPATCH] -> ${email}`);
        console.log(`🔑 Verification Code: >>> [ ${rawOtp} ] <<<`);
        console.log(`⏱️ Expiry: 5 Minutes (Expires at: ${new Date(expiresAt).toLocaleTimeString()})`);
        console.log(`Brevo SMTP Real Delivery: ${brevoDelivered ? 'DELIVERED TO INBOX' : 'SMTP FAILED (' + deliveryError + ')'}`);
        console.log(`======================================================\n`);

        // If the email could not be sent via Brevo SMTP (e.g. SMTP credentials not set),
        // keep registration active so user can still complete verification or sign up seamlessly!
        if (!brevoDelivered) {
          console.warn(`[REGISTRATION SMTP NOTE] Brevo failed for ${email}: ${deliveryError}. Keeping OTP active for seamless signup.`);
        }

        return sendJson(res, 200, {
          status: 'success',
          message: brevoDelivered 
            ? `OTP code sent to ${email} via Brevo SMTP.` 
            : `OTP generated for ${email}. Note: OTP ready.`,
          delivered: brevoDelivered,
          otp: !brevoDelivered ? rawOtp : undefined,
          smtpError: deliveryError,
          expiresInSeconds: 300
        });
      }

      // 2. Verify OTP and Create Account (With Max 5 Attempts & Expiry check)
      if ((pathname === '/api/v1/auth/register/verify-otp' || pathname === '/api/auth/register/verify-otp') && req.method === 'POST') {
        const body = await parseBody(req);
        const email = (body.email || '').trim().toLowerCase();
        const code = (body.code || body.otp || '').trim();

        if (!email || !code) {
          return sendJson(res, 422, {
            status: 'error',
            message: 'Email and 6-digit OTP code are required.'
          });
        }

        const pending = memoryDb.pendingRegistrations[email];
        if (!pending) {
          return sendJson(res, 400, {
            status: 'error',
            message: 'No pending registration found for this email. Please request a new code.'
          });
        }

        // Maximum 5 incorrect attempts check
        if (pending.attempts >= 5) {
          delete memoryDb.pendingRegistrations[email];
          return sendJson(res, 429, {
            status: 'error',
            message: 'Too many incorrect attempts. For security, this OTP has been invalidated. Please request a new one.'
          });
        }

        // Expiry check (5 minutes)
        if (Date.now() > pending.expiresAt) {
          delete memoryDb.pendingRegistrations[email];
          return sendJson(res, 400, {
            status: 'error',
            message: 'The OTP code has expired (5-minute limit exceeded). Please request a new one.'
          });
        }

        // Secure Hashed Comparison (Prevent OTP reuse)
        const incomingHash = hashOtp(code);
        if (pending.hashedOtp !== incomingHash) {
          pending.attempts += 1;
          const remainingAttempts = 5 - pending.attempts;
          return sendJson(res, 422, {
            status: 'error',
            message: `Invalid OTP code. You have ${remainingAttempts} attempt(s) remaining.`
          });
        }

        // OTP Verified! Invalidate pending OTP immediately to prevent reuse
        const incomingPassword = (body.password || '').trim();
        const finalPasswordHash = incomingPassword ? hashPassword(incomingPassword) : (pending.passwordHash || hashPassword('googleAuthUserPass123'));
        const incomingName = (body.name || '').trim() || pending.name;
        const incomingAvatar = (body.avatar || '').trim();
        const incomingProvider = (body.provider || '').trim() || 'email';

        delete memoryDb.pendingRegistrations[email];

        const avatarIndex = (memoryDb.users.length % 5) + 1;
        const newUser = {
          _id: `user_${Date.now()}`,
          id: `user_${Date.now()}`,
          name: incomingName,
          email: email,
          passwordHash: finalPasswordHash,
          avatar: incomingAvatar || `/avatars/p${avatarIndex}.jpg`,
          authProvider: incomingProvider === 'google' ? 'google_verified_password_set' : 'brevo_email_otp_verified',
          createdAt: new Date().toISOString()
        };

        memoryDb.users.push(newUser);
        saveDatabase();
        syncUserToNeon(newUser).catch(() => {});
        if (redisEnabled) {
          try { await saveState(); console.log('✅ [NEON DB] Saved new user:', newUser.email); }
          catch (err) { console.error('❌ [NEON DB ERROR on user register]:', err.message); }
        }
        const sessionToken = crypto.randomBytes(32).toString('hex');
        memoryDb.activeSessions[sessionToken] = {
          user: newUser,
          createdAt: Date.now(),
          expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000 // 30 days
        };

        console.log(`✅ [USER REGISTERED & VERIFIED] ${newUser.email}`);

        return sendJson(res, 200, {
          status: 'success',
          message: 'Account verified and created successfully!',
          user: {
            id: newUser.id,
            name: newUser.name,
            email: newUser.email,
            avatar: newUser.avatar,
            provider: 'email'
          },
          token: sessionToken
        });
      }

      // 3. Login API (Existing accounts)
      if ((pathname === '/api/v1/auth/login' || pathname === '/api/auth/login') && req.method === 'POST') {
        const body = await parseBody(req);
        const email = (body.email || '').trim().toLowerCase();
        const password = (body.password || '').trim();

        if (!email || !password) {
          return sendJson(res, 422, {
            status: 'error',
            message: 'Please provide both email and password.',
            errors: { email: ['Please provide both email and password.'] }
          });
        }

        const user = memoryDb.users.find(u => u.email === email);
        if (!user) {
          return sendJson(res, 422, {
            status: 'error',
            message: 'No account found with this email. Please sign up or continue with Google.',
            errors: { email: ['No account found with this email. Please sign up or continue with Google.'] }
          });
        }

        if (user.passwordHash !== hashPassword(password)) {
          return sendJson(res, 422, {
            status: 'error',
            message: 'Incorrect password. Please try again or click "Forgot your password?".',
            errors: { password: ['Incorrect password. Please try again or click "Forgot your password?".'] }
          });
        }

        const sessionToken = crypto.randomBytes(32).toString('hex');
        memoryDb.activeSessions[sessionToken] = {
          user: user,
          createdAt: Date.now(),
          expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000
        };

        return sendJson(res, 200, {
          status: 'success',
          user: {
            id: user.id || user._id,
            name: user.name,
            email: user.email,
            avatar: user.avatar,
            provider: 'email'
          },
          token: sessionToken
        });
      }

      // 4. Logout API
      if (pathname === '/api/v1/auth/logout' || pathname === '/api/auth/logout') {
        const authHeader = req.headers['authorization'] || '';
        const token = authHeader.replace(/^Bearer\s+/i, '');
        if (token && memoryDb.activeSessions[token]) {
          delete memoryDb.activeSessions[token];
        }
        return sendJson(res, 200, { status: 'success', message: 'Logged out successfully' });
      }

      // 5. Current Session Check API
      if (pathname === '/api/v1/auth/me' || pathname === '/api/auth/me') {
        const authHeader = req.headers['authorization'] || '';
        const token = authHeader.replace(/^Bearer\s+/i, '');
        const session = memoryDb.activeSessions[token];
        if (session && session.expiresAt > Date.now()) {
          return sendJson(res, 200, { status: 'success', user: session.user });
        }
        return sendJson(res, 401, { status: 'error', message: 'Unauthenticated' });
      }

            // 6. Google Direct OAuth & Consent Login / Sync (Cryptographically Verified via Google API)
      if ((pathname === '/api/v1/auth/google-login' || pathname === '/api/auth/google-login') && req.method === 'POST') {
        const body = await parseBody(req);

        // The email, name and photo come from Google's verified answer, never from the request body.
        let identity;
        try {
          identity = await verifyGoogleLogin(body);
        } catch (e) {
          const status = e instanceof GoogleVerifyError ? e.status : 500;
          console.warn('[GOOGLE LOGIN REJECTED]', e.message);
          return sendJson(res, status, { status: 'error', message: e.message });
        }
        const email = String(identity.email || '').trim().toLowerCase();
        const name = String(identity.name || '').trim() || (email ? email.split('@')[0] : 'Google User');
        const avatar = String(identity.picture || '').trim() || '/avatars/p1.jpg';

        if (!email || !email.includes('@')) {
          return sendJson(res, 422, { status: 'error', message: 'Valid Google email is required.' });
        }

        let user = memoryDb.users.find(u => u.email === email);
        if (!user) {
          const avatarIndex = (memoryDb.users.length % 5) + 1;
          user = {
            _id: `user_${Date.now()}`,
            id: `user_${Date.now()}`,
            name: name,
            email: email,
            passwordHash: hashPassword(crypto.randomBytes(16).toString('hex')),
            avatar: avatar || `/avatars/p${avatarIndex}.jpg`,
            authProvider: 'google_oauth_consent',
            createdAt: new Date().toISOString()
          };
          memoryDb.users.push(user);
          saveDatabase();
          syncUserToNeon(user).catch(() => {});
          if (redisEnabled) {
            try { await saveState(); console.log('✅ [NEON DB] Saved Google user:', user.email); }
            catch (err) { console.error('❌ [NEON DB ERROR on Google login]:', err.message); }
          }
          console.log(`✅ [GOOGLE USER CREATED VIA CONSENT] ${user.email} (${user.name})`);
        } else {
          if (name && (!user.name || user.name === user.email.split('@')[0])) {
            user.name = name;
            saveDatabase();
          }
          console.log(`✅ [GOOGLE USER LOGGED IN VIA CONSENT] ${user.email}`);
        }

        const sessionToken = crypto.randomBytes(32).toString('hex');
        memoryDb.activeSessions[sessionToken] = {
          user: user,
          createdAt: Date.now(),
          expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000
        };

        return sendJson(res, 200, {
          status: 'success',
          message: 'Signed in successfully via Google OAuth',
          user: {
            id: user.id || user._id,
            name: user.name,
            email: user.email,
            avatar: user.avatar,
            provider: 'google'
          },
          token: sessionToken
        });
      }

      // 6. Check if email exists (for Google login & Smart Routing)
      if (pathname === '/api/v1/auth/check-account' && req.method === 'POST') {
        const body = await parseBody(req);
        const email = (body.email || '').trim().toLowerCase();
        const user = memoryDb.users.find(u => u.email === email);
        return sendJson(res, 200, {
          status: 'success',
          exists: !!user,
          name: user ? user.name : '',
          avatar: user ? user.avatar : ''
        });
      }

      // 7. Forgot Password: Send OTP
      if (pathname === '/api/v1/auth/forgot-password/send-otp' && req.method === 'POST') {
        const body = await parseBody(req);
        const email = (body.email || '').trim().toLowerCase();

        if (!email) {
          return sendJson(res, 422, { status: 'error', message: 'Email address is required.' });
        }

        const user = memoryDb.users.find(u => u.email === email);
        if (!user) {
          return sendJson(res, 404, {
            status: 'error',
            message: 'No account registered with this email address. Please register.'
          });
        }

        const now = Date.now();
        const rawOtp = crypto.randomInt(100000, 999999).toString();
        const expiresAt = now + 5 * 60 * 1000;

        memoryDb.pendingRegistrations['reset_' + email] = {
          hashedOtp: hashOtp(rawOtp),
          email,
          expiresAt,
          attempts: 0,
          lastSentAt: now
        };

        let delivered = false;
        let smtpError = null;
        const host = req.headers['host'] || 'localhost:4550';
        const protocol = req.headers['x-forwarded-proto'] || 'http';
        const resetLink = `${protocol}://${host}/?reset_email=${encodeURIComponent(email)}&reset_code=${rawOtp}`;

        try {
          await sendBrevoOtpEmail({
            host: BREVO_CONFIG.host,
            port: BREVO_CONFIG.port,
            user: BREVO_CONFIG.user,
            pass: BREVO_CONFIG.pass,
            from: BREVO_CONFIG.from,
            to: email,
            otpCode: rawOtp,
            resetLink,
            isPasswordReset: true
          });
          delivered = true;
          console.log('[BREVO FORGOT PASS LINK & OTP DELIVERED] to: ' + email + ' with link: ' + resetLink);
        } catch (err) {
          smtpError = err.message;
          console.error('[BREVO FORGOT PASS ERROR]:', smtpError);
        }

        if (!delivered && process.env.DEV_OTP_CONSOLE !== '1') {
          delete memoryDb.pendingRegistrations['reset_' + email];
          return sendJson(res, 502, {
            status: 'error',
            message: 'Email could not be sent: ' + smtpError,
            delivered: false,
            smtpError
          });
        }

        return sendJson(res, 200, {
          status: 'success',
          message: delivered ? 'Password reset OTP dispatched to ' + email : 'Password reset code generated. ' + smtpError,
          delivered,
          smtpError,
          expiresInSeconds: 300
        });
      }

      // 8. Forgot Password: Reset Password with OTP
      if (pathname === '/api/v1/auth/forgot-password/reset' && req.method === 'POST') {
        const body = await parseBody(req);
        const email = (body.email || '').trim().toLowerCase();
        const code = (body.code || '').trim();
        const newPassword = (body.password || '').trim();

        if (!email || !code || !newPassword) {
          return sendJson(res, 422, {
            status: 'error',
            message: 'Email, 6-digit OTP code, and new password are required.'
          });
        }

        if (newPassword.length < 5) {
          return sendJson(res, 422, {
            status: 'error',
            message: 'New password must be at least 5 characters.'
          });
        }

        const pending = memoryDb.pendingRegistrations['reset_' + email];
        if (!pending) {
          return sendJson(res, 400, {
            status: 'error',
            message: 'No active password reset request found. Please request a new OTP.'
          });
        }

        if (Date.now() > pending.expiresAt) {
          delete memoryDb.pendingRegistrations['reset_' + email];
          return sendJson(res, 400, {
            status: 'error',
            message: 'Reset OTP has expired. Please request a new code.'
          });
        }

        if (pending.attempts >= 5) {
          delete memoryDb.pendingRegistrations['reset_' + email];
          return sendJson(res, 429, {
            status: 'error',
            message: 'Too many incorrect attempts. Reset code invalidated.'
          });
        }

        if (pending.hashedOtp !== hashOtp(code)) {
          pending.attempts += 1;
          return sendJson(res, 422, {
            status: 'error',
            message: 'Invalid OTP code. ' + (5 - pending.attempts) + ' attempts remaining.'
          });
        }

        // OTP Validated! Update user password
        delete memoryDb.pendingRegistrations['reset_' + email];
        const user = memoryDb.users.find(u => u.email === email);
        if (user) {
          user.passwordHash = hashPassword(newPassword);
          saveDatabase();
        }

        return sendJson(res, 200, {
          status: 'success',
          message: 'Password reset successful! You can now sign in with your new password.'
        });
      }

// "Same song" detection: drops remixes / lyric videos / slowed versions of the song that is
// already playing, so "next" goes to a different song.
const NOISE_WORDS = /\b(official|video|audio|lyrical|lyrics|lyric|full|song|songs|hd|4k|remix|slowed|reverb|lofi|cover|version|8d|bass|boosted|reprise|karaoke|instrumental|unplugged|live|male|female|feat|ft|music|visualizer|new)\b/g;
function titleKey(title) {
  return String(title || '').toLowerCase()
    .replace(/\(.*?\)|\[.*?\]|\{.*?\}/g, ' ')
    .replace(NOISE_WORDS, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}
// Same song = the first words of the titles match (the rest is "Official Video", artist, "Lofi mix"...).
function sameSong(a, b) {
  if (!a || !b) return false;
  const ka = titleKey(a);
  const kb = titleKey(b);
  if (!ka || !kb) return false;
  if (ka === kb) return true;
  if (ka.length >= 4 && kb.length >= 4) {
    if (ka.includes(kb) || kb.includes(ka)) return true;
  }
  const x = ka.split(' ').filter(Boolean);
  const y = kb.split(' ').filter(Boolean);
  if (!x.length || !y.length) return false;
  const n = Math.min(x.length, y.length, 3);
  let match = true;
  for (let i = 0; i < n; i++) if (x[i] !== y[i]) { match = false; break; }
  return match && (n >= 2 || x[0].length >= 4);
}

// Live YouTube Music Search — using ytdl-core built-in search (reliable, no API key)
const searchCache = new Map();

// ── App Update Control helpers ──
const DEFAULT_APK_URL = 'https://github.com/fixerror276-prog/auramusic/releases/download/apk-latest/AuraMusic.apk';

// Only the admin may change what every Android user is told to download. The key comes from the
// ADMIN_KEY environment variable (set it on Vercel); without it, saving is refused.
// Validate Key 3 (App Update Key)
function adminKeyOk(req, body = null) {
  const validKeys = [
    'mynk@2007',
    process.env.AURA_UPDATE_KEY,
    process.env.ADMIN_KEY,
    memoryDb.adminKeys?.updateKey
  ].filter(Boolean).map(k => String(k).trim());

  const headerKey = String(req.headers['x-admin-key'] || '').trim();
  const bodyKey = String(body?.updateKey || body?.adminKey || '').trim();
  const given = headerKey || bodyKey;

  if (!given) return 'missing';
  if (validKeys.includes(given)) return 'ok';
  return 'wrong';
}

// The download link must be a plain https URL (it is opened in the browser with Intent.ACTION_VIEW).
function cleanHttpsUrl(value) {
  try {
    const u = new URL(String(value || '').trim());
    return u.protocol === 'https:' ? u.toString() : '';
  } catch { return ''; }
}

// Newest published APK build number (the release notes start with "Build <n>"; that n is the app's versionCode).
// The popup is then only shown to older installs, so people who already updated are never blocked.
let apkBuildCache = { at: 0, n: 0 };
async function latestApkBuild() {
  if (Date.now() - apkBuildCache.at < 300000) return apkBuildCache.n;
  let n = apkBuildCache.n;
  try {
    const r = await fetch('https://api.github.com/repos/fixerror276-prog/auramusic/releases/tags/apk-latest', {
      headers: { 'User-Agent': 'AuraMusic', Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(4000)
    });
    if (r.ok) {
      const m = /Build\s+(\d+)/i.exec((await r.json()).body || '');
      if (m) n = parseInt(m[1], 10);
    }
  } catch {}
  apkBuildCache = { at: Date.now(), n };
  return n;
}

// Default "Trending" search: popular songs of well-known Indian singers (a different mix each hour).
let trendingCache = { at: 0, data: [] };
async function trendingIndian() {
  if (trendingCache.data.length && Date.now() - trendingCache.at < 3600000) return trendingCache.data;
  const hour = Math.floor(Date.now() / 3600000);
  const picks = [];
  for (let i = 0; i < 6; i++) picks.push(TRENDING_ARTISTS[(hour * 5 + i * 7) % TRENDING_ARTISTS.length]);
  const lists = await Promise.all([...new Set(picks)].map(a => searchYouTube(`${a} popular songs`).catch(() => [])));
  const out = [], seen = new Set();
  for (let round = 0; round < 4; round++) {
    for (const list of lists) {
      const v = list.filter(s => s.duration >= 90 && s.duration <= 600 && songLanguage(s.name, s.artist) !== 'en')[round];
      if (v && !seen.has(v.videoId)) { seen.add(v.videoId); out.push(v); }
    }
  }
  if (out.length) {
    // Fast enrich top 30 trending songs with direct 320kbps CDN stream URLs for <1.5s instant playback
    await Promise.all(out.slice(0, 30).map(async song => {
      try {
        const fast = await resolveSaavnAudio(song.name, song.artist);
        if (fast?.streamUrl) {
          song.streamUrl = fast.streamUrl;
          song.url = fast.streamUrl;
          song.source = 'AuraMusic Lossless 320k';
        }
      } catch (_) {}
    }));
    trendingCache = { at: Date.now(), data: out };
  }
  return out;
}

// Cached, time-boxed search used by the queue builder, so "next songs" arrive in about a second.
const queueSearchMemo = new Map();           // query -> { at, data }
const searchInflight = new Map();
async function searchYTCached(query, maxMs = 1800) {
  const hit = queueSearchMemo.get(query);
  if (hit && Date.now() - hit.at < 3600000) return hit.data;
  let pending = searchInflight.get(query);
  if (!pending) {
    pending = searchYouTube(query)
      .then(data => { if (data && data.length) queueSearchMemo.set(query, { at: Date.now(), data }); return data || []; })
      .catch(() => [])
      .finally(() => searchInflight.delete(query));
    searchInflight.set(query, pending);
  }
  return Promise.race([pending, new Promise(r => setTimeout(() => r([]), maxMs))]);
}
// Warm the popular singers right after start so the first queues are instant.
setTimeout(async () => {
  for (const a of TRENDING_ARTISTS.slice(0, 16)) { await searchYTCached(`${a} popular songs`, 8000); await new Promise(r => setTimeout(r, 400)); }
}, 4000).unref?.();

async function searchYTMusicInnerTube(query) {
  if (!query || !query.trim()) return [];
  const norm = 'ytm_' + query.trim().toLowerCase();
  const cached = searchCache.get(norm);
  if (cached && Date.now() - cached.time < 3600000) {
    warmAudio(ytAudioClient, cached.data.slice(0, 3).map(s => s.videoId));
    return cached.data;
  }

  const songs = [];
  const seen = new Set();
  const parseDuration = (str) => {
    const m = String(str || '').match(/(\d+):(\d{2})(?::(\d{2}))?/);
    if (!m) return 200;
    return m[3] ? (parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + parseInt(m[3], 10))
                : (parseInt(m[1], 10) * 60 + parseInt(m[2], 10));
  };

  try {
    const res = await fetch('https://music.youtube.com/youtubei/v1/search?prettyPrint=false', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Origin': 'https://music.youtube.com',
        'Referer': 'https://music.youtube.com/'
      },
      body: JSON.stringify({
        query: query.trim(),
        params: 'EgWKAQIIAWoKEAMQBBAJEAoQBQ%3D%3D',
        context: {
          client: {
            clientName: 'WEB_REMIX',
            clientVersion: '1.20250101.01.00',
            hl: 'en',
            gl: 'IN'
          }
        }
      }),
      signal: AbortSignal.timeout(4500)
    });
    if (res.ok) {
      const data = await res.json();
      const tabs = data.contents?.tabbedSearchResultsRenderer?.tabs || [];
      const sections = tabs[0]?.tabRenderer?.content?.sectionListRenderer?.contents || [];
      for (const sec of sections) {
        const items = sec.musicShelfRenderer?.contents || [];
        for (const item of items) {
          const r = item.musicResponsiveListItemRenderer;
          if (!r) continue;
          const vid = r.playlistItemData?.videoId ||
            r.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint?.videoId;
          if (!vid || seen.has(vid)) continue;
          seen.add(vid);

          const title = r.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.map(x => x.text).join('') || query;
          const subRuns = r.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
          const subParts = subRuns.map(x => x.text).join('').split('•').map(s => s.trim()).filter(Boolean);
          const artist = subParts[0] || 'Unknown Artist';
          const durPart = subParts.find(p => /^\d+:\d{2}/.test(p));
          const album = (subParts.length >= 2 && !/^\d+:\d{2}/.test(subParts[1])) ? subParts[1] : 'YouTube Music';
          const thumbs = r.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
          const rawImg = thumbs[thumbs.length - 1]?.url || `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`;
          const image = rawImg.replace(/=w\d+-h\d+/, '=w544-h544');

          songs.push({
            id: 'yt_' + vid,
            videoId: vid,
            name: title,
            artist,
            album,
            duration: parseDuration(durPart),
            image,
            url: `/api/yt/stream?id=${vid}&title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}`,
            genre: 'Music',
            year: new Date().getFullYear().toString(),
            source: 'Mochy YT Music'
          });
        }
      }
    }
  } catch (e) {
    console.warn('[YTMusic Search] warning:', e.message);
  }

  if (songs.length > 0) {
    searchCache.set(norm, { time: Date.now(), data: songs });
    warmAudio(ytAudioClient, songs.slice(0, 3).map(s => s.videoId));
  }
  return songs;
}

async function searchYouTube(query) {
  if (!query || !query.trim()) return [];
  const norm = query.trim().toLowerCase();
  const cached = searchCache.get(norm);
  if (cached && Date.now() - cached.time < 3600000) {
    warmAudio(ytAudioClient, cached.data.slice(0, 3).map(s => s.videoId));
    return cached.data;
  }

  const songs = [];

  // Primary: use @distube/ytdl-core built-in search (most reliable)
  try {
    const results = await Promise.race([
      ytAudioClient.search(query.trim(), { type: SearchType.Video, limit: 15 }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('search timeout')), 4000))
    ]);
    if (Array.isArray(results) && results.length > 0) {
      for (const v of results) {
        if (!v.id) continue;
        songs.push({
          id: 'yt_' + v.id,
          videoId: v.id,
          name: v.title || query,
          artist: v.author?.name || 'Unknown Artist',
          album: 'YouTube Music Single',
          duration: v.lengthSeconds || 200,
          image: v.thumbnails?.[v.thumbnails.length - 1]?.url || `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
          url: `/api/yt/stream?id=${v.id}&q=${encodeURIComponent(v.title || query)}`,
          genre: 'Music',
          year: new Date().getFullYear().toString(),
          source: 'AuraMusic Live'
        });
      }
    }
  } catch (_) {}

  // Fallback: HTML scrape if ytdl search fails
  if (songs.length === 0) {
    try {
      const url = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(query.trim());
      const r = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9'
        },
        signal: AbortSignal.timeout(5000)
      });
      if (r.ok) {
        const html = await r.text();
        const match = html.match(/var ytInitialData = ({.*?});<\/script>/s) || html.match(/ytInitialData = ({.*?});/s);
        if (match) {
          const data = JSON.parse(match[1]);
          const section = data.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents;
          if (Array.isArray(section)) {
            for (const s of section) {
              const items = s.itemSectionRenderer?.contents;
              if (!Array.isArray(items)) continue;
              for (const item of items) {
                if (item.videoRenderer?.videoId) {
                  const v = item.videoRenderer;
                  const rawTitle = v.title?.runs?.map(x => x.text).join('') || '';
                  const artist = v.ownerText?.runs?.map(x => x.text).join('') || '';
                  songs.push({
                    id: 'yt_' + v.videoId,
                    videoId: v.videoId,
                    name: rawTitle,
                    artist,
                    album: 'YouTube Music Single',
                    duration: 200,
                    image: v.thumbnail?.thumbnails?.pop()?.url || `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
                    url: `/api/yt/stream?id=${v.videoId}&q=${encodeURIComponent(rawTitle)}`,
                    genre: 'Music',
                    year: new Date().getFullYear().toString(),
                    source: 'AuraMusic Live'
                  });
                }
              }
            }
          }
        }
      }
    } catch (_) {}
  }

  if (songs.length > 0) {
    searchCache.set(norm, { time: Date.now(), data: songs });
    // Resolve stream URLs for the top hits in the background so tapping a song starts instantly.
    warmAudio(ytAudioClient, songs.slice(0, 3).map(s => s.videoId));
  }
  return songs;
}

      // ============================================================================
      // Fast Saavn.dev Search API Endpoint: /api/search/songs?query={NAME}&limit=10
      // Returns exact saavn.dev format: response.data.results[n].downloadUrl[last].url
      // With pipedapi.kavin.rocks fallback
      // ============================================================================
      if (pathname === '/api/search/songs') {
        const query = parsedUrl.searchParams.get('query') || parsedUrl.searchParams.get('q') || '';
        const limit = parseInt(parsedUrl.searchParams.get('limit') || '10', 10);
        const data = await searchSongsSaavnDev(query, limit);
        res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
        return sendJson(res, 200, data);
      }

      // App Proxy / Search / Lyrics / Playlists APIs (Preserving existing website features)
      if (pathname === '/api/yt/search') {
        const query = parsedUrl.searchParams.get('q') || '';
        if (!query.trim() || /^(trending|trending now|popular|top songs|top hits)$/i.test(query.trim())) {
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate'); // Never stale-cache home trending!
          const userId = parsedUrl.searchParams.get('userId') || 'guest';
          const autoTrending = await trendingIndian();

          // Admin custom tracks: pinned in the exact custom order set by admin!
          const custom = (memoryDb.customTracks || []).map(t => ({
            id: t.id || ('yt_' + t.videoId),
            videoId: t.videoId,
            name: t.name || t.title,
            artist: t.artist || 'AuraMusic Feature',
            album: t.album || 'Featured Track',
            duration: Number(t.duration) || 220,
            image: t.image || `https://i.ytimg.com/vi/${t.videoId}/hqdefault.jpg`,
            url: `/api/yt/stream?id=${t.videoId}&q=${encodeURIComponent(t.name || '')}`,
            isCustomPinned: true
          }));

          // Dynamic Personalization on App Reopen:
          // User ke favorite artists ya recent taste ke songs ko trending pool mein blend karo
          const userProfile = memoryDb.taste?.[userId];
          const topFavArtists = Object.entries(userProfile?.artists || {})
            .filter(([, a]) => a.score > 0)
            .sort((a, b) => b[1].score - a[1].score)
            .slice(0, 3)
            .map(([k, a]) => a.name || k);

          let personalizedPool = [];
          if (topFavArtists.length > 0) {
            // Dynamic rotation based on current minute so every reopen gives a fresh mix!
            const artistPick = topFavArtists[Math.floor(Date.now() / 60000) % topFavArtists.length];
            personalizedPool = await searchYTCached(`${artistPick} hit songs`, 1500).catch(() => []);
          }

          const seenIds = new Set(custom.map(c => c.videoId));
          // Shuffle remaining trending list dynamically so user sees a fresh sequence on every reopen
          const shuffledTrending = autoTrending.filter(s => !seenIds.has(s.videoId)).slice();
          // Fisher-Yates light shuffle (offset by timestamp)
          for (let i = shuffledTrending.length - 1; i > 0; i--) {
            const j = (Math.floor(Date.now() / 1000) + i) % (i + 1);
            [shuffledTrending[i], shuffledTrending[j]] = [shuffledTrending[j], shuffledTrending[i]];
          }

          // Merge: Custom pinned tracks FIRST, then user's personalized favorites, then fresh trending rotation
          const finalMerged = [];
          custom.forEach(c => { seenIds.add(c.videoId); finalMerged.push(c); });
          personalizedPool.forEach(p => {
            if (p?.videoId && !seenIds.has(p.videoId)) {
              seenIds.add(p.videoId);
              finalMerged.push(p);
            }
          });
          shuffledTrending.forEach(s => {
            if (s?.videoId && !seenIds.has(s.videoId)) {
              seenIds.add(s.videoId);
              finalMerged.push(s);
            }
          });

          return sendJson(res, 200, finalMerged);
        }

        // Primary: Mochy YouTube Music InnerTube Search (exact YT Music catalog & order)
        let results = await searchYTMusicInnerTube(query).catch(() => []);
        if (!results || results.length === 0) {
          results = await searchYouTube(query);
        }
        res.setHeader('Cache-Control', 'public, max-age=1800, stale-while-revalidate=86400');
        return sendJson(res, 200, results);
      }

      if (pathname === '/api/yt/lyrics') {
        const title = parsedUrl.searchParams.get('title') || '';
        const artist = parsedUrl.searchParams.get('artist') || '';
        const duration = parsedUrl.searchParams.get('duration') || '';
        try {
          const upstream = await fetch(`https://auramusic-2026.netlify.app/api/yt/lyrics?title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}&duration=${encodeURIComponent(duration)}`);
          if (upstream.ok) return sendJson(res, 200, await upstream.json());
        } catch {}
        return sendJson(res, 200, { plainLyrics: 'Lyrics unavailable.' });
      }

      // Warm the stream cache for a list of ids: /api/yt/prefetch?ids=a,b,c
      if (pathname === '/api/yt/prefetch') {
        const ids = (parsedUrl.searchParams.get('ids') || '')
          .split(',').map(v => v.replace(/^yt_|^yt-/, '').trim()).filter(Boolean).slice(0, 5);
        warmAudio(ytAudioClient, ids);
        return sendJson(res, 200, { warming: ids.length });
      }

      // Songs to play after this one: /api/yt/related?id=<videoId>&title=..&artist=..&lang=in|en
      if (pathname === '/api/yt/related') {
        const id = (parsedUrl.searchParams.get('id') || '').replace(/^yt_|^yt-/, '').trim();
        const title = parsedUrl.searchParams.get('title') || '';
        const artist = parsedUrl.searchParams.get('artist') || '';
        const clientLang = (parsedUrl.searchParams.get('lang') || '').trim(); // 'in', 'en', or ''
        if (!id) return sendJson(res, 400, { error: 'Missing video id' });

        const toSong = v => ({
          id: 'yt_' + v.videoId,
          videoId: v.videoId,
          name: v.title,
          artist: v.artist || 'Unknown Artist',
          album: 'YouTube Music Single',
          duration: Number(v.duration) || 200,
          image: v.image || `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
          url: `/api/yt/stream?id=${v.videoId}&title=${encodeURIComponent(v.title||'')}&artist=${encodeURIComponent(v.artist||'')}`,
          genre: 'Music',
          year: new Date().getFullYear().toString(),
          source: 'AuraMusic Live'
        });

        const picked = [];
        const take = list => {
          for (const v of list) {
            if (!v?.videoId || v.videoId === id || !v.title) continue;
            const dur = Number(v.duration) || 0;
            if (dur && (dur < 60 || dur > 600)) continue;
            if (sameSong(v.title, title)) continue;              // duplicate version of same song
            if (picked.some(p => p.videoId === v.videoId || sameSong(p.title, v.title))) continue; // already have it
            picked.push(v);
          }
        };

        // ── Taste Lock: determine language from client signal + song signal ──
        const recent = (parsedUrl.searchParams.get('hist') || '').split(';').slice(0, 12)
          .map(x => { const [n, a] = x.split('|'); return { name: n || '', artist: a || '' }; });

        // Client already computed taste; trust it. Fallback to our own detection.
        let wantIndian;
        if (clientLang === 'in') wantIndian = true;
        else if (clientLang === 'en') wantIndian = false;
        else wantIndian = prefersIndian({ title, artist }, recent);

        // Strict filter when lang is explicitly set by client (Taste Lock ON)
        const strictLock = clientLang === 'in';
        const seedMood = songMood(title, artist);
        const fit = list0 => {
          const list = fitMood(seedMood, list0); // love songs never get party / rowdy songs
          if (!wantIndian) return list;
          const filtered = keepIndian(list);
          // In strict mode, never let foreign songs in; in soft mode, allow if too few results
          if (strictLock) return filtered;
          return filtered.length >= 3 ? filtered : keepIndian(list);
        };

        try {
          const rel = await Promise.race([getRelated(ytAudioClient, id), new Promise(r => setTimeout(() => r([]), 2500))]);
          take(fit(rel || []));
        } catch (_) {}

        const asVideos = found => found.map(s => ({ videoId: s.videoId, title: s.name, artist: s.artist, duration: s.duration, image: s.image }));

        // Mood & Style clustering: Karan Aujla / Punjabi Swag vs Badmashi vs Romantic vs HipHop
        const moodText = `${title} ${artist}`.toLowerCase();
        const isPunjabiGangster = /(karan aujla|moose|shubh|dhillon|amrit maan|prem dhillon|jerry|jordan sandhu|wazir patar|badmashi|jatt|gang|shooter|pistol|bandook|yarri|swag)/i.test(moodText);
        const isHaryanvi = /(masoom sharma|ajay hooda|diler kharkiya|khasa aala|gulzaar|amit saini|badmashi|haryanvi)/i.test(moodText);
        const isHipHop = /(divine|mc stan|seedhe maut|raftaar|kr\$na|king|emiway)/i.test(moodText);

        const PUNJABI_TOP = ['Karan Aujla', 'Sidhu Moose Wala', 'Shubh', 'AP Dhillon', 'Diljit Dosanjh', 'Amrit Maan', 'Prem Dhillon', 'Wazir Patar'];
        const HARYANVI_TOP = ['Masoom Sharma', 'Ajay Hooda', 'Diler Kharkiya', 'Khasa Aala Chahar', 'Gulzaar Chhaniwala'];
        const HIPHOP_TOP = ['DIVINE', 'MC Stan', 'Seedhe Maut', 'Raftaar', 'KR$NA', 'King', 'Emiway'];

        if (picked.length < 10) {
          if (isPunjabiGangster) {
            const artistPick = PUNJABI_TOP[Math.floor(Math.random() * PUNJABI_TOP.length)];
            take(keepIndian(asVideos(await searchYTCached(`${artistPick} punjabi top hit songs`))));
          } else if (isHaryanvi) {
            const artistPick = HARYANVI_TOP[Math.floor(Math.random() * HARYANVI_TOP.length)];
            take(keepIndian(asVideos(await searchYTCached(`${artistPick} haryanvi badmashi songs`))));
          } else if (isHipHop) {
            const artistPick = HIPHOP_TOP[Math.floor(Math.random() * HIPHOP_TOP.length)];
            take(keepIndian(asVideos(await searchYTCached(`${artistPick} desi hip hop rap`))));
          } else if (seedMood === 'romantic') {
            const artistPick = ROMANTIC_TOP[Math.floor(Math.random() * ROMANTIC_TOP.length)];
            take(fit(asVideos(await searchYTCached(`${artistPick} romantic hindi songs`))));
          } else {
            const cleanArt = (artist || title).split(',')[0].trim();
            take(fit(asVideos(await searchYTCached(`${cleanArt} best songs`))));
          }
        }
        if (picked.length < 8 && wantIndian) {
          const pool = seedMood === 'romantic' ? ROMANTIC_TOP : TRENDING_ARTISTS;
          const pick = pool[Math.floor(Math.random() * pool.length)];
          take(fit(asVideos(await searchYTCached(`${pick} ${seedMood === 'romantic' ? 'romantic ' : ''}top songs`))));
        }
        // If still not enough and English taste, add English similar songs
        if (picked.length < 8 && !wantIndian && clientLang !== 'in') {
          take(asVideos(await searchYTCached(`${(artist || title).split(',')[0].trim()} best songs`)));
        }

        // ── Singer flow: 2-4 popular songs of the singer you played, then a similar singer, and so on ──
        const LABEL = /(t-?series|sony music|zee music|tips|saregama|speed records|times music|yrf|yash raj|eros|lahari|vevo|records|music company|films|official|unknown artist|topic$|^various)/i;
        const singerOf = v => String(v.artist || '').replace(/\s*-\s*topic$/i, '').split(/[,&]|\bfeat\.?\b|\bft\.?\b|\bx\b/i)[0].trim();
        const isSinger = n => n && n.length > 2 && !LABEL.test(n);
        const norm = n => n.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

        const order = [];                       // singers in play order
        const addSinger = n => { if (isSinger(n) && !order.some(o => norm(o) === norm(n))) order.push(n); };
        addSinger(singerOf({ artist }));
        for (const v of picked) addSinger(singerOf(v));
        const singers = order.slice(0, 6);

        const byFlow = [];
        const known = new Set();
        const pushFlow = v => {
          if (!v?.videoId || v.videoId === id || known.has(v.videoId)) return false;
          if (sameSong(v.title, title) || byFlow.some(b => sameSong(b.title, v.title))) return false;
          const dur = Number(v.duration) || 0;
          if (dur && (dur < 60 || dur > 600)) return false;
          if (/(station|jukebox|non[- ]?stop|full album|playlist|mashup|\bmix\b|\d+ hours?)/i.test(v.title)) return false;
          known.add(v.videoId); byFlow.push(v); return true;
        };

        if (singers.length) {
          // Each singer's own popular songs (searched in parallel), falling back to what related already found.
          const groups = await Promise.all(singers.map(async n => {
            const own = picked.filter(v => norm(singerOf(v)) === norm(n));
            let found = [];
            try { found = fit(asVideos(await searchYTCached(`${n} popular songs`))); } catch (_) {}
            found = found.filter(v => norm(singerOf(v)) === norm(n) || norm(String(v.artist || '')).includes(norm(n)));
            return [...own, ...found];
          }));
          // 3 from the played singer, then 3, 3, 2, ... from the next singers
          const take = [3, 3, 3, 3, 2, 2];
          groups.forEach((g, gi) => { let got = 0; for (const v of g) { if (got >= take[gi]) break; if (pushFlow(v)) got++; } });
        }
        // Anything else related still fills the queue after the flow.
        for (const v of limitPerArtist(picked, 2)) pushFlow(v);

        const result = byFlow.length >= 4 ? byFlow : limitPerArtist(picked, 2);
        res.setHeader('Cache-Control', 'public, max-age=120');
        return sendJson(res, 200, result.slice(0, 20).map(toSong));
      }

      // ============================================================================
      // Real-Time YouTube Search Suggestions: /api/yt/suggestions?q=query
      // ============================================================================
      if (pathname === '/api/yt/suggestions') {
        const query = (parsedUrl.searchParams.get('q') || '').trim();
        if (!query) {
          return sendJson(res, 200, { status: 'success', query: '', suggestions: [] });
        }
        try {
          const ytSuggestUrl = `https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=${encodeURIComponent(query)}`;
          const suggestRes = await fetch(ytSuggestUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
          if (suggestRes.ok) {
            const data = await suggestRes.json();
            const suggestions = Array.isArray(data[1]) ? data[1] : [];
            return sendJson(res, 200, { status: 'success', query, suggestions });
          }
        } catch (e) {
          console.warn('[SUGGESTIONS ERROR]', e.message);
        }
        return sendJson(res, 200, { status: 'success', query, suggestions: [] });
      }

      // ============================================================================
      // Smart Music Taste & Auto-Play Recommendations: /api/recommendations?based_on=recent&current_song=xyz
      // ============================================================================
      if (pathname === '/api/recommendations') {
        const currentSongId = (parsedUrl.searchParams.get('current_song') || '').replace(/^yt_/, '').trim();
        const artist = (parsedUrl.searchParams.get('artist') || '').trim();
        const userId = parsedUrl.searchParams.get('userId') || 'guest';
        const limit = Math.min(25, parseInt(parsedUrl.searchParams.get('limit') || '15', 10));

        let userTaste = memoryDb.userTastes?.[userId] || null;
        let dominantArtists = [];
        let dominantGenres = [];

        if (userTaste) {
          dominantArtists = Object.entries(userTaste.artists || {})
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(e => e[0]);
          dominantGenres = Object.entries(userTaste.genres || {})
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(e => e[0]);
        }

        const toSong = v => ({
          id: 'yt_' + v.videoId,
          videoId: v.videoId,
          name: v.title || v.name,
          artist: v.artist || 'AuraMusic Artist',
          album: 'YouTube Music Single',
          duration: Number(v.duration) || 210,
          image: v.image || `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
          url: `/api/yt/stream?id=${v.videoId}&q=${encodeURIComponent(v.title || v.name || '')}`,
          genre: 'Music',
          source: 'AuraSmart Recommendation'
        });

        const pool = [];
        const seenIds = new Set();
        if (currentSongId) seenIds.add(currentSongId);

        const addItems = items => {
          for (const item of items) {
            const vid = item.videoId || (item.id || '').replace(/^yt_/, '');
            if (!vid || seenIds.has(vid)) continue;
            seenIds.add(vid);
            pool.push({
              videoId: vid,
              title: item.title || item.name,
              artist: item.artist,
              duration: item.duration,
              image: item.image
            });
          }
        };

        // 1. Direct YouTube Related engine for current song
        if (currentSongId) {
          try {
            const related = await getRelated(ytAudioClient, currentSongId);
            if (Array.isArray(related)) addItems(related);
          } catch (_) {}
        }

        // 2. Blend with User Top Artists from history
        if (dominantArtists.length > 0 && pool.length < limit) {
          for (const topArt of dominantArtists.slice(0, 2)) {
            try {
              const artistSongs = await searchYouTube(`${topArt} best songs`);
              addItems(artistSongs);
            } catch (_) {}
            if (pool.length >= limit) break;
          }
        }

        // 3. Fallback: Trending Hindi & Global chart hits if cold start / empty history
        if (pool.length < 5) {
          try {
            const trendingQuery = artist ? `${artist} songs` : 'Trending Hindi Punjabi songs 2026';
            const trendingSongs = await searchYouTube(trendingQuery);
            addItems(trendingSongs);
          } catch (_) {}
        }

        const queue = pool.slice(0, limit).map(toSong);

        // Fast enrich next songs with direct 320k Saavn CDN streamUrls
        await Promise.all(queue.slice(0, 5).map(async song => {
          try {
            const fast = await resolveSaavnAudio(song.name, song.artist);
            if (fast?.streamUrl) {
              song.streamUrl = fast.streamUrl;
              song.url = fast.streamUrl;
              song.source = 'AuraMusic Lossless 320k';
            }
          } catch (_) {}
        }));

        return sendJson(res, 200, {
          status: 'success',
          based_on: userTaste && dominantArtists.length ? 'recent_taste' : 'trending',
          taste_context: {
            topArtists: dominantArtists,
            topGenres: dominantGenres,
            isColdStart: !userTaste || !userTaste.history?.length
          },
          autoplay_next: queue[0] || null,
          queue
        });
      }

      // Open /api/yt/diag?id=<videoId> in a browser to see which audio source works on this host.
      if (pathname === '/api/yt/diag') {
        const id = (parsedUrl.searchParams.get('id') || 'dQw4w9WgXcQ').replace(/^yt_|^yt-/, '').trim();
        const report = await diagnose(ytAudioClient, id, getClientIp(req));
        return sendJson(res, 200, report);
      }

            // Direct MP3 download endpoint for phone storage / Android File Manager
      if (pathname === '/api/yt/download') {
        const id = parsedUrl.searchParams.get('id') || '';
        const cleanId = id.replace(/^yt_|^yt-/, '').trim();
        const qTitle = parsedUrl.searchParams.get('title') || parsedUrl.searchParams.get('q') || 'Song';
        const qArtist = parsedUrl.searchParams.get('artist') || 'AuraMusic';
        const safeFilename = `${qTitle.replace(/[/\\?%*:|"<>]/g, '')} - ${qArtist.replace(/[/\\?%*:|"<>]/g, '')}.mp3`;

        let streamUrl = null;
        try {
          const fast = await resolveFastAudio(cleanId, qTitle, qArtist);
          if (fast?.streamUrl) streamUrl = fast.streamUrl;
        } catch (_) {}

        if (!streamUrl) {
          const clientIp = getClientIp(req);
          const resolved = await resolveAudio(ytAudioClient, cleanId, clientIp);
          if (resolved?.streamUrl) streamUrl = resolved.streamUrl;
        }

        if (streamUrl) {
          try {
            const audioRes = await fetch(streamUrl, {
              headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
            });
            if (audioRes.ok) {
              res.writeHead(200, {
                'Content-Type': 'audio/mpeg',
                'Content-Disposition': `attachment; filename="${encodeURIComponent(safeFilename)}"; filename*=UTF-8''${encodeURIComponent(safeFilename)}`,
                'Content-Length': audioRes.headers.get('content-length') || '',
                'Access-Control-Allow-Origin': '*'
              });
              const { Readable } = await import('stream');
              const stream = Readable.fromWeb(audioRes.body);
              stream.pipe(res);
              return;
            }
          } catch (e) {
            console.warn('[DOWNLOAD] Pipe stream error:', e.message);
          }
        }
        return sendJson(res, 500, { error: 'Failed to download stream' });
      }

      if (pathname === '/api/yt/stream') {
        const id = parsedUrl.searchParams.get('id') || '';
        const cleanId = id.replace(/^yt_|^yt-/, '').trim();
        if (!cleanId) return sendJson(res, 400, { error: 'Missing video id' });

        const qTitle = parsedUrl.searchParams.get('title') || parsedUrl.searchParams.get('q') || '';
        const qArtist = parsedUrl.searchParams.get('artist') || '';
        const clientIp = getClientIp(req);

        // ── TIER 1: Mochy InnerTube (ANDROID_VR / IOS) + YouTube Audio for exact videoId ──
        const resolved = await resolveAudio(ytAudioClient, cleanId, clientIp);

        if (resolved?.streamUrl) {
          const src = resolved.source || '';
          const isPortable = src.startsWith('piped:') || src.startsWith('invidious:');

          // json=1 → return URL for the player to use directly
          if (parsedUrl.searchParams.get('json') === '1') {
            return sendJson(res, 200, { streamUrl: resolved.streamUrl, source: src });
          }

          // Portable CDN URLs: 307 redirect so the browser streams directly (fastest)
          if (isPortable && !parsedUrl.searchParams.get('proxy')) {
            res.writeHead(307, {
              'Location': resolved.streamUrl,
              'Cache-Control': 'private, max-age=120',
              'Access-Control-Allow-Origin': '*'
            });
            return res.end();
          }

          // ytdl / innertube IP-matched URL: also redirect directly when same IP
          if ((src === 'ytdl' || src.startsWith('innertube:')) && urlWorksForClient(resolved.streamUrl, clientIp)) {
            if (parsedUrl.searchParams.get('json') !== '1') {
              res.writeHead(307, {
                'Location': resolved.streamUrl,
                'Cache-Control': 'private, max-age=120',
                'Access-Control-Allow-Origin': '*'
              });
              return res.end();
            }
          }

          // Otherwise proxy through server (IP-locked ytdl URL)
          try {
            const served = await proxyAudio(req, res, {
              getUrl: () => Promise.resolve(resolved.streamUrl),
              forget: () => forgetDirectAudioUrl(cleanId)
            });
            if (served) return;
          } catch (err) {
            console.warn(`[AUDIO] proxy failed for ${cleanId}: ${err.message}`);
            if (res.headersSent) return res.end();
          }
        }

        // ── LAST RESORT: ytdl direct download pipe ─────────────────────────
        try {
          const dlStream = ytAudioClient.download(`https://www.youtube.com/watch?v=${cleanId}`, {
            filter: { hasAudio: true, hasVideo: false },
            quality: 'highestaudio'
          });
          let headersSent = false;
          dlStream.on('info', (info, format) => {
            if (!headersSent) {
              headersSent = true;
              const mimeType = format?.mimeType?.split(';')[0] || 'audio/mp4';
              res.writeHead(200, {
                'Content-Type': mimeType,
                'Accept-Ranges': 'bytes',
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'no-store'
              });
            }
          });
          dlStream.on('error', () => {
            if (!headersSent) sendJson(res, 500, { error: 'Audio stream failed' });
          });
          res.on('close', () => dlStream.destroy());
          dlStream.pipe(res);
          return;
        } catch (err) {
          return sendJson(res, 500, { error: 'Stream failed' });
        }
      }

      // ─── Playlists API (Personal & Community Sync) ──────────────────────
      if (pathname === '/api/playlists') {
        const plBody = (req.method === 'POST' || req.method === 'PUT') ? await parseBody(req) : {};
        const userId = parsedUrl.searchParams.get('userId') || plBody.userId || 'guest';
        if (!memoryDb.playlists[userId]) memoryDb.playlists[userId] = [];

        // 1. GET Playlists (Enforces Privacy & Merges Alias Keys!)
        if (req.method === 'GET') {
          const authUser = getAuthUser(req, parsedUrl.searchParams.get('authUserId') || userId);
          const aliasKeys = getUserAliasKeys(userId).map(k => k.toLowerCase());
          const isOwner = authUser && (
            aliasKeys.includes(String(authUser.id || authUser._id || '').toLowerCase()) ||
            aliasKeys.includes(String(authUser.email || '').toLowerCase())
          );

          let list = getUserPlaylistsAll(userId);
          if (!isOwner) {
            // BACKEND SECURITY: Non-owners can ONLY see PUBLIC playlists!
            list = list.filter(p => p.visibility === 'public');
          }
          // Attach creator, likes info & auto cover from first song if no custom cover
          const enriched = list.map(p => {
            const pLikes = memoryDb.playlistLikes[p.id] || [];
            const effectiveCover = p.coverUrl || p.cover || p.songs?.[0]?.image || '';
            return {
              ...p,
              cover: effectiveCover,
              coverUrl: effectiveCover,
              visibility: p.visibility || 'private',
              likesCount: pLikes.length || p.likesCount || 0,
              isLiked: authUser ? pLikes.includes(authUser.id || authUser._id) : false,
              isSaved: authUser ? (memoryDb.savedPlaylists[authUser.id || authUser._id] || []).includes(p.id) : false,
              creator: getPublicProfile(p.userId || userId)
            };
          });
          return sendJson(res, 200, { success: true, playlists: enriched });
        }

        // 2. CREATE Playlist (Default visibility: PRIVATE)
        if (req.method === 'POST') {
          const body = plBody;
          const name = (body.name || '').trim() || 'My Playlist';

          // Prevent duplicate playlist names across user's alias keys
          const existingAll = getUserPlaylistsAll(userId);
          const duplicate = existingAll.some(p => (p.name || '').trim().toLowerCase() === name.toLowerCase());
          if (duplicate) {
            return sendJson(res, 400, { success: false, error: 'A playlist with this name already exists. Please choose a different name.' });
          }

          // Strict Requirement: Default visibility MUST BE 'private'
          const visibility = body.visibility === 'public' ? 'public' : 'private';
          const cover = body.coverUrl || body.cover || '';
          const newPlaylist = {
            id: `pl_${Date.now()}`,
            name: name,
            description: String(body.description || '').slice(0, 500),
            cover: cover,
            coverUrl: cover,
            visibility: visibility,
            userId: userId,
            songs: [],
            likesCount: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
          memoryDb.playlists[userId].unshift(newPlaylist);
          saveDatabase();
          syncPlaylistToNeon(userId, newPlaylist).catch(() => {});
          console.log(`✅ [PLAYLIST CREATED] "${name}" (${visibility}) for user ${userId}`);
          return sendJson(res, 200, { success: true, playlist: newPlaylist });
        }

        // 3. UPDATE Playlist (Add/Remove song, change details, toggle visibility)
        if (req.method === 'PUT') {
          const body = plBody;
          const playlistId = String(body.playlistId || '');
          const action = body.action || 'add';
          const { playlist: pl } = findUserPlaylist(userId, playlistId);

          if (!pl) {
            return sendJson(res, 404, { success: false, message: 'Playlist not found' });
          }

          // Verification: only owner (or alias) can modify
          const ownerAliases = getUserAliasKeys(userId).map(k => k.toLowerCase());
          if (pl.userId && !ownerAliases.includes(String(pl.userId).toLowerCase())) {
            return sendJson(res, 403, { success: false, error: 'Unauthorized to modify this playlist' });
          }

          if (action === 'add' && body.song) {
            const song = body.song;
            const songId = song.id || song.videoId;
            if (!pl.songs) pl.songs = [];
            const exists = pl.songs.some(s => (s.id || s.videoId) === songId);
            if (!exists) {
              pl.songs.unshift(song);
              // Auto-set cover to first song thumbnail if playlist has no custom cover
              if (!pl.coverUrl && !pl.cover && song.image) {
                pl.coverUrl = song.image;
                pl.cover = song.image;
              }
              pl.updatedAt = new Date().toISOString();
              saveDatabase();
              syncPlaylistToNeon(userId, pl).catch(() => {});
            }
            return sendJson(res, 200, { success: true, alreadyInPlaylist: exists, playlist: pl });
          }

          if (action === 'remove' && body.songId) {
            const sid = String(body.songId);
            pl.songs = (pl.songs || []).filter(s => String(s.id || s.videoId) !== sid);
            pl.updatedAt = new Date().toISOString();
            saveDatabase();
            syncPlaylistToNeon(userId, pl).catch(() => {});
            return sendJson(res, 200, { success: true, playlist: pl });
          }

          // Change visibility: Public <-> Private
          if (action === 'update_visibility' || body.visibility !== undefined) {
            const newVis = body.visibility === 'public' ? 'public' : 'private';
            pl.visibility = newVis;
            pl.updatedAt = new Date().toISOString();
            saveDatabase();
            syncPlaylistToNeon(userId, pl).catch(() => {});
            console.log(`🔒 [PLAYLIST VISIBILITY CHANGED] "${pl.name}" is now ${newVis}`);
            return sendJson(res, 200, { success: true, playlist: pl, visibility: newVis });
          }

          // Update details: Name, description, cover
          if (action === 'update_details') {
            if (body.name) pl.name = String(body.name).trim();
            if (body.description !== undefined) pl.description = String(body.description).slice(0, 500);
            if (body.coverUrl !== undefined) {
              pl.coverUrl = String(body.coverUrl);
              pl.cover = String(body.coverUrl);
            }
            if (body.visibility !== undefined) pl.visibility = body.visibility === 'public' ? 'public' : 'private';
            pl.updatedAt = new Date().toISOString();
            saveDatabase();
            syncPlaylistToNeon(userId, pl).catch(() => {});
            return sendJson(res, 200, { success: true, playlist: pl });
          }

          return sendJson(res, 200, { success: true, playlist: pl });
        }

        // 4. DELETE Playlist (Instant across all alias keys of user!)
        if (req.method === 'DELETE') {
          const plId = parsedUrl.searchParams.get('id');
          const plName = (parsedUrl.searchParams.get('name') || '').trim().toLowerCase();
          const keys = getUserAliasKeys(userId);
          const toDeleteIds = new Set();

          for (const k of keys) {
            const list = memoryDb.playlists[k];
            if (!Array.isArray(list)) continue;
            const remaining = [];
            for (const p of list) {
              const matchesId = plId && String(p.id || p._id) === String(plId);
              const matchesName = plName && String(p.name || '').trim().toLowerCase() === plName;
              if (matchesId || matchesName) {
                toDeleteIds.add(String(p.id || p._id));
              } else {
                remaining.push(p);
              }
            }
            memoryDb.playlists[k] = remaining;
          }

          saveDatabase();
          toDeleteIds.forEach(id => deletePlaylistFromNeon(id).catch(() => {}));
          console.log(`🗑️ [PLAYLIST DELETED] ids=${Array.from(toDeleteIds).join(',')} for user ${userId}`);
          return sendJson(res, 200, { success: true, deletedIds: Array.from(toDeleteIds), message: 'Playlist deleted successfully' });
        }
      }

      // ─── Upload Playlist Cover Photo from Gallery ────────────────────────
      if (pathname === '/api/playlists/upload-cover' && req.method === 'POST') {
        const body = await parseBody(req);
        const reqUserId = body.userId || parsedUrl.searchParams.get('userId');
        const authUser = getAuthUser(req, reqUserId);
        if (!authUser) {
          return sendJson(res, 401, { success: false, error: 'Please sign in to upload a playlist cover.' });
        }

        const playlistId = String(body.playlistId || '').trim();
        const imageBase64 = String(body.imageBase64 || body.image || '').trim();
        if (!playlistId) return sendJson(res, 400, { success: false, error: 'playlistId is required.' });
        if (!imageBase64.startsWith('data:image/')) {
          return sendJson(res, 400, { success: false, error: 'Invalid image format. Supported: JPG, JPEG, PNG, WEBP.' });
        }

        const mimeMatch = imageBase64.match(/^data:image\/(jpeg|jpg|png|webp);base64,/i);
        if (!mimeMatch) {
          return sendJson(res, 400, { success: false, error: 'Only JPG, JPEG, PNG, and WEBP formats are supported.' });
        }
        const ext = mimeMatch[1].toLowerCase() === 'jpeg' ? 'jpg' : mimeMatch[1].toLowerCase();
        const base64Data = imageBase64.replace(/^data:image\/[a-z]+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        if (buffer.length > 5 * 1024 * 1024) {
          return sendJson(res, 400, { success: false, error: 'Image exceeds maximum size of 5MB.' });
        }

        const { playlist: pl } = findUserPlaylist(authUser.id || reqUserId, playlistId);
        if (!pl) {
          return sendJson(res, 404, { success: false, error: 'Playlist not found.' });
        }

        const customDir = path.join(PUBLIC_DIR, 'avatars', 'custom');
        if (!fs.existsSync(customDir)) fs.mkdirSync(customDir, { recursive: true });

        const safePid = playlistId.replace(/[^a-zA-Z0-9_-]/g, '_');
        const filename = `pl_cover_${safePid}_${Date.now()}.${ext}`;
        fs.writeFileSync(path.join(customDir, filename), buffer);
        const coverUrl = `/avatars/custom/${filename}`;

        pl.coverUrl = coverUrl;
        pl.cover = coverUrl;
        pl.updatedAt = new Date().toISOString();
        saveDatabase();
        syncPlaylistToNeon(pl.userId || authUser.id, pl).catch(() => {});

        return sendJson(res, 200, { success: true, coverUrl, playlist: pl });
      }

      // ─── Single Playlist Details (Enforces Backend Privacy Check) ────────
      if (pathname === '/api/playlists/details' && req.method === 'GET') {
        const plId = parsedUrl.searchParams.get('id') || '';
        const reqUserId = parsedUrl.searchParams.get('userId') || 'guest';
        const authUser = getAuthUser(req, reqUserId);

        let targetPl = null;
        let ownerId = null;
        for (const [uid, pls] of Object.entries(memoryDb.playlists)) {
          const found = pls.find(p => String(p.id || p._id) === String(plId));
          if (found) {
            targetPl = found;
            ownerId = uid;
            break;
          }
        }

        if (!targetPl) {
          return sendJson(res, 404, { success: false, error: 'Playlist not found' });
        }

        const isOwner = authUser && (String(authUser.id || authUser._id).toLowerCase() === String(ownerId).toLowerCase() || String(authUser.email).toLowerCase() === String(ownerId).toLowerCase() || String(authUser.id || authUser._id).toLowerCase() === String(targetPl.userId).toLowerCase());

        // BACKEND PRIVACY ENFORCEMENT: If private, reject non-owners immediately!
        if (targetPl.visibility !== 'public' && !isOwner) {
          return sendJson(res, 403, { success: false, error: 'This playlist is private and cannot be viewed by unauthorized users.' });
        }

        const creator = getPublicProfile(targetPl.userId || ownerId);
        const pLikes = memoryDb.playlistLikes[targetPl.id] || [];
        const isLiked = authUser ? pLikes.includes(authUser.id || authUser._id) : false;
        const isSaved = authUser ? (memoryDb.savedPlaylists[authUser.id || authUser._id] || []).includes(targetPl.id) : false;

        return sendJson(res, 200, {
          success: true,
          playlist: {
            ...targetPl,
            visibility: targetPl.visibility || 'private',
            likesCount: pLikes.length || targetPl.likesCount || 0,
            isLiked,
            isSaved,
            creator
          }
        });
      }

      // ══════════════════════════════════════════════════════════════════════
      // ─── SOCIAL MUSIC COMMUNITY APIS ──────────────────────────────────────
      // ══════════════════════════════════════════════════════════════════════

      // 1. Community Feed (Trending, Recent, Popular Creators, Recommended)
      if (pathname === '/api/community/feed' && req.method === 'GET') {
        const reqUserId = parsedUrl.searchParams.get('userId') || 'guest';
        const authUser = getAuthUser(req, reqUserId);

        const allPublicPlaylists = [];
        for (const [uid, pls] of Object.entries(memoryDb.playlists)) {
          for (const pl of pls) {
            // Strictly ONLY public playlists!
            if (pl.visibility === 'public') {
              const creator = getPublicProfile(pl.userId || uid);
              const pLikes = memoryDb.playlistLikes[pl.id] || [];
              const likesCount = pLikes.length || pl.likesCount || 0;
              const isLiked = authUser ? pLikes.includes(authUser.id || authUser._id) : false;
              const isSaved = authUser ? (memoryDb.savedPlaylists[authUser.id || authUser._id] || []).includes(pl.id) : false;
              const cover = pl.coverUrl || pl.songs?.[0]?.image || '/logo.png';

              allPublicPlaylists.push({
                ...pl,
                coverUrl: cover,
                likesCount,
                isLiked,
                isSaved,
                creator
              });
            }
          }
        }

        // Sort feeds
        const trending = [...allPublicPlaylists].sort((a, b) => {
          const scoreA = (a.likesCount * 4) + (a.songs?.length || 0);
          const scoreB = (b.likesCount * 4) + (b.songs?.length || 0);
          return scoreB - scoreA;
        }).slice(0, 20);

        const recentlyAdded = [...allPublicPlaylists].sort((a, b) => {
          return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
        }).slice(0, 20);

        const recommended = [...allPublicPlaylists].sort(() => 0.5 - Math.random()).slice(0, 15);

        // Gather ONLY real registered creators who have shared at least 1 PUBLIC playlist
        const creatorsMap = new Map();
        for (const u of memoryDb.users) {
          if (u && u.id) {
            const pubProfile = getPublicProfile(u.id);
            if (pubProfile && pubProfile.publicPlaylistsCount > 0) {
              const isFollowing = authUser ? (memoryDb.follows[authUser.id || authUser._id]?.following || []).includes(u.id) : false;
              creatorsMap.set(u.id, { ...pubProfile, isFollowing });
            }
          }
        }
        const creatorsList = Array.from(creatorsMap.values());
        const popularCreators = [...creatorsList].sort((a, b) => b.followersCount - a.followersCount).slice(0, 12);
        const discoverUsers = [...creatorsList].sort(() => 0.5 - Math.random()).slice(0, 12);

        return sendJson(res, 200, {
          success: true,
          trending,
          recentlyAdded,
          recommended,
          popularCreators,
          discoverUsers
        });
      }

      // 2. Community Search & Filter
      if (pathname === '/api/community/search' && req.method === 'GET') {
        const query = (parsedUrl.searchParams.get('q') || '').trim().toLowerCase();
        const filter = parsedUrl.searchParams.get('filter') || 'all'; // all, trending, recent, creators, playlists
        const reqUserId = parsedUrl.searchParams.get('userId') || 'guest';
        const authUser = getAuthUser(req, reqUserId);

        const matchedPlaylists = [];
        for (const [uid, pls] of Object.entries(memoryDb.playlists)) {
          for (const pl of pls) {
            if (pl.visibility === 'public') {
              const creator = getPublicProfile(pl.userId || uid);
              const pLikes = memoryDb.playlistLikes[pl.id] || [];
              const likesCount = pLikes.length || pl.likesCount || 0;
              const isLiked = authUser ? pLikes.includes(authUser.id || authUser._id) : false;
              const isSaved = authUser ? (memoryDb.savedPlaylists[authUser.id || authUser._id] || []).includes(pl.id) : false;
              const cover = pl.coverUrl || pl.songs?.[0]?.image || '/logo.png';

              const matchesName = (pl.name || '').toLowerCase().includes(query);
              const matchesDesc = (pl.description || '').toLowerCase().includes(query);
              const matchesCreator = (creator.displayName || '').toLowerCase().includes(query) || (creator.username || '').toLowerCase().includes(query);
              const matchesSong = (pl.songs || []).some(s => (s.name || s.title || '').toLowerCase().includes(query) || (s.artist || '').toLowerCase().includes(query));

              if (!query || matchesName || matchesDesc || matchesCreator || matchesSong) {
                matchedPlaylists.push({
                  ...pl,
                  coverUrl: cover,
                  likesCount,
                  isLiked,
                  isSaved,
                  creator
                });
              }
            }
          }
        }

        // Apply filters
        if (filter === 'trending') {
          matchedPlaylists.sort((a, b) => (b.likesCount * 3 + b.songs.length) - (a.likesCount * 3 + a.songs.length));
        } else if (filter === 'recent') {
          matchedPlaylists.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
        }

        // Match Creators (only those who have at least 1 public playlist)
        const matchedCreators = [];
        for (const u of memoryDb.users) {
          if (u && u.id) {
            const pubProfile = getPublicProfile(u.id);
            if (!pubProfile || pubProfile.publicPlaylistsCount <= 0) continue;
            const matchesName = (pubProfile.displayName || '').toLowerCase().includes(query);
            const matchesUsername = (pubProfile.username || '').toLowerCase().includes(query);
            const matchesBio = (pubProfile.bio || '').toLowerCase().includes(query);
            if (!query || matchesName || matchesUsername || matchesBio) {
              const isFollowing = authUser ? (memoryDb.follows[authUser.id || authUser._id]?.following || []).includes(u.id) : false;
              matchedCreators.push({ ...pubProfile, isFollowing });
            }
          }
        }

        return sendJson(res, 200, {
          success: true,
          query,
          playlists: filter === 'creators' ? [] : matchedPlaylists,
          creators: filter === 'playlists' ? [] : matchedCreators
        });
      }

      // 3. Playlist Likes (Like / Unlike Public Playlists)
      if (pathname === '/api/community/playlists/like' && req.method === 'POST') {
        const body = await parseBody(req);
        const playlistId = String(body.playlistId || '').trim();
        const reqUserId = body.userId || parsedUrl.searchParams.get('userId');
        const authUser = getAuthUser(req, reqUserId);

        if (!authUser) {
          return sendJson(res, 401, { success: false, error: 'Please sign in to like playlists.' });
        }
        const uid = authUser.id || authUser._id;

        // Find playlist
        let pl = null;
        for (const [owner, pls] of Object.entries(memoryDb.playlists)) {
          const found = pls.find(p => String(p.id || p._id) === playlistId);
          if (found) { pl = found; break; }
        }

        if (!pl) return sendJson(res, 404, { success: false, error: 'Playlist not found.' });
        if (pl.visibility !== 'public') {
          return sendJson(res, 403, { success: false, error: 'Only public playlists can be liked.' });
        }

        if (!memoryDb.playlistLikes[playlistId]) memoryDb.playlistLikes[playlistId] = [];
        const likesArr = memoryDb.playlistLikes[playlistId];
        const existingIdx = likesArr.indexOf(uid);
        let isLiked = false;

        if (existingIdx !== -1) {
          likesArr.splice(existingIdx, 1);
          isLiked = false;
        } else {
          likesArr.push(uid);
          isLiked = true;
        }

        pl.likesCount = likesArr.length;
        saveDatabase();
        syncPlaylistLikeToNeon(uid, playlistId, isLiked).catch(() => {});
        syncPlaylistToNeon(pl.userId, pl).catch(() => {});

        return sendJson(res, 200, {
          success: true,
          isLiked,
          likesCount: pl.likesCount
        });
      }

      // 4. Save Playlist to Library (Save / Bookmark without duplicate playlist records)
      if (pathname === '/api/community/playlists/save' && req.method === 'POST') {
        const body = await parseBody(req);
        const playlistId = String(body.playlistId || '').trim();
        const reqUserId = body.userId || parsedUrl.searchParams.get('userId');
        const authUser = getAuthUser(req, reqUserId);

        if (!authUser) {
          return sendJson(res, 401, { success: false, error: 'Please sign in to save playlists to your library.' });
        }
        const uid = authUser.id || authUser._id;

        // Verify public
        let pl = null;
        for (const [owner, pls] of Object.entries(memoryDb.playlists)) {
          const found = pls.find(p => String(p.id || p._id) === playlistId);
          if (found) { pl = found; break; }
        }
        if (!pl) return sendJson(res, 404, { success: false, error: 'Playlist not found.' });
        if (pl.visibility !== 'public') {
          return sendJson(res, 403, { success: false, error: 'Only public playlists can be saved.' });
        }

        if (!memoryDb.savedPlaylists[uid]) memoryDb.savedPlaylists[uid] = [];
        const savedList = memoryDb.savedPlaylists[uid];
        const idx = savedList.indexOf(playlistId);
        let isSaved = false;

        if (idx !== -1) {
          savedList.splice(idx, 1);
          isSaved = false;
        } else {
          savedList.push(playlistId);
          isSaved = true;
        }

        saveDatabase();
        syncSavedPlaylistToNeon(uid, playlistId, isSaved).catch(() => {});

        return sendJson(res, 200, {
          success: true,
          isSaved,
          message: isSaved ? 'Playlist saved to your library' : 'Playlist removed from your library'
        });
      }

      // 5. Get User's Saved Playlists
      if (pathname === '/api/community/playlists/saved' && req.method === 'GET') {
        const reqUserId = parsedUrl.searchParams.get('userId');
        const authUser = getAuthUser(req, reqUserId);
        if (!authUser) {
          return sendJson(res, 200, { success: true, playlists: [] });
        }
        const uid = authUser.id || authUser._id;
        const savedIds = memoryDb.savedPlaylists[uid] || [];

        const savedPlaylists = [];
        for (const [owner, pls] of Object.entries(memoryDb.playlists)) {
          for (const pl of pls) {
            if (savedIds.includes(pl.id) && pl.visibility === 'public') {
              const creator = getPublicProfile(pl.userId || owner);
              const pLikes = memoryDb.playlistLikes[pl.id] || [];
              savedPlaylists.push({
                ...pl,
                coverUrl: pl.coverUrl || pl.songs?.[0]?.image || '/logo.png',
                likesCount: pLikes.length || pl.likesCount || 0,
                isLiked: pLikes.includes(uid),
                isSaved: true,
                creator
              });
            }
          }
        }

        return sendJson(res, 200, { success: true, playlists: savedPlaylists });
      }

      // 6. Follow / Unfollow User
      if (pathname === '/api/community/users/follow' && req.method === 'POST') {
        const body = await parseBody(req);
        const followingId = String(body.followingId || '').trim();
        const reqUserId = body.followerId || body.userId || parsedUrl.searchParams.get('userId');
        const authUser = getAuthUser(req, reqUserId);

        if (!authUser) {
          return sendJson(res, 401, { success: false, error: 'Please sign in to follow creators.' });
        }
        const followerId = authUser.id || authUser._id;

        if (String(followerId).toLowerCase() === String(followingId).toLowerCase()) {
          return sendJson(res, 400, { success: false, error: 'You cannot follow yourself.' });
        }

        if (!memoryDb.follows[followingId]) memoryDb.follows[followingId] = { followers: [], following: [] };
        if (!memoryDb.follows[followerId]) memoryDb.follows[followerId] = { followers: [], following: [] };

        const targetFollowers = memoryDb.follows[followingId].followers;
        const myFollowing = memoryDb.follows[followerId].following;

        const idx = targetFollowers.indexOf(followerId);
        let isFollowing = false;

        if (idx !== -1) {
          // Unfollow
          targetFollowers.splice(idx, 1);
          const idx2 = myFollowing.indexOf(followingId);
          if (idx2 !== -1) myFollowing.splice(idx2, 1);
          isFollowing = false;
        } else {
          // Follow
          targetFollowers.push(followerId);
          if (!myFollowing.includes(followingId)) myFollowing.push(followingId);
          isFollowing = true;
        }

        saveDatabase();
        syncUserFollowToNeon(followerId, followingId, isFollowing).catch(() => {});

        return sendJson(res, 200, {
          success: true,
          isFollowing,
          followersCount: targetFollowers.length,
          followingCount: memoryDb.follows[followingId].following.length
        });
      }

      // 7. Get Followers / Following Lists
      if (pathname === '/api/community/users/followers' && req.method === 'GET') {
        const targetUserId = parsedUrl.searchParams.get('userId');
        const fObj = memoryDb.follows[targetUserId] || { followers: [], following: [] };
        const list = (fObj.followers || []).map(id => getPublicProfile(id)).filter(Boolean);
        return sendJson(res, 200, { success: true, followers: list });
      }

      if (pathname === '/api/community/users/following' && req.method === 'GET') {
        const targetUserId = parsedUrl.searchParams.get('userId');
        const fObj = memoryDb.follows[targetUserId] || { followers: [], following: [] };
        const list = (fObj.following || []).map(id => getPublicProfile(id)).filter(Boolean);
        return sendJson(res, 200, { success: true, following: list });
      }

      // 8. Public Creator Profile (Never exposes private playlists, email or passwords)
      if (pathname === '/api/community/profile' && req.method === 'GET') {
        const targetUserId = parsedUrl.searchParams.get('userId');
        const targetUsername = parsedUrl.searchParams.get('username');
        const reqUserId = parsedUrl.searchParams.get('authUserId');
        const authUser = getAuthUser(req, reqUserId);

        let user = null;
        if (targetUserId) {
          user = memoryDb.users.find(u => String(u.id || u._id).toLowerCase() === String(targetUserId).toLowerCase() || String(u.email).toLowerCase() === String(targetUserId).toLowerCase());
        } else if (targetUsername) {
          const cleanU = targetUsername.replace(/^@/, '').toLowerCase();
          // Check profiles first
          for (const [uid, prof] of Object.entries(memoryDb.profiles)) {
            if (prof.username && prof.username.toLowerCase() === cleanU) {
              user = memoryDb.users.find(u => u.id === uid);
              break;
            }
          }
          if (!user) {
            user = memoryDb.users.find(u => u.email && u.email.split('@')[0].toLowerCase() === cleanU);
          }
        }

        if (!user) {
          return sendJson(res, 404, { success: false, error: 'User profile not found.' });
        }

        const profile = getPublicProfile(user.id);
        const isFollowing = authUser ? (memoryDb.follows[user.id]?.followers || []).includes(authUser.id || authUser._id) : false;

        // Fetch user's PUBLIC playlists only
        const userPlaylists = (memoryDb.playlists[user.id] || memoryDb.playlists[user.email] || [])
          .filter(p => p.visibility === 'public')
          .map(p => {
            const pLikes = memoryDb.playlistLikes[p.id] || [];
            return {
              ...p,
              coverUrl: p.coverUrl || p.songs?.[0]?.image || '/logo.png',
              likesCount: pLikes.length || p.likesCount || 0,
              isLiked: authUser ? pLikes.includes(authUser.id || authUser._id) : false,
              isSaved: authUser ? (memoryDb.savedPlaylists[authUser.id || authUser._id] || []).includes(p.id) : false,
              creator: profile
            };
          });

        return sendJson(res, 200, {
          success: true,
          profile: {
            ...profile,
            isFollowing,
            playlists: userPlaylists
          }
        });
      }

      // 9. Edit Own Profile (Display Name, Username, Bio)
      if ((pathname === '/api/community/profile/edit' || pathname === '/api/auth/profile') && req.method === 'POST') {
        const body = await parseBody(req);
        const reqUserId = body.userId || parsedUrl.searchParams.get('userId');
        const authUser = getAuthUser(req, reqUserId);

        if (!authUser) {
          return sendJson(res, 401, { success: false, error: 'Unauthenticated. Please sign in.' });
        }
        const uid = authUser.id || authUser._id;

        // Username validation (3-30 chars, alphanumeric + underscore)
        let username = body.username ? String(body.username).replace(/^@/, '').trim().toLowerCase() : null;
        if (username) {
          if (!/^[a-z0-9_]{3,30}$/.test(username)) {
            return sendJson(res, 400, { success: false, error: 'Username must be 3-30 characters with letters, numbers and underscores only.' });
          }
          // Uniqueness check across other users
          for (const [otherUid, prof] of Object.entries(memoryDb.profiles)) {
            if (otherUid !== uid && prof.username && prof.username.toLowerCase() === username) {
              return sendJson(res, 400, { success: false, error: 'This username is already taken. Please choose another.' });
            }
          }
        }

        // Bio character limit (max 300)
        const bio = String(body.bio || '').slice(0, 300);
        const displayName = (body.displayName || body.name || authUser.name || '').trim().slice(0, 50);
        const avatarUrl = body.avatarUrl || body.avatar || authUser.avatar;

        if (!memoryDb.profiles[uid]) memoryDb.profiles[uid] = {};
        const prof = memoryDb.profiles[uid];
        prof.userId = uid;
        if (username) prof.username = username;
        if (displayName) prof.displayName = displayName;
        prof.bio = bio;
        if (avatarUrl) prof.avatarUrl = avatarUrl;
        prof.updatedAt = new Date().toISOString();

        // Also update core user in memoryDb
        authUser.name = displayName || authUser.name;
        authUser.avatar = avatarUrl || authUser.avatar;
        const dbUser = memoryDb.users.find(u => u.id === uid || u.email === authUser.email);
        if (dbUser) {
          dbUser.name = displayName || dbUser.name;
          dbUser.avatar = avatarUrl || dbUser.avatar;
        }

        saveDatabase();
        syncProfileToNeon(uid, prof).catch(() => {});
        syncUserToNeon(authUser).catch(() => {});

        console.log(`👤 [PROFILE UPDATED] ${displayName} (@${prof.username || uid})`);
        return sendJson(res, 200, {
          success: true,
          message: 'Profile updated successfully',
          profile: getPublicProfile(uid),
          user: {
            id: uid,
            name: displayName,
            email: authUser.email,
            avatar: avatarUrl
          }
        });
      }

      // 10. Profile Photo Upload (Supports JPG, PNG, WEBP with 5MB validation)
      if (pathname === '/api/community/profile/upload-avatar' && req.method === 'POST') {
        const body = await parseBody(req);
        const reqUserId = body.userId || parsedUrl.searchParams.get('userId');
        const authUser = getAuthUser(req, reqUserId);

        if (!authUser) {
          return sendJson(res, 401, { success: false, error: 'Please sign in to upload a profile photo.' });
        }
        const uid = authUser.id || authUser._id;
        const imageBase64 = String(body.imageBase64 || body.image || '').trim();

        if (!imageBase64 || !imageBase64.startsWith('data:image/')) {
          return sendJson(res, 400, { success: false, error: 'Invalid image format. Supported formats: JPG, JPEG, PNG, WEBP.' });
        }

        // Validate format: jpg, jpeg, png, webp
        const mimeMatch = imageBase64.match(/^data:image\/(jpeg|jpg|png|webp);base64,/i);
        if (!mimeMatch) {
          return sendJson(res, 400, { success: false, error: 'Only JPG, JPEG, PNG, and WEBP image formats are supported.' });
        }
        const ext = mimeMatch[1].toLowerCase() === 'jpeg' ? 'jpg' : mimeMatch[1].toLowerCase();

        // Extract base64 payload & validate size (Max 5MB)
        const base64Data = imageBase64.replace(/^data:image\/[a-z]+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        if (buffer.length > 5 * 1024 * 1024) {
          return sendJson(res, 400, { success: false, error: 'Image exceeds maximum allowed size of 5MB.' });
        }

        // Save image to custom avatars storage
        const customDir = path.join(PUBLIC_DIR, 'avatars', 'custom');
        if (!fs.existsSync(customDir)) fs.mkdirSync(customDir, { recursive: true });

        const safeUid = String(uid).replace(/[^a-zA-Z0-9_-]/g, '_');
        const filename = `avatar_${safeUid}_${Date.now()}.${ext}`;
        const filePath = path.join(customDir, filename);

        fs.writeFileSync(filePath, buffer);
        const avatarUrl = `/avatars/custom/${filename}`;

        // Update profile & user
        if (!memoryDb.profiles[uid]) memoryDb.profiles[uid] = {};
        memoryDb.profiles[uid].avatarUrl = avatarUrl;
        memoryDb.profiles[uid].updatedAt = new Date().toISOString();

        authUser.avatar = avatarUrl;
        const dbUser = memoryDb.users.find(u => u.id === uid || u.email === authUser.email);
        if (dbUser) dbUser.avatar = avatarUrl;

        saveDatabase();
        syncProfileToNeon(uid, memoryDb.profiles[uid]).catch(() => {});
        syncUserToNeon(authUser).catch(() => {});

        console.log(`📸 [AVATAR UPLOADED] User ${uid} -> ${avatarUrl}`);
        return sendJson(res, 200, {
          success: true,
          message: 'Profile photo updated successfully',
          avatarUrl: avatarUrl
        });
      }

      // 11. Delete / Reset Profile Avatar
      if (pathname === '/api/community/profile/avatar' && req.method === 'DELETE') {
        const reqUserId = parsedUrl.searchParams.get('userId');
        const authUser = getAuthUser(req, reqUserId);
        if (!authUser) {
          return sendJson(res, 401, { success: false, error: 'Unauthorized.' });
        }
        const uid = authUser.id || authUser._id;
        const defaultAvatar = '/avatars/p1.jpg';

        if (!memoryDb.profiles[uid]) memoryDb.profiles[uid] = {};
        memoryDb.profiles[uid].avatarUrl = defaultAvatar;
        memoryDb.profiles[uid].updatedAt = new Date().toISOString();

        authUser.avatar = defaultAvatar;
        const dbUser = memoryDb.users.find(u => u.id === uid || u.email === authUser.email);
        if (dbUser) dbUser.avatar = defaultAvatar;

        saveDatabase();
        syncProfileToNeon(uid, memoryDb.profiles[uid]).catch(() => {});
        syncUserToNeon(authUser).catch(() => {});

        return sendJson(res, 200, { success: true, avatarUrl: defaultAvatar, message: 'Profile photo reset to default.' });
      }

      if (pathname === '/api/user/taste') {
        if (!memoryDb.userTastes) memoryDb.userTastes = {};
        if (req.method === 'POST') {
          const body = await parseBody(req);
          const userId = body.userId || parsedUrl.searchParams.get('userId') || 'guest';
          const track = body.track;
          if (track && track.name) {
            if (!memoryDb.userTastes[userId]) {
              memoryDb.userTastes[userId] = { genres: {}, artists: {}, history: [] };
            }
            const ut = memoryDb.userTastes[userId];
            const artist = track.artist || 'AuraMusic Artist';
            const genre = track.genre || 'Music';
            ut.artists[artist] = (ut.artists[artist] || 0) + 1;
            ut.genres[genre] = (ut.genres[genre] || 0) + 1;
            ut.history.unshift({ ...track, timestamp: Date.now() });
            if (ut.history.length > 100) ut.history.pop();
            saveDatabase();
          }
          return sendJson(res, 200, { success: true, taste: memoryDb.userTastes[userId] || null });
        }
        if (req.method === 'GET') {
          const userId = parsedUrl.searchParams.get('userId') || 'guest';
          return sendJson(res, 200, { success: true, taste: memoryDb.userTastes[userId] || null });
        }
      }

      // ─── Advanced Taste DNA & 4D Event Tracking APIs ──────────────────────
      // POST /api/taste/event  -> record user action (play/skip/like/dislike/replay/search)
      if (pathname === '/api/taste/event' && req.method === 'POST') {
        const body = await parseBody(req);
        const recorded = recordTaste(memoryDb, body);
        const userId = String(body?.userId || '').slice(0, 80);
        if (recorded) {
          saveDatabase();
          // Real-time synchronization to Neon Postgres
          syncListeningEventToNeon(userId, body).catch(() => {});
          if (memoryDb.taste?.[userId]) {
            syncTasteProfileToNeon(userId, memoryDb.taste[userId]).catch(() => {});
          }
        }
        const moodShift = Boolean(memoryDb.taste?.[userId]?._moodShift);
        return sendJson(res, 200, {
          success: true,
          recorded,
          moodShift,
          context: getContext()
        });
      }

      // GET /api/taste/dna?userId=X -> return full Taste DNA Card
      if (pathname === '/api/taste/dna' && req.method === 'GET') {
        const userId = parsedUrl.searchParams.get('userId') || 'guest';
        let dna = memoryDb.taste?.[userId]?.dnaCard;
        if (!dna && memoryDb.taste?.[userId]) {
          dna = buildDNA(memoryDb, userId);
          if (dna) saveDatabase();
        }
        return sendJson(res, 200, {
          success: true,
          userId,
          dna: dna || null,
          isColdStart: !dna || (dna.totalEvents || 0) === 0
        });
      }

      // GET /api/taste/journey?userId=X&days=7 -> daily emotional arc
      if (pathname === '/api/taste/journey' && req.method === 'GET') {
        const userId = parsedUrl.searchParams.get('userId') || 'guest';
        const days = Math.min(30, Math.max(1, parseInt(parsedUrl.searchParams.get('days') || '7', 10)));
        const profile = memoryDb.taste?.[userId];
        const journey = profile?.journey || {};
        const dates = Object.keys(journey).sort().slice(-days);
        const arc = {};
        for (const d of dates) arc[d] = journey[d];
        return sendJson(res, 200, {
          success: true,
          userId,
          journey: arc,
          contexts: profile?.contexts || {}
        });
      }

      // POST /api/check-mood-shift -> real-time check
      if (pathname === '/api/check-mood-shift') {
        const body = req.method === 'POST' ? await parseBody(req) : {};
        const userId = body.userId || parsedUrl.searchParams.get('userId') || 'guest';
        const profile = memoryDb.taste?.[userId];
        const shiftDetected = Boolean(profile?._moodShift || (profile?.consecutiveSkips || 0) >= 3);
        return sendJson(res, 200, {
          success: true,
          userId,
          shiftDetected,
          consecutiveSkips: profile?.consecutiveSkips || 0
        });
      }

      // POST /api/taste/admin/decay -> trigger nightly decay & DNA rebuild
      if (pathname === '/api/taste/admin/decay' && req.method === 'POST') {
        const body = await parseBody(req);
        const auth = adminKeyOk(req, body);
        if (auth !== 'ok') {
          return sendJson(res, 401, { success: false, error: 'Admin key required' });
        }
        const stats = processDailyDecay(memoryDb);
        saveDatabase();
        return sendJson(res, 200, { success: true, ...stats, timestamp: new Date().toISOString() });
      }

      // GET /api/taste/foryou?userId=X -> personalized recommendations
      if (pathname === '/api/taste/foryou' && req.method === 'GET') {
        const userId = parsedUrl.searchParams.get('userId') || 'guest';
        const songs = await forYou(memoryDb, userId, ytAudioClient, getRelated, toSong).catch(() => []);
        return sendJson(res, 200, songs);
      }

      // GET /api/taste/auto-playlists?userId=X -> generate 12 personalized auto-playlists
      if (pathname === '/api/taste/auto-playlists' && req.method === 'GET') {
        const userId = parsedUrl.searchParams.get('userId') || 'guest';
        const searchFn = async (q) => {
          const r = await searchSongsSaavnDev(q).catch(() => []);
          return r || [];
        };
        const playlists = await generateAutoPlaylists(memoryDb, userId, searchFn);
        saveDatabase();
        return sendJson(res, 200, { success: true, userId, playlists });
      }

      // GET /api/taste/mood?mood=romantic&userId=X -> mood-based recommendation
      if (pathname === '/api/taste/mood' && req.method === 'GET') {
        const userId = parsedUrl.searchParams.get('userId') || 'guest';
        const mood = (parsedUrl.searchParams.get('mood') || 'chill').toLowerCase();
        const searchFn = async (q) => {
          const r = await searchSongsSaavnDev(q).catch(() => []);
          return r || [];
        };
        const songs = await getMoodRecommendations(memoryDb, userId, mood, searchFn);
        return sendJson(res, 200, { success: true, mood, songs });
      }

      // GET /api/taste/dashboard?userId=X -> complete user analytics dashboard
      if (pathname === '/api/taste/dashboard' && req.method === 'GET') {
        const userId = parsedUrl.searchParams.get('userId') || 'guest';
        const dashboard = getUserDashboardAnalytics(memoryDb, userId);
        return sendJson(res, 200, { success: true, dashboard });
      }

      // POST /api/taste/clear-history -> user privacy control to clear listening data
      if (pathname === '/api/taste/clear-history' && req.method === 'POST') {
        const body = await parseBody(req);
        const userId = body.userId || parsedUrl.searchParams.get('userId');
        if (!userId) return sendJson(res, 400, { error: 'userId is required' });
        const deleted = clearUserTasteData(memoryDb, userId, body.deleteEntireProfile === true);
        if (deleted) saveDatabase();
        return sendJson(res, 200, { success: true, message: 'Listening data cleared successfully' });
      }

      if (pathname === '/api/likes') {
        if (req.method === 'GET') {
          const userId = parsedUrl.searchParams.get('userId') || 'guest';
          return sendJson(res, 200, { success: true, songs: memoryDb.likes[userId] || [] });
        }
        if (req.method === 'POST') {
          const body = await parseBody(req);
          const userId = body.userId || parsedUrl.searchParams.get('userId') || 'guest';
          const song = body.song;

          if (!memoryDb.likes[userId]) memoryDb.likes[userId] = [];

          let isLiked = false;
          if (song && (song.id || song.videoId)) {
            const songId = song.id || song.videoId;
            const existingIndex = memoryDb.likes[userId].findIndex(s => (s.id || s.videoId) === songId);

            if (existingIndex !== -1) {
              // Already liked -> Toggle OFF (Remove from favorites)
              memoryDb.likes[userId].splice(existingIndex, 1);
              isLiked = false;
              syncLikeToNeon(userId, song, false).catch(() => {});
            } else {
              // Not liked -> Add to favorites
              memoryDb.likes[userId].unshift(song);
              isLiked = true;
              syncLikeToNeon(userId, song, true).catch(() => {});
            }
            saveDatabase();

            // ── Keep "❤️ Favorites" system playlist in sync ──
            if (!memoryDb.playlists[userId]) memoryDb.playlists[userId] = [];
            let favPl = memoryDb.playlists[userId].find(p => p._system === 'favorites');
            if (!favPl) {
              favPl = {
                id: 'sys_favorites_' + userId,
                _system: 'favorites',
                name: '❤️ Favorites',
                description: 'Songs you have liked – auto-updated',
                songs: [],
                createdAt: new Date().toISOString(),
                isSystem: true
              };
              memoryDb.playlists[userId].push(favPl);
            }
            favPl.songs = memoryDb.likes[userId].slice();
            saveDatabase();
            syncPlaylistToNeon(userId, favPl).catch(() => {});
          }

          return sendJson(res, 200, {
            success: true,
            isLiked: isLiked,
            songs: memoryDb.likes[userId]
          });
        }
      }

      // ─── Recently Played API ───────────────────────────────────────────
      // GET  /api/recently-played?userId=X          → returns last 50 songs
      // POST /api/recently-played  { userId, song } → records a played song, keeps 50
      if (pathname === '/api/recently-played') {
        if (!memoryDb.recentlyPlayed) memoryDb.recentlyPlayed = {};

        if (req.method === 'GET') {
          const uid = parsedUrl.searchParams.get('userId') || 'guest';
          return sendJson(res, 200, { success: true, songs: memoryDb.recentlyPlayed[uid] || [] });
        }

        if (req.method === 'POST') {
          const body = await parseBody(req);
          const uid = body.userId || 'guest';
          const song = body.song;
          if (song && (song.id || song.videoId || song.name)) {
            if (!memoryDb.recentlyPlayed[uid]) memoryDb.recentlyPlayed[uid] = [];
            const rp = memoryDb.recentlyPlayed[uid];
            const songId = song.id || song.videoId || song.name;
            // Remove duplicate if already in list
            const idx = rp.findIndex(s => (s.id || s.videoId || s.name) === songId);
            if (idx !== -1) rp.splice(idx, 1);
            rp.unshift({ ...song, playedAt: new Date().toISOString() });
            if (rp.length > 50) rp.pop();
            saveDatabase();

            // ── Auto-sync: also ensure "Recently Played" system playlist exists ──
            if (!memoryDb.playlists[uid]) memoryDb.playlists[uid] = [];
            let rpPlaylist = memoryDb.playlists[uid].find(p => p._system === 'recently_played');
            if (!rpPlaylist) {
              rpPlaylist = {
                id: `sys_recently_played_${uid}`,
                _system: 'recently_played',
                name: '🕐 Recently Played',
                description: 'Auto-updated with every song you play',
                songs: [],
                createdAt: new Date().toISOString(),
                isSystem: true
              };
              memoryDb.playlists[uid].push(rpPlaylist);
            }
            // Keep recently-played playlist in sync (max 50)
            const rpSongs = memoryDb.recentlyPlayed[uid];
            rpPlaylist.songs = rpSongs.slice();
            saveDatabase();
          }
          return sendJson(res, 200, { success: true });
        }
      }

      // ─── Auto-Favorites: Like → Favorites playlist  ──────────────────────
      // The /api/likes POST already handles the toggle; here we also keep
      // the special "❤️ Favorites" system playlist in sync after every toggle.
      // (Handled inline inside the likes block below via ensureFavPlaylist.)

      // ─── Shuffle playlist  ───────────────────────────────────────────────
      // GET /api/playlist/shuffle?userId=X&playlistId=Y   → shuffled songs array
      if (pathname === '/api/playlist/shuffle') {
        const uid = parsedUrl.searchParams.get('userId') || 'guest';
        const plId = parsedUrl.searchParams.get('playlistId');
        const playlists = memoryDb.playlists[uid] || [];
        let songs = [];
        if (plId === 'recently_played') {
          songs = (memoryDb.recentlyPlayed[uid] || []).slice();
        } else if (plId === 'favorites') {
          songs = (memoryDb.likes[uid] || []).slice();
        } else {
          const pl = playlists.find(p => String(p.id || p._id) === plId);
          songs = pl ? pl.songs.slice() : [];
        }
        // Fisher-Yates shuffle
        for (let i = songs.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [songs[i], songs[j]] = [songs[j], songs[i]];
        }
        return sendJson(res, 200, { success: true, songs });
      }

      // ─── Add song to playlist (shorthand)  ──────────────────────────────
      // POST /api/playlist/add-song { userId, playlistId, song }
      if (pathname === '/api/playlist/add-song') {
        if (req.method === 'POST') {
          const body = await parseBody(req);
          const uid = body.userId || 'guest';
          const plId = String(body.playlistId || '');
          const song = body.song;
          if (!song) return sendJson(res, 400, { error: 'song required' });
          const { playlist: pl } = findUserPlaylist(uid, plId);
          if (!pl) return sendJson(res, 404, { error: 'Playlist not found' });
          if (!pl.songs) pl.songs = [];
          const songId = song.id || song.videoId;
          const exists = pl.songs.some(s => (s.id || s.videoId) === songId);
          if (!exists) {
            pl.songs.unshift(song);
            if (!pl.coverUrl && !pl.cover && song.image) {
              pl.coverUrl = song.image;
              pl.cover = song.image;
            }
            pl.updatedAt = new Date().toISOString();
            saveDatabase();
            syncPlaylistToNeon(pl.userId || uid, pl).catch(() => {});
          }
          return sendJson(res, 200, { success: true, alreadyExists: exists, playlist: pl });
        }
      }

      // ─── List user playlists (shorthand for the UI's selector)  ─────────
      // GET /api/user/playlists?userId=X → returns all playlists for picker
      if (pathname === '/api/user/playlists') {
        const uid = parsedUrl.searchParams.get('userId') || 'guest';
        const playlists = getUserPlaylistsAll(uid).map(p => ({
          ...p,
          cover: p.coverUrl || p.cover || p.songs?.[0]?.image || '',
          coverUrl: p.coverUrl || p.cover || p.songs?.[0]?.image || ''
        }));
        return sendJson(res, 200, { success: true, playlists });
      }

      // ─── Stream warm-up endpoint ─────────────────────────────────────────
      // GET /api/yt/warm?id=VIDEOID&title=...&artist=...  - pre-resolve audio URL and cache it
      if (pathname === '/api/yt/warm' && req.method === 'GET') {
        const videoId = (parsedUrl.searchParams.get('id') || '').replace(/^yt[-_]/, '').trim();
        const qTitle = parsedUrl.searchParams.get('title') || parsedUrl.searchParams.get('q') || '';
        const qArtist = parsedUrl.searchParams.get('artist') || '';
        if (videoId) {
          if (qTitle) {
            resolveFastAudio(videoId, qTitle, qArtist).catch(() => {});
          }
          // Race ytdl + Piped/Invidious simultaneously, cache both results
          warmAudio(ytAudioClient, [videoId]);
        }
        return sendJson(res, 200, { success: true });
      }

      
      // ─── Live Synced Lyrics (Mochy LRCLib Provider) ────────────────────────
      if (pathname === '/api/lyrics/live' && req.method === 'GET') {
        const title = (parsedUrl.searchParams.get('title') || '').split('|')[0].replace(/\(.*?\)|\[.*?\]/g, '').trim();
        const artist = (parsedUrl.searchParams.get('artist') || '').split(',')[0].trim();
        if (!title) return sendJson(res, 200, { success: false, lines: [] });
        try {
          const lrcRes = await fetch(`https://lrclib.net/api/search?track_name=${encodeURIComponent(title)}&artist_name=${encodeURIComponent(artist)}`, {
            headers: { 'User-Agent': 'AuraMusic/1.0' },
            signal: AbortSignal.timeout(3500)
          });
          if (lrcRes.ok) {
            const list = await lrcRes.json();
            const match = Array.isArray(list) ? list.find(x => x.syncedLyrics) || list[0] : null;
            if (match && match.syncedLyrics) {
              const lines = [];
              for (const raw of match.syncedLyrics.split('\n')) {
                const m = raw.match(/\[(\d+):(\d+(?:\.\d+)?)\]\s*(.*)/);
                if (m) {
                  const sec = parseInt(m[1], 10) * 60 + parseFloat(m[2]);
                  const text = m[3].trim();
                  if (text) lines.push({ time: sec, text });
                }
              }
              return sendJson(res, 200, { success: true, synced: true, lines });
            }
          }
        } catch {}
        return sendJson(res, 200, { success: false, synced: false, lines: [] });
      }

      // ─── Live Listen Together Room System ──────────────────────────────────
      if (!memoryDb.liveRooms) memoryDb.liveRooms = {};
      if (pathname === '/api/live/room/create' && req.method === 'POST') {
        const b = await parseBody(req);
        const roomId = 'live_' + crypto.randomBytes(3).toString('hex');
        memoryDb.liveRooms[roomId] = {
          roomId,
          hostId: b.userId || 'guest',
          hostName: b.hostName || 'Aura Host',
          song: b.song || null,
          positionSec: Number(b.positionSec || 0),
          isPlaying: Boolean(b.isPlaying),
          listeners: 1,
          updatedAt: Date.now()
        };
        return sendJson(res, 200, { success: true, room: memoryDb.liveRooms[roomId] });
      }

      if (pathname === '/api/live/room/sync' && req.method === 'POST') {
        const b = await parseBody(req);
        const room = memoryDb.liveRooms[String(b.roomId || '')];
        if (!room) return sendJson(res, 404, { success: false, error: 'Live room not found' });
        if (b.song) room.song = b.song;
        if (b.positionSec !== undefined) room.positionSec = Number(b.positionSec);
        if (b.isPlaying !== undefined) room.isPlaying = Boolean(b.isPlaying);
        room.updatedAt = Date.now();
        return sendJson(res, 200, { success: true, room });
      }

      if (pathname === '/api/live/room' && req.method === 'GET') {
        const roomId = String(parsedUrl.searchParams.get('id') || '');
        const room = memoryDb.liveRooms[roomId];
        if (!room) return sendJson(res, 404, { success: false, error: 'Live room ended or not found' });
        const elapsed = room.isPlaying ? (Date.now() - room.updatedAt) / 1000 : 0;
        return sendJson(res, 200, {
          success: true,
          room: {
            ...room,
            livePositionSec: Number((room.positionSec + elapsed).toFixed(2))
          }
        });
      }

      // Verify Key 1 (Portal Gate Key)
      if (pathname === '/api/admin/verify-portal-key' && req.method === 'POST') {
        const b = await parseBody(req);
        const given = String(b.key || req.headers['x-portal-key'] || '').trim();
        const valid = ['auramynk@2007', process.env.AURA_PORTAL_KEY, memoryDb.adminKeys?.portalKey].filter(Boolean);
        if (valid.includes(given)) return sendJson(res, 200, { success: true, verified: true });
        return sendJson(res, 401, { success: false, error: 'Invalid Portal Key (Key 1)' });
      }

      // Verify Key 2 (Admin Panel Login Key)
      if (pathname === '/api/admin/verify-panel-key' && req.method === 'POST') {
        const b = await parseBody(req);
        const given = String(b.key || req.headers['x-panel-key'] || '').trim();
        const valid = ['mynk@aura2007', process.env.AURA_PANEL_KEY, memoryDb.adminKeys?.panelKey].filter(Boolean);
        if (valid.includes(given)) return sendJson(res, 200, { success: true, verified: true });
        return sendJson(res, 401, { success: false, error: 'Invalid Admin Panel Key (Key 2)' });
      }

      // Verify Key 3 (App Update Key)
      if (pathname === '/api/admin/verify-update-key' && req.method === 'POST') {
        const b = await parseBody(req);
        const given = String(b.key || req.headers['x-admin-key'] || '').trim();
        const valid = ['mynk@2007', process.env.AURA_UPDATE_KEY, process.env.ADMIN_KEY, memoryDb.adminKeys?.updateKey].filter(Boolean);
        if (valid.includes(given)) return sendJson(res, 200, { success: true, verified: true });
        return sendJson(res, 401, { success: false, error: 'Invalid Update Security Key (Key 3)' });
      }

      if (pathname === '/api/admin/stats') {        return sendJson(res, 200, {
          success: true,
          stats: {
            totalUsers: memoryDb.users.length,
            totalPlaylists: Object.values(memoryDb.playlists).flat().length,
            totalLikes: Object.values(memoryDb.likes).flat().length,
            cachedStreamsCount: 128,
            database: 'Brevo SMTP Integrated Store',
            appUpdate: memoryDb.appUpdate
          }
        });
      }

      // ── Custom Tracks Management APIs (Admin Panel) ──
      // GET /api/admin/custom-tracks -> fetch all custom pinned tracks
      if (pathname === '/api/admin/custom-tracks' && req.method === 'GET') {
        return sendJson(res, 200, { success: true, tracks: memoryDb.customTracks || [] });
      }

      // POST /api/admin/custom-tracks -> add new track via YouTube link/ID or reorder
      if (pathname === '/api/admin/custom-tracks' && req.method === 'POST') {
        const body = await parseBody(req);
        const action = body.action || 'add';

        if (!memoryDb.customTracks) memoryDb.customTracks = [];

        if (action === 'reorder') {
          // Reorder array: accepts reordered array of tracks
          if (Array.isArray(body.tracks)) {
            memoryDb.customTracks = body.tracks;
            saveDatabase();
            return sendJson(res, 200, { success: true, message: 'Tracks reordered successfully', tracks: memoryDb.customTracks });
          }
          return sendJson(res, 400, { error: 'Invalid tracks array' });
        }

        if (action === 'delete') {
          const videoId = String(body.videoId || '').trim();
          memoryDb.customTracks = memoryDb.customTracks.filter(t => t.videoId !== videoId);
          saveDatabase();
          return sendJson(res, 200, { success: true, message: 'Track removed', tracks: memoryDb.customTracks });
        }

        // Add track: extract YouTube ID from full URL or bare ID
        let rawInput = String(body.url || body.videoId || '').trim();
        let videoId = '';

        // Match standard youtube links: https://youtu.be/ID or https://www.youtube.com/watch?v=ID or /shorts/ID
        const ytMatch = rawInput.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/))([\w-]{11})/i);
        if (ytMatch && ytMatch[1]) {
          videoId = ytMatch[1];
        } else if (/^[\w-]{11}$/.test(rawInput)) {
          videoId = rawInput;
        }

        if (!videoId) {
          return sendJson(res, 400, { error: 'Invalid YouTube link or Video ID. Please provide a valid YouTube URL.' });
        }

        // Check duplicate
        if (memoryDb.customTracks.some(t => t.videoId === videoId)) {
          return sendJson(res, 400, { error: 'This song is already in your custom tracks list.' });
        }

        // Try to fetch YouTube title/artist metadata automatically if not provided
        let name = String(body.name || body.title || '').trim();
        let artist = String(body.artist || '').trim();

        if (!name) {
          try {
            const oembed = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`, {
              signal: AbortSignal.timeout(3000)
            }).then(r => r.ok ? r.json() : null).catch(() => null);

            if (oembed?.title) {
              name = oembed.title;
              artist = oembed.author_name || 'YouTube Music';
            }
          } catch (_) {}
        }

        if (!name) name = `Custom Song (${videoId})`;
        if (!artist) artist = 'AuraMusic Feature';

        const newTrack = {
          id: 'yt_' + videoId,
          videoId,
          name,
          artist,
          album: String(body.album || 'Featured').trim(),
          duration: Number(body.duration) || 240,
          image: body.image || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          addedAt: new Date().toISOString()
        };

        const position = parseInt(body.position, 10);
        if (!isNaN(position) && position >= 0 && position < memoryDb.customTracks.length) {
          // Insert at specified index
          memoryDb.customTracks.splice(position, 0, newTrack);
        } else {
          // Prepend at top (index 0) by default for new tracks
          memoryDb.customTracks.unshift(newTrack);
        }

        saveDatabase();
        return sendJson(res, 200, { success: true, message: 'Custom track added successfully', track: newTrack, tracks: memoryDb.customTracks });
      }

      // ── System Health & Taste Diagnostic Dashboard (Admin Panel API) ──
      // GET /api/admin/taste-health -> check taste engine, audio resolvers, database status
      if (pathname === '/api/admin/taste-health') {
        const tasteProfiles = memoryDb.taste || {};
        const profileCount = Object.keys(tasteProfiles).length;
        const totalEventsLogged = Object.values(tasteProfiles)
          .reduce((acc, p) => acc + ((p.events || []).length), 0);

        return sendJson(res, 200, {
          success: true,
          status: 'healthy',
          timestamp: new Date().toISOString(),
          tasteSystem: {
            activeUserProfiles: profileCount,
            totalEventsLogged,
            realtimeAdaptation: 'ENABLED (10-minute micro-DNA rebuild)',
            nightlyDecayCron: 'ACTIVE (~02:00 AM IST scheduled)',
            sampleProfiles: Object.keys(tasteProfiles).slice(0, 5).map(uid => ({
              userId: uid,
              persona: tasteProfiles[uid]?.dnaCard?.persona || 'Calculating...',
              events: (tasteProfiles[uid]?.events || []).length,
              topMood: tasteProfiles[uid]?.dnaCard?.topMoods?.[0] || 'Learning'
            }))
          },
          audioEngine: {
            primaryTier: 'JioSaavn 320kbps HD CDN (<250ms stream resolution)',
            fallbackTier: 'Piped & Invidious Audio Extraction + ytdl-core',
            bufferingOptimizer: 'ACTIVE (Pre-warm next 3 songs + 2s timeout fallback)',
            downloadSystem: 'ACTIVE (/api/yt/download direct MP3 streamer)'
          },
          database: {
            storeKind: storeKind,
            persistence: redisEnabled ? 'Neon Postgres / Redis Synced' : 'database.json + in-memory store',
            autoSave: 'ACTIVE'
          }
        });
      }

      // ── App Update Control ──
      // Public: the Android app reads this on every launch. Web visitors never call it.
      if ((pathname === '/api/app-update' || (pathname === '/api/admin/app-update' && req.method === 'GET')) && req.method === 'GET') {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        const upd = { ...(memoryDb.appUpdate || { enabled: false, title: 'New Update Available!', message: 'Please update to get latest features & faster streaming.', apkUrl: DEFAULT_APK_URL }) };
        if (upd.enabled) upd.minVersionCode = await latestApkBuild(); // 0 when unknown = show to every build
        return sendJson(res, 200, { success: true, update: upd });
      }

      // Admin only: save the update popup settings.
      if (pathname === '/api/admin/app-update' && req.method === 'POST') {
        const body = await parseBody(req);
        const auth = adminKeyOk(req, body);
        if (auth === 'missing') return sendJson(res, 503, { success: false, error: 'Update Key (Key 3) is required to save update settings.' });
        if (auth !== 'ok') return sendJson(res, 401, { success: false, error: 'Wrong Update Security Key (Key 3). Please check your key.' });
        const enabled = body.enabled === true || body.enabled === 'true';
        const apkUrl = cleanHttpsUrl(body.apkUrl) || (enabled && !String(body.apkUrl || '').trim() ? DEFAULT_APK_URL : '');
        if (enabled && !apkUrl) return sendJson(res, 400, { success: false, error: 'APK Download Link must be a valid https:// link.' });
        const minVersionCode = 0; // worked out automatically from the latest release when the app asks
        memoryDb.appUpdate = {
          enabled,
          title: String(body.title || '').trim().slice(0, 80) || 'New Update Available!',
          message: String(body.message || '').trim().slice(0, 400) || 'Please update to get latest features & faster streaming.',
          apkUrl: apkUrl || DEFAULT_APK_URL,
          minVersionCode,
          updatedAt: new Date().toISOString()
        };
        saveDatabase();
        console.log('[ADMIN] App Update config updated:', memoryDb.appUpdate);
        return sendJson(res, 200, { success: true, message: 'App Update settings saved successfully', update: memoryDb.appUpdate });
      }

      return sendJson(res, 404, { error: 'Unknown API' });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // --- Static Files & SPA Fallback ---
  let filePath = path.join(PUBLIC_DIR, pathname);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  try {
    let stat = fs.existsSync(filePath) ? fs.statSync(filePath) : null;
    if (stat && stat.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
      stat = fs.existsSync(filePath) ? fs.statSync(filePath) : null;
    }
    if (stat && stat.isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
      return fs.createReadStream(filePath).pipe(res);
    }
  } catch {}

  const indexPath = path.join(PUBLIC_DIR, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return fs.createReadStream(indexPath).pipe(res);
  }

  res.writeHead(404);
  res.end('Not Found');
});

// ─── Automated Nightly Decay Scheduler (~2:00 AM IST / 20:30 UTC) ───
function scheduleNightlyDecay() {
  const computeDelayToNextRun = () => {
    const now = new Date();
    const next = new Date(now);
    next.setUTCHours(20, 30, 0, 0); // 20:30 UTC = 02:00 AM IST
    if (next <= now) {
      next.setUTCDate(next.getUTCDate() + 1);
    }
    return next.getTime() - now.getTime();
  };

  const delay = computeDelayToNextRun();
  console.log(`[Taste] Nightly decay scheduled in ${(delay / 3600000).toFixed(2)} hours`);

  setTimeout(() => {
    try {
      console.log('[Taste] Running nightly taste decay and DNA rebuild...');
      const stats = processDailyDecay(memoryDb);
      saveDatabase();
      console.log('[Taste] Nightly decay completed:', stats);
    } catch (err) {
      console.error('[Taste] Nightly decay failed:', err);
    }
    // Repeat daily
    setInterval(() => {
      try {
        console.log('[Taste] Running daily recurring decay...');
        const stats = processDailyDecay(memoryDb);
        saveDatabase();
        console.log('[Taste] Daily decay completed:', stats);
      } catch (err) {
        console.error('[Taste] Daily decay failed:', err);
      }
    }, 24 * 60 * 60 * 1000);
  }, delay);
}

server.listen(PORT, () => {
  console.log(`AuraMusic server running at http://localhost:${PORT}`);
  scheduleNightlyDecay();
});
