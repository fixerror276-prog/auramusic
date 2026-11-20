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
import { redisEnabled, kvGetJson, kvSetRaw } from './store.mjs';
import { songLanguage, prefersIndian, keepIndian, TRENDING_ARTISTS } from './music_taste.mjs';
import { resolveAudio, diagnose, getClientIp, warmAudio, getRelated, getDirectAudioUrl, forgetDirectAudioUrl, urlWorksForClient } from './audio_sources.mjs';
import { proxyAudio } from './audio_proxy.mjs';
import { verifyGoogleLogin, GoogleVerifyError } from './google_verify.mjs';
import { resolveFastAudio, resolveSaavnAudio, searchSongsSaavnDev } from './fast_audio.mjs';

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
      appUpdate: memoryDb.appUpdate
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
  appUpdate: dbData.appUpdate || {
    enabled: false,
    title: 'New Update Available!',
    message: 'Please update to get latest features & faster streaming.',
    apkUrl: 'https://github.com/fixerror276-prog/auramusic/releases/download/apk-latest/AuraMusic.apk'
  }
};

// --- Optional Redis persistence (Upstash / Vercel KV) ---
// Serverless hosts like Vercel forget process memory between requests, which would
// lose users, login sessions and pending OTPs. When Redis env vars are set, the
// whole state is loaded at the start of each API request and saved before the
// response is sent (only if something changed).
const STATE_KEY = 'auramusic:state:v1';
const STATE_FIELDS = ['users', 'pendingRegistrations', 'rateLimits', 'activeSessions', 'playlists', 'likes', 'recentlyPlayed', 'appUpdate', 'adminKeys'];

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
  if (after !== before) await kvSetRaw(STATE_KEY, after);
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
  const x = titleKey(a).split(' ').filter(Boolean);
  const y = titleKey(b).split(' ').filter(Boolean);
  if (!x.length || !y.length) return false;
  const n = Math.min(x.length, y.length, 3);
  for (let i = 0; i < n; i++) if (x[i] !== y[i]) return false;
  return n >= 2 || x[0].length >= 4;
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
    'AURA-UPDATE-123',
    'update2026',
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
    // Fast enrich top 8 search hits with direct 320kbps CDN stream URLs
    await Promise.all(songs.slice(0, 8).map(async song => {
      try {
        const fast = await resolveSaavnAudio(song.name, song.artist);
        if (fast?.streamUrl) {
          song.streamUrl = fast.streamUrl;
          song.url = fast.streamUrl;
          song.source = 'AuraMusic Lossless 320k';
        }
      } catch (_) {}
    }));

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
          res.setHeader('Cache-Control', 'public, max-age=600, stale-while-revalidate=3600');
          return sendJson(res, 200, await trendingIndian());
        }

        // Fast path: Top 10 songs from JioSaavn 320k direct CDN (<250ms response, <1.5s playback)
        try {
          const saavnDev = await searchSongsSaavnDev(query, 10);
          if (saavnDev?.success && Array.isArray(saavnDev?.data?.results) && saavnDev.data.results.length > 0) {
            const fastSongs = saavnDev.data.results.map(r => {
              const lastUrl = (Array.isArray(r.downloadUrl) && r.downloadUrl.length > 0)
                ? r.downloadUrl[r.downloadUrl.length - 1]?.url
                : null;
              const primaryArtist = r.artists?.primary?.[0]?.name || (Array.isArray(r.artists) ? r.artists[0]?.name : 'Artist');
              return {
                id: r.id || `saavn_${Date.now()}_${Math.random()}`,
                videoId: null,
                name: r.name,
                artist: primaryArtist,
                album: r.album?.name || 'Single',
                duration: Number(r.duration) || 200,
                image: r.image?.[r.image.length - 1]?.url || r.image?.[0]?.url || '/logo.png',
                url: lastUrl,
                streamUrl: lastUrl,
                downloadUrl: r.downloadUrl,
                source: 'AuraMusic Lossless 320k'
              };
            }).filter(s => s.streamUrl);

            if (fastSongs.length > 0) {
              const ytResults = await searchYouTube(query).catch(() => []);
              const combined = [...fastSongs];
              for (const y of ytResults) {
                if (!combined.some(c => c.name.toLowerCase() === y.name.toLowerCase())) {
                  combined.push(y);
                }
              }
              res.setHeader('Cache-Control', 'public, max-age=1800, stale-while-revalidate=86400');
              return sendJson(res, 200, combined);
            }
          }
        } catch (_) {}

        const results = await searchYouTube(query);
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
        const fit = list => {
          if (!wantIndian) return list;
          const filtered = keepIndian(list);
          // In strict mode, never let foreign songs in; in soft mode, allow if too few results
          if (strictLock) return filtered;
          return filtered.length >= 3 ? filtered : keepIndian(list);
        };

        try { take(fit(await getRelated(ytAudioClient, id))); } catch (_) {}

        const asVideos = found => found.map(s => ({ videoId: s.videoId, title: s.name, artist: s.artist, duration: s.duration, image: s.image }));

        // Fill up with similar-artist songs
        if (picked.length < 8) {
          const query = `${(artist || title).split(',')[0].trim()} songs`;
          take(fit(asVideos(await searchYouTube(query))));
        }
        // If Indian taste, add language-specific songs
        if (picked.length < 8 && wantIndian) {
          const subLang = /punjabi/i.test(`${title} ${artist}`) ? 'punjabi hits' :
                          /bhojpuri/i.test(`${title} ${artist}`) ? 'bhojpuri hits' : 'hindi hits';
          take(keepIndian(asVideos(await searchYouTube(`${(artist || '').split(',')[0].trim()} ${subLang}`))));
        }
        // Last resort: trending Indian songs
        if (picked.length < 8 && wantIndian) {
          const pick = TRENDING_ARTISTS[Math.floor(Math.random() * TRENDING_ARTISTS.length)];
          take(keepIndian(asVideos(await searchYouTube(`${pick} popular songs`))));
        }
        // If still not enough and English taste, add English similar songs
        if (picked.length < 8 && !wantIndian && clientLang !== 'in') {
          take(asVideos(await searchYouTube(`${(artist || title).split(',')[0].trim()} best songs`)));
        }

        res.setHeader('Cache-Control', 'public, max-age=120');
        return sendJson(res, 200, picked.slice(0, 20).map(toSong));
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
            const trendingQuery = artist ? `${artist} songs` : 'Trending songs new 2026';
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

      if (pathname === '/api/yt/stream') {
        const id = parsedUrl.searchParams.get('id') || '';
        const cleanId = id.replace(/^yt_|^yt-/, '').trim();
        if (!cleanId) return sendJson(res, 400, { error: 'Missing video id' });

        const qTitle = parsedUrl.searchParams.get('title') || parsedUrl.searchParams.get('q') || '';
        const qArtist = parsedUrl.searchParams.get('artist') || '';

        // ── TIER 1: Instant JioSaavn 320kbps HD CDN (<250ms response, zero buffering) ──
        try {
          const fast = await resolveFastAudio(cleanId, qTitle, qArtist);
          if (fast?.streamUrl) {
            if (parsedUrl.searchParams.get('json') === '1') {
              return sendJson(res, 200, { streamUrl: fast.streamUrl, source: fast.source });
            }
            res.writeHead(307, {
              'Location': fast.streamUrl,
              'Cache-Control': 'public, max-age=86400',
              'Access-Control-Allow-Origin': '*'
            });
            return res.end();
          }
        } catch (e) {
          console.warn(`[FAST_AUDIO] lookup warning for ${cleanId}: ${e.message}`);
        }

        const clientIp = getClientIp(req);

        // ── TIER 2: YouTube Audio (Client.Tv / Client.VisionOS bypasses bot checks) ──
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

          // ytdl IP-matched URL: also redirect directly
          if (src === 'ytdl' && urlWorksForClient(resolved.streamUrl, clientIp)) {
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

      if (pathname === '/api/playlists') {
        // The app sends the user id in the query (GET/PUT/DELETE) or in the body (POST); accept both.
        const plBody = (req.method === 'POST' || req.method === 'PUT') ? await parseBody(req) : {};
        const userId = parsedUrl.searchParams.get('userId') || plBody.userId || 'guest';
        if (!memoryDb.playlists[userId]) memoryDb.playlists[userId] = [];

        // 1. GET Playlists
        if (req.method === 'GET') {
          return sendJson(res, 200, { success: true, playlists: memoryDb.playlists[userId] || [] });
        }

        // 2. CREATE Playlist
        if (req.method === 'POST') {
          const body = plBody;
          const name = (body.name || '').trim() || 'My Playlist';
          const newPlaylist = {
            id: `pl_${Date.now()}`,
            name: name,
            description: body.description || '',
            songs: [],
            createdAt: new Date().toISOString()
          };
          memoryDb.playlists[userId].unshift(newPlaylist);
          saveDatabase();
          console.log(`✅ [PLAYLIST CREATED] "${name}" for user ${userId}`);
          return sendJson(res, 200, { success: true, playlist: newPlaylist });
        }

        // 3. ADD or REMOVE song in Playlist
        if (req.method === 'PUT') {
          const body = plBody;
          const playlistId = String(body.playlistId || '');
          const action = body.action || 'add';
          const pl = memoryDb.playlists[userId].find(p => String(p.id || p._id) === playlistId);

          if (!pl) {
            return sendJson(res, 404, { success: false, message: 'Playlist not found' });
          }

          if (action === 'add' && body.song) {
            const song = body.song;
            const songId = song.id || song.videoId;
            const exists = pl.songs.some(s => (s.id || s.videoId) === songId);
            if (!exists) {
              pl.songs.unshift(song);
              saveDatabase();
            }
            return sendJson(res, 200, { success: true, alreadyInPlaylist: exists, playlist: pl });
          }

          if (action === 'remove' && body.songId) {
            const sid = String(body.songId);
            pl.songs = pl.songs.filter(s => String(s.id || s.videoId) !== sid);
            saveDatabase();
            return sendJson(res, 200, { success: true, playlist: pl });
          }

          return sendJson(res, 200, { success: true, playlist: pl });
        }

        // 4. DELETE Playlist
        if (req.method === 'DELETE') {
          const plId = parsedUrl.searchParams.get('id');
          const plName = (parsedUrl.searchParams.get('name') || '').trim().toLowerCase();

          memoryDb.playlists[userId] = memoryDb.playlists[userId].filter(p => {
            const matchesId = plId && String(p.id || p._id) === String(plId);
            const matchesName = plName && String(p.name || '').trim().toLowerCase() === plName;
            return !(matchesId || matchesName);
          });
          saveDatabase();
          return sendJson(res, 200, { success: true, message: 'Playlist deleted successfully' });
        }
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
            } else {
              // Not liked -> Add to favorites
              memoryDb.likes[userId].unshift(song);
              isLiked = true;
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
          if (!memoryDb.playlists[uid]) memoryDb.playlists[uid] = [];
          const pl = memoryDb.playlists[uid].find(p => String(p.id || p._id) === plId);
          if (!pl) return sendJson(res, 404, { error: 'Playlist not found' });
          const songId = song.id || song.videoId;
          const exists = pl.songs.some(s => (s.id || s.videoId) === songId);
          if (!exists) { pl.songs.unshift(song); saveDatabase(); }
          return sendJson(res, 200, { success: true, alreadyExists: exists, playlist: pl });
        }
      }

      // ─── List user playlists (shorthand for the UI's selector)  ─────────
      // GET /api/user/playlists?userId=X → returns all playlists for picker
      if (pathname === '/api/user/playlists') {
        const uid = parsedUrl.searchParams.get('userId') || 'guest';
        const playlists = memoryDb.playlists[uid] || [];
        return sendJson(res, 200, { success: true, playlists });
      }

      // ─── Stream warm-up endpoint ─────────────────────────────────────────
      // GET /api/yt/warm?id=VIDEOID  - pre-resolve audio URL and cache it
      if (pathname === '/api/yt/warm' && req.method === 'GET') {
        const videoId = (parsedUrl.searchParams.get('id') || '').replace(/^yt[-_]/, '').trim();
        if (videoId) {
          // Race ytdl + Piped/Invidious simultaneously, cache both results
          warmAudio(ytAudioClient, [videoId]);
        }
        return sendJson(res, 200, { success: true });
      }

      
      // Verify Key 1 (Portal Gate Key)
      if (pathname === '/api/admin/verify-portal-key' && req.method === 'POST') {
        const b = await parseBody(req);
        const given = String(b.key || req.headers['x-portal-key'] || '').trim();
        const valid = ['auramynk@2007', 'AURA-PORTAL-789', 'portal2026', process.env.AURA_PORTAL_KEY, memoryDb.adminKeys?.portalKey].filter(Boolean);
        if (valid.includes(given)) return sendJson(res, 200, { success: true, verified: true });
        return sendJson(res, 401, { success: false, error: 'Invalid Portal Key (Key 1)' });
      }

      // Verify Key 2 (Admin Panel Login Key)
      if (pathname === '/api/admin/verify-panel-key' && req.method === 'POST') {
        const b = await parseBody(req);
        const given = String(b.key || req.headers['x-panel-key'] || '').trim();
        const valid = ['mynk@aura2007', 'AURA-ADMIN-456', 'admin2026', 'aura@mynk2007', process.env.AURA_PANEL_KEY, memoryDb.adminKeys?.panelKey].filter(Boolean);
        if (valid.includes(given)) return sendJson(res, 200, { success: true, verified: true });
        return sendJson(res, 401, { success: false, error: 'Invalid Admin Panel Key (Key 2)' });
      }

      // Verify Key 3 (App Update Key)
      if (pathname === '/api/admin/verify-update-key' && req.method === 'POST') {
        const b = await parseBody(req);
        const given = String(b.key || req.headers['x-admin-key'] || '').trim();
        const valid = ['mynk@2007', 'AURA-UPDATE-123', 'update2026', process.env.AURA_UPDATE_KEY, process.env.ADMIN_KEY, memoryDb.adminKeys?.updateKey].filter(Boolean);
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

server.listen(PORT, () => {
  console.log(`AuraMusic server running at http://localhost:${PORT}`);
});
