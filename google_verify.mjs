// Verifies a Google sign-in on the server, so an email address is only trusted when Google
// itself confirms it. The browser/app sends either:
//   idToken     - a Google ID token (web "credential", or the Android Google Sign-In token)
//   accessToken - a Google OAuth access token (web popup)
// and we ask Google whether the token is genuine and was issued to OUR app.

const DEFAULT_WEB_CLIENT_ID = '254466692985-6f6a09ehv1dvg2g4cr14m0ktqu2553vh.apps.googleusercontent.com';

const TOKENINFO_URL = (process.env.GOOGLE_TOKENINFO_URL || 'https://oauth2.googleapis.com/tokeninfo').replace(/\/+$/, '');
const USERINFO_URL = (process.env.GOOGLE_USERINFO_URL || 'https://www.googleapis.com/oauth2/v3/userinfo').replace(/\/+$/, '');

export function allowedClientIds() {
  const extra = (process.env.GOOGLE_CLIENT_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
  return [DEFAULT_WEB_CLIENT_ID, ...extra];
}

export class GoogleVerifyError extends Error {
  constructor(message, status = 401) {
    super(message);
    this.status = status;
  }
}

async function getJson(url, headers) {
  let res;
  try {
    res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
  } catch (e) {
    throw new GoogleVerifyError('Could not reach Google to verify the sign-in. Please try again.', 503);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new GoogleVerifyError('Google rejected this sign-in token. Please sign in again.', 401);
  return data;
}

const isTrue = v => v === true || v === 'true';

function checkAudience(...values) {
  const allowed = allowedClientIds();
  if (!values.some(v => v && allowed.includes(v))) {
    throw new GoogleVerifyError('This Google token was not issued for AuraMusic.', 401);
  }
}

async function verifyIdToken(idToken) {
  const info = await getJson(`${TOKENINFO_URL}?id_token=${encodeURIComponent(idToken)}`);
  checkAudience(info.aud);
  if (info.iss && !/^(https:\/\/)?accounts\.google\.com$/.test(info.iss)) {
    throw new GoogleVerifyError('Invalid Google token issuer.', 401);
  }
  if (info.exp && Number(info.exp) * 1000 < Date.now()) {
    throw new GoogleVerifyError('Google sign-in expired. Please try again.', 401);
  }
  if (!info.email || !isTrue(info.email_verified)) {
    throw new GoogleVerifyError('Your Google email is not verified.', 401);
  }
  return { email: info.email, name: info.name, picture: info.picture };
}

async function verifyAccessToken(accessToken) {
  const info = await getJson(`${TOKENINFO_URL}?access_token=${encodeURIComponent(accessToken)}`);
  checkAudience(info.aud, info.azp, info.issued_to);
  const profile = await getJson(USERINFO_URL, { Authorization: `Bearer ${accessToken}` });
  if (!profile.email || !isTrue(profile.email_verified)) {
    throw new GoogleVerifyError('Your Google email is not verified.', 401);
  }
  return { email: profile.email, name: profile.name || profile.given_name, picture: profile.picture };
}

// Returns { email, name, picture, verified } or throws GoogleVerifyError.
export async function verifyGoogleLogin(body) {
  const rawIdToken = body.idToken || body.credential; // `credential` is the name Google's web button uses
  const idToken = typeof rawIdToken === 'string' ? rawIdToken.trim() : '';
  const accessToken = typeof body.accessToken === 'string' ? body.accessToken.trim() : '';

  if (idToken) return { ...(await verifyIdToken(idToken)), verified: true };
  if (accessToken) return { ...(await verifyAccessToken(accessToken)), verified: true };

  // No proof from Google (e.g. the Android app's plain phone account list, or someone calling the API directly).
  // Until the Android OAuth client is set up this still has to work, so it is allowed by default.
  // Set REQUIRE_GOOGLE_VERIFY=1 on the server to refuse every sign-in that Google has not verified.
  if (process.env.REQUIRE_GOOGLE_VERIFY !== '1') {
    const email = (body.email || '').trim();
    if (!email.includes('@')) throw new GoogleVerifyError('Valid Google email is required.', 422);
    return { email, name: body.name, picture: body.avatar, verified: false };
  }
  throw new GoogleVerifyError(
    'Google could not verify this sign-in. Please update the AuraMusic app, or sign in with email.',
    401
  );
}
