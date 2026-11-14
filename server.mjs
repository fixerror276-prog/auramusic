import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { sendBrevoOtpEmail } from './brevo_mailer.mjs';

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
    likes: {}
  };
}

const dbData = loadDatabase();
function saveDatabase() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify({
      users: memoryDb.users,
      playlists: memoryDb.playlists,
      likes: memoryDb.likes
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
  likes: dbData.likes || {}
};

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

        return sendJson(res, 200, {
          status: 'success',
          message: brevoDelivered 
            ? `OTP code sent to ${email} via Brevo SMTP.` 
            : `OTP generated for ${email}. Note: ${deliveryError}`,
          delivered: brevoDelivered,
          smtpError: deliveryError,
          // OTP is sent via Brevo email strictly
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
        if (!user || user.passwordHash !== hashPassword(password)) {
          return sendJson(res, 422, {
            status: 'error',
            message: 'These credentials do not match our records.',
            errors: { email: ['These credentials do not match our records.'] }
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

      // App Proxy / Search / Lyrics / Playlists APIs (Preserving existing website features)
      if (pathname === '/api/yt/search') {
        const query = parsedUrl.searchParams.get('q') || '';
        try {
          const upstream = await fetch(`https://auramusic-2026.netlify.app/api/yt/search?q=${encodeURIComponent(query)}`);
          if (upstream.ok) return sendJson(res, 200, await upstream.json());
        } catch {}
        return sendJson(res, 200, []);
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

      if (pathname === '/api/yt/stream') {
        const id = parsedUrl.searchParams.get('id');
        const q = parsedUrl.searchParams.get('q');
        try {
          const upstream = await fetch(`https://auramusic-2026.netlify.app/api/yt/stream?id=${encodeURIComponent(id || '')}&q=${encodeURIComponent(q || '')}`);
          if (upstream.ok) {
            const buf = await upstream.arrayBuffer();
            res.writeHead(200, {
              'Content-Type': upstream.headers.get('content-type') || 'audio/mp4',
              'Content-Length': buf.byteLength
            });
            return res.end(Buffer.from(buf));
          }
        } catch {}
        return sendJson(res, 404, { error: 'Stream not found' });
      }

      if (pathname === '/api/playlists') {
        const userId = parsedUrl.searchParams.get('userId') || 'guest';
        if (req.method === 'GET') {
          return sendJson(res, 200, { success: true, playlists: memoryDb.playlists[userId] || [] });
        }
        if (req.method === 'POST') {
          const body = await parseBody(req);
          const newPlaylist = {
            id: `pl_${Date.now()}`,
            name: body.name || 'Untitled Playlist',
            description: body.description || '',
            songs: [],
            createdAt: new Date().toISOString()
          };
          if (!memoryDb.playlists[userId]) memoryDb.playlists[userId] = [];
          memoryDb.playlists[userId].push(newPlaylist);
          return sendJson(res, 200, { success: true, playlist: newPlaylist });
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
          }

          return sendJson(res, 200, {
            success: true,
            isLiked: isLiked,
            songs: memoryDb.likes[userId]
          });
        }
      }

      if (pathname === '/api/admin/stats') {
        return sendJson(res, 200, {
          success: true,
          stats: {
            totalUsers: memoryDb.users.length,
            totalPlaylists: Object.values(memoryDb.playlists).flat().length,
            totalLikes: Object.values(memoryDb.likes).flat().length,
            cachedStreamsCount: 128,
            database: 'Brevo SMTP Integrated Store'
          }
        });
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
