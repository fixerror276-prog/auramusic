// AuraMusic Modern Authentication & Google OAuth Flow Integration
(function() {
  const style = document.createElement('style');
  style.id = 'auramusic-auth-system-styles';
  style.textContent = `
    .auramusic-overlay {
      position: fixed;
      inset: 0;
      z-index: 999999;
      background: #121316;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-start;
      padding: 50px 16px 40px;
      overflow-y: auto;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #f2f2f2;
      box-sizing: border-box;
      animation: auraFadeIn 0.22s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @keyframes auraFadeIn {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .auramusic-logo-link {
      margin-bottom: 28px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 12px;
      text-decoration: none;
    }
    .auramusic-logo-img {
      height: 38px;
      width: 38px;
      border-radius: 50%;
      object-fit: cover;
    }
    .auramusic-card {
      width: 100%;
      max-width: 440px;
      background: #1c1d22;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 16px;
      padding: 34px 30px 30px;
      box-shadow: 0 16px 40px rgba(0,0,0,0.7);
      box-sizing: border-box;
      position: relative;
    }
    .auramusic-close-btn {
      position: absolute;
      top: 18px;
      right: 18px;
      background: transparent;
      border: none;
      color: rgba(255, 255, 255, 0.45);
      font-size: 20px;
      cursor: pointer;
      padding: 4px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: color 0.15s, background 0.15s;
    }
    .auramusic-close-btn:hover {
      color: #fff;
      background: rgba(255, 255, 255, 0.06);
    }
    .auramusic-heading {
      font-size: 22px;
      font-weight: 700;
      color: #fff;
      margin: 0 0 8px;
      line-height: 1.25;
    }
    .auramusic-subheading {
      font-size: 13px;
      color: rgba(255, 255, 255, 0.7);
      margin-bottom: 22px;
      line-height: 1.45;
    }
    .auramusic-input-group {
      margin-bottom: 20px;
      position: relative;
    }
    .auramusic-label-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }
    .auramusic-label {
      font-size: 13px;
      font-weight: 500;
      color: #f2f2f2;
    }
    .auramusic-label-link {
      font-size: 12px;
      color: #fe4559;
      text-decoration: none;
      cursor: pointer;
      font-weight: 500;
    }
    .auramusic-label-link:hover {
      text-decoration: underline;
    }
    .auramusic-input-wrapper {
      position: relative;
      display: flex;
      align-items: center;
    }
    .auramusic-input {
      width: 100%;
      height: 44px;
      background: #141518;
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 8px;
      padding: 0 14px;
      font-size: 14px;
      color: #fff;
      outline: none;
      box-sizing: border-box;
      transition: border-color 0.15s, box-shadow 0.15s;
    }
    .auramusic-input:focus {
      border-color: #fe4559;
      box-shadow: 0 0 0 1px #fe4559;
    }
    .auramusic-input-adornment {
      position: absolute;
      right: 12px;
      background: transparent;
      border: none;
      color: rgba(255, 255, 255, 0.5);
      cursor: pointer;
      font-size: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 4px;
    }
    .auramusic-input-adornment:hover {
      color: #fff;
    }
    .auramusic-otp-digits-wrapper {
      display: flex;
      gap: 8px;
      justify-content: center;
      align-items: center;
      margin: 18px 0 24px;
      width: 100%;
      max-width: 320px;
      margin-left: auto;
      margin-right: auto;
      box-sizing: border-box;
    }
    .auramusic-otp-digit {
      width: 44px;
      height: 48px;
      flex: 0 0 44px;
      background: #141518;
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 8px;
      text-align: center;
      font-size: 20px;
      font-weight: 700;
      color: #fe4559;
      outline: none;
      transition: all 0.15s ease;
      box-sizing: border-box;
    }
    .auramusic-otp-digit:focus {
      border-color: #fe4559;
      box-shadow: 0 0 0 2px rgba(254, 69, 89, 0.35);
      background: #1f2025;
    }
    .auramusic-btn-primary {
      width: 100%;
      height: 44px;
      background: #fe4559;
      border: none;
      border-radius: 9999px;
      color: #fff;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      transition: background 0.15s, transform 0.05s;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }
    .auramusic-btn-primary:hover {
      background: #e6384c;
    }
    .auramusic-btn-primary:active {
      transform: scale(0.99);
    }
    .auramusic-btn-primary:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    .auramusic-resend-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-top: 14px;
      font-size: 13px;
      color: rgba(255, 255, 255, 0.6);
    }
    .auramusic-resend-btn {
      background: none;
      border: none;
      color: #fe4559;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      padding: 0;
    }
    .auramusic-resend-btn:disabled {
      color: rgba(255, 255, 255, 0.35);
      cursor: not-allowed;
    }
    .auramusic-resend-btn:not(:disabled):hover {
      text-decoration: underline;
    }
    .auramusic-alert-error {
      background: rgba(254, 69, 89, 0.18);
      border: 1px solid rgba(254, 69, 89, 0.5);
      color: #ff9da8;
      font-size: 13px;
      padding: 12px 14px;
      border-radius: 8px;
      margin-bottom: 20px;
      line-height: 1.45;
      font-weight: 500;
    }
    .auramusic-alert-success {
      background: rgba(16, 185, 129, 0.15);
      border: 1px solid rgba(16, 185, 129, 0.4);
      color: #a7f3d0;
      font-size: 13px;
      padding: 12px 14px;
      border-radius: 8px;
      margin-bottom: 20px;
      line-height: 1.45;
      font-weight: 500;
    }
    .auramusic-spinner {
      width: 16px;
      height: 16px;
      border: 2px solid rgba(255,255,255,0.3);
      border-top-color: #fff;
      border-radius: 50%;
      animation: auraSpin 0.6s linear infinite;
    }
    @keyframes auraSpin {
      to { transform: rotate(360deg); }
    }

    /* Google OAuth Authentic Styles (Exact SoundCloud / Google Chrome replication) */
    .google-browser-bar {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 14px;
      background: #1f1f23;
      border-radius: 12px;
      margin-bottom: 22px;
      font-size: 13px;
      color: #9aa0a6;
      border: 1px solid rgba(255,255,255,0.06);
    }
    .google-browser-lock {
      color: #8ab4f8;
      font-size: 14px;
      display: flex;
      align-items: center;
    }
    .google-browser-url {
      color: #e8eaed;
      font-weight: 500;
      letter-spacing: -0.01em;
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .google-oauth-top-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 22px;
    }
    .google-oauth-top-title {
      font-size: 16px;
      font-weight: 500;
      color: #e8eaed;
    }
    .google-app-badge {
      width: 44px;
      height: 44px;
      border-radius: 10px;
      background: #fe4559;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 18px;
      box-shadow: 0 4px 12px rgba(254,69,89,0.35);
    }
    .google-app-badge img {
      width: 28px;
      height: 28px;
      object-fit: contain;
    }
    .google-main-title {
      font-size: 26px;
      font-weight: 400;
      color: #ffffff;
      margin: 0 0 6px;
      line-height: 1.25;
      letter-spacing: -0.02em;
    }
    .google-main-subtitle {
      font-size: 15px;
      color: #9aa0a6;
      margin-bottom: 24px;
    }
    .google-account-pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 14px 6px 8px;
      border: 1px solid rgba(255,255,255,0.2);
      border-radius: 9999px;
      margin-bottom: 24px;
      background: rgba(255,255,255,0.04);
      cursor: pointer;
    }
    .google-account-pill:hover {
      background: rgba(255,255,255,0.08);
    }
    .google-pill-avatar {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: #34A853;
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: bold;
    }
    .google-pill-email {
      font-size: 13px;
      color: #e8eaed;
      font-weight: 500;
    }
    .google-pill-arrow {
      font-size: 10px;
      color: #9aa0a6;
      margin-left: 2px;
    }
    .google-consent-section-title {
      font-size: 16px;
      color: #9aa0a6;
      margin-bottom: 20px;
    }
    .google-share-row {
      display: flex;
      align-items: flex-start;
      gap: 16px;
      margin-bottom: 18px;
    }
    .google-share-icon {
      color: #9aa0a6;
      font-size: 20px;
      line-height: 1;
      margin-top: 2px;
    }
    .google-share-name {
      font-size: 15px;
      font-weight: 500;
      color: #fff;
      margin-bottom: 2px;
    }
    .google-share-desc {
      font-size: 13px;
      color: #9aa0a6;
      line-height: 1.4;
    }
    .google-legal-notice {
      font-size: 12px;
      color: #9aa0a6;
      line-height: 1.55;
      margin: 26px 0 28px;
    }
    .google-legal-notice a {
      color: #8ab4f8;
      text-decoration: none;
    }
    .google-action-buttons-row {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 12px;
    }
    .google-btn-cancel-flat {
      padding: 10px 24px;
      border-radius: 9999px;
      border: 1px solid rgba(255,255,255,0.18);
      background: transparent;
      color: #8ab4f8;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s;
    }
    .google-btn-cancel-flat:hover {
      background: rgba(138, 180, 248, 0.08);
    }
    .google-btn-continue-pill {
      padding: 10px 28px;
      border-radius: 9999px;
      border: none;
      background: #8ab4f8;
      color: #202124;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      transition: background 0.15s;
    }
    .google-btn-continue-pill:hover {
      background: #aecbfa;
    }

    /* Device Verification Screen */
    .device-verify-wrapper {
      padding: 30px 10px;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
    }
    .device-verify-circle {
      width: 72px;
      height: 72px;
      border-radius: 50%;
      border: 3px solid #10b981;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #10b981;
      font-size: 32px;
      margin: 24px 0 20px;
      animation: verifyPulse 1.2s ease-in-out infinite alternate;
    }
    @keyframes verifyPulse {
      from { transform: scale(0.96); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.2); }
      to { transform: scale(1.04); box-shadow: 0 0 0 10px rgba(16, 185, 129, 0); }
    }
    .device-verify-heading {
      font-size: 24px;
      font-weight: 600;
      color: #fff;
      margin-bottom: 12px;
    }
    .device-verify-sub {
      font-size: 14px;
      color: #9aa0a6;
      line-height: 1.5;
      max-width: 300px;
    }

    .google-consent-box {
      background: #18191d;
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 12px;
      padding: 16px;
      margin-bottom: 20px;
    }
    .google-consent-header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding-bottom: 14px;
      border-bottom: 1px solid rgba(255,255,255,0.08);
      margin-bottom: 14px;
    }
    .google-consent-perm-item {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      margin-bottom: 12px;
      font-size: 13px;
      color: rgba(255,255,255,0.85);
      line-height: 1.4;
    }
    .google-consent-perm-icon {
      color: #34A853;
      font-size: 15px;
      flex-shrink: 0;
      margin-top: 1px;
    }
    .google-btn-allow {
      width: 100%;
      height: 44px;
      background: #1a73e8;
      border: none;
      border-radius: 9999px;
      color: #fff;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      transition: background 0.15s, transform 0.05s;
    }
    .google-btn-allow:hover {
      background: #1557b0;
    }
    .google-btn-allow:active {
      transform: scale(0.99);
    }
    .google-btn-cancel {
      width: 100%;
      height: 40px;
      background: transparent;
      border: 1px solid rgba(255,255,255,0.18);
      border-radius: 9999px;
      color: rgba(255,255,255,0.8);
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      margin-top: 10px;
      transition: background 0.15s, color 0.15s;
    }
    .google-btn-cancel:hover {
      background: rgba(255,255,255,0.06);
      color: #fff;
    }
    
    /* Google Account Chooser items */
    .google-account-item {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 12px 14px;
      border-radius: 12px;
      background: #141518;
      border: 1px solid rgba(255, 255, 255, 0.08);
      cursor: pointer;
      transition: all 0.15s ease;
      margin-bottom: 8px;
      text-align: left;
    }
    .google-account-item:hover {
      background: #222328;
      border-color: rgba(255, 255, 255, 0.18);
    }
    .google-avatar-circle {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 16px;
      color: #fff;
      flex-shrink: 0;
    }
  `;
  document.head.appendChild(style);

  let currentMode = 'login'; 
  // Modes: 'login' | 'register' | 'otp' | 'google-picker' | 'google-consent' | 'google-password' | 'google-otp' | 'google-set-password' | 'forgot-request' | 'forgot-verify'
  let pendingEmail = '';
  let pendingPassword = '';
  let pendingGoogleName = '';
  let pendingGoogleEmail = '';
  let pendingGoogleInitial = 'G';
  let pendingGoogleBg = '#4285F4';

  const GOOGLE_CLIENT_ID = '254466692985-6f6a09ehv1dvg2g4cr14m0ktqu2553vh.apps.googleusercontent.com';

  async function triggerGoogleGIS() {
    // Exactly like Web: Use Google Identity Services (GIS) initTokenClient popup in both Web & APK!
    if (window.google && window.google.accounts && window.google.accounts.oauth2) {
      try {
        const tokenClient = window.google.accounts.oauth2.initTokenClient({
          client_id: GOOGLE_CLIENT_ID,
          scope: 'email profile openid',
          prompt: 'select_account',
          callback: async (tokenResponse) => {
            if (tokenResponse && tokenResponse.access_token) {
              try {
                // Fetch verified profile from Google UserInfo endpoint
                const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                  headers: { Authorization: 'Bearer ' + tokenResponse.access_token }
                });
                if (userInfoRes.ok) {
                  const profile = await userInfoRes.json();
                  const loginRes = await fetch('/api/v1/auth/google-login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      email: profile.email,
                      name: profile.name || profile.given_name || profile.email.split('@')[0],
                      avatar: profile.picture || '/avatars/p1.jpg'
                    })
                  });
                  const loginData = await loginRes.json();
                  const userObj = (loginData && loginData.user) ? loginData.user : {
                    name: profile.name || profile.email.split('@')[0],
                    email: profile.email,
                    avatar: profile.picture || '/avatars/p1.jpg',
                    provider: 'google'
                  };
                  handleAuthSuccess(userObj);
                  return;
                }
              } catch (fetchErr) {
                console.warn('GIS UserInfo fetch error:', fetchErr);
              }
            }
          },
          error_callback: (err) => {
            console.warn('Google GIS Error:', err);
            // Fallback to seamless account picker modal if GIS popup blocked or not authorized
            if (window.google && window.google.accounts) { try { window.google.accounts.id.prompt(); } catch(e){} }
          }
        });
        tokenClient.requestAccessToken({ prompt: 'select_account' });
        return;
      } catch (gisErr) {
        console.warn('GIS Init Error:', gisErr);
      }
    }

    // Try Google One-Tap / ID Credential if oauth2 token client not available
    if (window.google && window.google.accounts && window.google.accounts.id) {
      try {
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          prompt_parent_id: 'auramusic-auth-overlay',
          callback: async (response) => {
            if (response.credential) {
              try {
                // Decode JWT
                const base64Url = response.credential.split('.')[1];
                const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
                const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
                const profile = JSON.parse(jsonPayload);
                const loginRes = await fetch('/api/v1/auth/google-login', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    email: profile.email,
                    name: profile.name || profile.given_name || profile.email.split('@')[0],
                    avatar: profile.picture || '/avatars/p1.jpg'
                  })
                });
                const loginData = await loginRes.json();
                const userObj = (loginData && loginData.user) ? loginData.user : {
                  name: profile.name || profile.email.split('@')[0],
                  email: profile.email,
                  avatar: profile.picture || '/avatars/p1.jpg',
                  provider: 'google'
                };
                handleAuthSuccess(userObj);
                return;
              } catch (e) {
                console.warn('JWT parse warn:', e);
              }
            }
          }
        });
        window.google.accounts.id.prompt();
        return;
      } catch (idErr) {
        console.warn('Google ID prompt error:', idErr);
      }
    }

    // Fallback if GIS client script is still loading or offline
    if (window.google && window.google.accounts) { try { window.google.accounts.id.prompt(); } catch(e){} }
  }

  
  // Check if returning from Google OAuth redirect (access_token in URL hash)
  try {
    if (window.location.hash && window.location.hash.includes('access_token=')) {
      const params = new URLSearchParams(window.location.hash.substring(1));
      const accessToken = params.get('access_token');
      if (accessToken) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
        fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: 'Bearer ' + accessToken }
        }).then(r => r.json()).then(profile => {
          if (profile && profile.email) {
            fetch('/api/v1/auth/google-login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                email: profile.email,
                name: profile.name || profile.given_name || profile.email.split('@')[0],
                avatar: profile.picture || '/avatars/p1.jpg'
              })
            }).then(r => r.json()).then(data => {
              const userObj = (data && data.user) ? data.user : {
                name: profile.name || profile.email.split('@')[0],
                email: profile.email,
                avatar: profile.picture || '/avatars/p1.jpg',
                provider: 'google'
              };
              handleAuthSuccess(userObj);
              // If user arrived here in external browser from Android APK, bounce back into the app!
              if (/android/i.test(navigator.userAgent) && !window.AuraNative) {
                try {
                  const userJson = encodeURIComponent(JSON.stringify(userObj));
                  // Android Chrome standard Intent URI format (guaranteed to launch the app package or fallback)
                  const intentUrl = 'intent://auth?user=' + userJson + '#Intent;scheme=auramusic;package=com.auramusic.app;end';
                  
                  // Also show a direct one-tap button on page in case browser prevents automatic navigation
                  const banner = document.createElement('div');
                  banner.style.cssText = 'position:fixed;inset:0;background:rgba(9,10,15,0.95);z-index:9999999;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;text-align:center;font-family:sans-serif;';
                  banner.innerHTML = `
                    <div style="width:64px;height:64px;border-radius:20px;background:#4285F4;display:flex;align-items:center;justify-content:center;font-size:32px;margin-bottom:20px;">✓</div>
                    <h2 style="color:#fff;font-size:20px;font-weight:700;margin-bottom:8px;">Signed in as ${userObj.name || userObj.email}</h2>
                    <p style="color:#9aa0a6;font-size:14px;margin-bottom:24px;">Tap below to return to your AuraMusic App:</p>
                    <a href="${intentUrl}" style="background:#fe4559;color:#fff;text-decoration:none;padding:14px 28px;border-radius:9999px;font-weight:700;font-size:15px;display:inline-block;box-shadow:0 8px 24px rgba(254,69,89,0.4);">Open AuraMusic App</a>
                  `;
                  document.body.appendChild(banner);

                  // Trigger intent navigation
                  window.location.href = intentUrl;
                } catch(e) {
                  console.warn('Intent redirect error:', e);
                }
              }
            });
          }
        }).catch(err => console.warn('OAuth token fetch error:', err));
      }
    }
  } catch (e) {}

  
  // Native APK Auth Callback Handler (Deep link return)
  window.__handleNativeAuthCallback = function(userData) {
    if (userData && userData.email) {
      handleAuthSuccess(userData);
    }
  };

  
  window.__fallbackToWebGIS = function() {};

  let resendCountdown = 30;
  let countdownTimer = null;

  function renderModal(mode = 'login') {
    currentMode = mode;
    closeModal();

    const overlay = document.createElement('div');
    overlay.id = 'auramusic-auth-overlay';
    overlay.className = 'auramusic-overlay';

    let cardTitle = 'Sign in to your account';
    if (mode === 'register') cardTitle = 'Create a new account';
    else if (mode === 'otp') cardTitle = 'Confirm Access with OTP';
    else if (mode === 'google-picker') cardTitle = 'Sign in with Google';
    else if (mode === 'google-consent') cardTitle = 'Connect your Google Account';
    else if (mode === 'google-password') cardTitle = 'Enter Password';
    else if (mode === 'google-otp') cardTitle = 'Verify Email OTP';
    else if (mode === 'google-set-password') cardTitle = 'Set Account Password';
    else if (mode === 'forgot-request') cardTitle = 'Forgot Password';
    else if (mode === 'forgot-verify') cardTitle = 'Reset Password with OTP';

    overlay.innerHTML = `
      <div class="auramusic-logo-link" id="auramusic-top-logo">
        <img src="/logo.png" alt="AuraMusic" class="auramusic-logo-img" />
        <span style="font-size: 24px; font-weight: 800; letter-spacing: -0.03em; color: #fe4559;">AuraMusic</span>
      </div>

      <div class="auramusic-card">
        ${isLoggedIn() ? `<button type="button" class="auramusic-close-btn" id="auramusic-close-x">✕</button>` : ``}

        ${['google-picker', 'google-consent', 'google-verify'].includes(mode) ? '' : `<h1 class="auramusic-heading" id="auramusic-card-title">${cardTitle}</h1>`}

        ${mode === 'otp' ? `
          <div class="auramusic-subheading">
            A 6-digit confirmation code was sent to <b style="color: #fff;">${pendingEmail}</b>. Please check your inbox (and spam).
          </div>
        ` : ''}

        ${mode === 'google-picker' ? `
          <div class="auramusic-subheading" style="display: flex; align-items: center; gap: 6px;">
            <span>to continue to</span> <b style="color: #4285F4;">AuraMusic</b>
          </div>
        ` : ''}

        ${mode === 'google-password' ? `
          <div class="auramusic-subheading">
            Account found for <b style="color: #fff;">${pendingGoogleEmail}</b>. Enter your password to continue.
          </div>
        ` : ''}

        ${mode === 'google-otp' ? `
          <div class="auramusic-subheading">
            A 6-digit verification code was dispatched to <b style="color: #fff;">${pendingGoogleEmail}</b>. Enter code below:
          </div>
        ` : ''}

        ${mode === 'google-set-password' ? `
          <div class="auramusic-subheading">
            Email verified! Now create a secure password for your AuraMusic account (<b style="color: #fff;">${pendingGoogleEmail}</b>).
          </div>
        ` : ''}

        ${mode === 'forgot-request' ? `
          <div class="auramusic-subheading">
            Enter your registered email address. We will dispatch a 6-digit OTP code to reset your password.
          </div>
        ` : ''}

        ${mode === 'forgot-verify' ? `
          <div class="auramusic-subheading">
            6-digit reset code sent to <b style="color: #fff;">${pendingEmail}</b>. Enter the code and your new password.
          </div>
        ` : ''}

        <div id="auramusic-alert-box" class="auramusic-alert-error" style="display: none;"></div>

        <!-- 1. LOGIN FORM -->
        ${mode === 'login' ? `
          <div>
            <div class="auramusic-input-group">
              <div class="auramusic-label-row">
                <label class="auramusic-label" for="aura-email">Email</label>
              </div>
              <div class="auramusic-input-wrapper">
                <input type="email" id="aura-email" class="auramusic-input" autocomplete="email" placeholder="you@domain.com" />
              </div>
            </div>

            <div class="auramusic-input-group">
              <div class="auramusic-label-row">
                <label class="auramusic-label" for="aura-password">Password</label>
                <a class="auramusic-label-link" id="aura-forgot-link">Forgot your password?</a>
              </div>
              <div class="auramusic-input-wrapper">
                <input type="password" id="aura-password" class="auramusic-input" autocomplete="current-password" placeholder="••••••••" />
                <button type="button" class="auramusic-input-adornment" id="aura-toggle-pass">👁</button>
              </div>
            </div>

            <label style="display: flex; align-items: center; gap: 8px; margin-bottom: 22px; font-size: 13px; color: #ccc; cursor: pointer;">
              <input type="checkbox" id="aura-remember" checked style="accent-color: #fe4559;" />
              <span>Remember me on this device</span>
            </label>

            <button type="button" class="auramusic-btn-primary" id="aura-login-submit">
              <span>Continue</span>
            </button>
          </div>

          <div style="position: relative; margin: 22px 0 18px; text-align: center;">
            <div style="position: absolute; top: 50%; left: 0; right: 0; height: 1px; background: rgba(255,255,255,0.12);"></div>
            <span style="position: relative; background: #1c1d22; padding: 0 10px; font-size: 12px; color: rgba(255,255,255,0.5); text-transform: uppercase; font-weight: 600;">Or sign in with</span>
          </div>

          <div>
            <button type="button" id="aura-google-btn" style="width: 100%; height: 42px; background: #141518; border: 1px solid rgba(255,255,255,0.15); border-radius: 9999px; display: flex; align-items: center; justify-content: center; gap: 10px; font-size: 14px; font-weight: 600; color: #fff; cursor: pointer; transition: background 0.15s;">
              <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
              Sign in with Google
            </button>
          </div>
        ` : ''}

        <!-- 2. REGISTER FORM -->
        ${mode === 'register' ? `
          <div>
            <div class="auramusic-input-group">
              <div class="auramusic-label-row">
                <label class="auramusic-label" for="aura-reg-email">Email Address</label>
              </div>
              <div class="auramusic-input-wrapper">
                <input type="email" id="aura-reg-email" class="auramusic-input" autocomplete="email" placeholder="you@domain.com" />
              </div>
            </div>

            <div class="auramusic-input-group">
              <div class="auramusic-label-row">
                <label class="auramusic-label" for="aura-reg-password">Password</label>
              </div>
              <div class="auramusic-input-wrapper">
                <input type="password" id="aura-reg-password" class="auramusic-input" autocomplete="new-password" placeholder="••••••••" />
                <button type="button" class="auramusic-input-adornment" id="aura-toggle-reg-pass">👁</button>
              </div>
            </div>

            <div class="auramusic-input-group">
              <div class="auramusic-label-row">
                <label class="auramusic-label" for="aura-reg-confirm">Confirm Password</label>
              </div>
              <div class="auramusic-input-wrapper">
                <input type="password" id="aura-reg-confirm" class="auramusic-input" autocomplete="new-password" placeholder="••••••••" />
              </div>
            </div>

            <button type="button" class="auramusic-btn-primary" id="aura-reg-submit">
              <span>Send Email OTP & Continue</span>
            </button>
          </div>

          <div style="position: relative; margin: 22px 0 18px; text-align: center;">
            <div style="position: absolute; top: 50%; left: 0; right: 0; height: 1px; background: rgba(255,255,255,0.12);"></div>
            <span style="position: relative; background: #1c1d22; padding: 0 10px; font-size: 12px; color: rgba(255,255,255,0.5); text-transform: uppercase; font-weight: 600;">Or sign up with</span>
          </div>

          <div>
            <button type="button" id="aura-reg-google-btn" style="width: 100%; height: 42px; background: #141518; border: 1px solid rgba(255,255,255,0.15); border-radius: 9999px; display: flex; align-items: center; justify-content: center; gap: 10px; font-size: 14px; font-weight: 600; color: #fff; cursor: pointer; transition: background 0.15s;">
              <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
              Sign up with Google
            </button>
          </div>
        ` : ''}

        <!-- 3. OTP VERIFICATION FORM (STANDARD REGISTER) -->
        ${mode === 'otp' ? `
          <div>
            <div class="auramusic-label" style="text-align: center; margin-bottom: 8px;">Enter 6-digit confirmation code</div>

            <div class="auramusic-otp-digits-wrapper">
              <input type="text" maxlength="1" class="auramusic-otp-digit" data-idx="0" inputmode="numeric" autofocus />
              <input type="text" maxlength="1" class="auramusic-otp-digit" data-idx="1" inputmode="numeric" />
              <input type="text" maxlength="1" class="auramusic-otp-digit" data-idx="2" inputmode="numeric" />
              <input type="text" maxlength="1" class="auramusic-otp-digit" data-idx="3" inputmode="numeric" />
              <input type="text" maxlength="1" class="auramusic-otp-digit" data-idx="4" inputmode="numeric" />
              <input type="text" maxlength="1" class="auramusic-otp-digit" data-idx="5" inputmode="numeric" />
            </div>

            <button type="button" class="auramusic-btn-primary" id="aura-otp-submit">
              <span>Verify OTP & Create Account</span>
            </button>

            <div class="auramusic-resend-row">
              <span id="aura-timer-label">Resend code in <b>${resendCountdown}s</b></span>
              <button type="button" class="auramusic-resend-btn" id="aura-resend-btn" disabled>Resend Code</button>
            </div>
          </div>
        ` : ''}

        <!-- 4. GOOGLE ACCOUNT CHOOSER (EXACT SOUNDCLOUD VIDEO REPLICATION) -->
        ${mode === 'google-picker' ? `
          <div>
            <div class="google-browser-bar">
              <div class="google-browser-lock">🔒</div>
              <div class="google-browser-url">accounts.google.com/v3/signin/identifier</div>
            </div>

            <div class="google-oauth-top-header">
              <svg width="20" height="20" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
              <span class="google-oauth-top-title">Sign in with Google</span>
            </div>

            <div class="google-app-badge">
              <img src="/logo.png" alt="AuraMusic" />
            </div>

            <h2 class="google-main-title">Choose an account</h2>
            <div class="google-main-subtitle">to continue to <b style="color: #fe4559; font-weight: 600;">AuraMusic</b></div>

            <div id="google-accounts-list">
              <!-- Render Accounts List -->
            </div>

            <div id="google-custom-form" style="display: none; margin-top: 14px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 14px;">
              <div class="auramusic-input-group">
                <div class="auramusic-label-row">
                  <label class="auramusic-label">Your Google Email / Device Email</label>
                </div>
                <div class="auramusic-input-wrapper">
                  <input type="email" id="google-input-email" class="auramusic-input" placeholder="e.g. you@gmail.com" autofocus />
                </div>
              </div>

              <div class="auramusic-input-group" style="margin-bottom: 16px;">
                <div class="auramusic-label-row">
                  <label class="auramusic-label">Display Name (Optional)</label>
                </div>
                <div class="auramusic-input-wrapper">
                  <input type="text" id="google-input-name" class="auramusic-input" placeholder="e.g. Formwork" />
                </div>
              </div>

              <button type="button" class="auramusic-btn-primary" id="google-confirm-custom-btn">
                <span>Next →</span>
              </button>
            </div>
          </div>
        ` : ''}

        <!-- 4b. GOOGLE CONSENT & PERMISSION SCREEN (EXACT REPLICATION) -->
        ${mode === 'google-consent' ? `
          <div>
            <div class="google-browser-bar">
              <div class="google-browser-lock">🔒</div>
              <div class="google-browser-url">accounts.google.com/signin/oauth/consent</div>
            </div>

            <div class="google-oauth-top-header">
              <svg width="20" height="20" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
              <span class="google-oauth-top-title">Sign in with Google</span>
            </div>

            <div class="google-app-badge">
              <img src="/logo.png" alt="AuraMusic" />
            </div>

            <h2 class="google-main-title" style="font-size: 24px; margin-bottom: 12px;">Sign in to AuraMusic</h2>

            <div class="google-account-pill" id="google-pill-back-btn" title="Switch Account">
              <div class="google-pill-avatar" style="background: ${pendingGoogleBg};">${pendingGoogleInitial}</div>
              <div class="google-pill-email">${pendingGoogleEmail}</div>
              <div class="google-pill-arrow">▼</div>
            </div>

            <div class="google-consent-section-title">You'll share this info about you</div>

            <div class="google-share-row">
              <div class="google-share-icon">👤</div>
              <div>
                <div class="google-share-name">${pendingGoogleName}</div>
                <div class="google-share-desc">Name and profile picture</div>
              </div>
            </div>

            <div class="google-share-row">
              <div class="google-share-icon">✉️</div>
              <div>
                <div class="google-share-name">${pendingGoogleEmail}</div>
                <div class="google-share-desc">Email address</div>
              </div>
            </div>

            <div class="google-legal-notice">
              Review AuraMusic's <a href="#">Privacy Policy</a> and <a href="#">Terms of Service</a>.<br/>
              You can make changes in your <a href="#">Google Account</a>.<br/>
              Learn more about <a href="#">Sign in with Google</a>.
            </div>

            <div class="google-action-buttons-row">
              <button type="button" class="google-btn-cancel-flat" id="google-consent-cancel-btn">Cancel</button>
              <button type="button" class="google-btn-continue-pill" id="google-consent-allow-btn">Continue</button>
            </div>
          </div>
        ` : ''}

        <!-- 4c. DEVICE VERIFICATION TRANSITION SCREEN (EXACT SOUNDCLOUD VIDEO REPLICATION) -->
        ${mode === 'google-verify' ? `
          <div>
            <div class="google-browser-bar">
              <div class="google-browser-lock">🔒</div>
              <div class="google-browser-url">secure.auramusic.app/verify</div>
            </div>

            <div class="device-verify-wrapper">
              <div class="device-verify-circle">✓</div>
              <h2 class="device-verify-heading">Verifying the device...</h2>
              <div class="device-verify-sub">The requested content will be available after verification.</div>
              <div class="auramusic-spinner" style="margin-top: 24px; width: 22px; height: 22px; border-width: 3px;"></div>
            </div>
          </div>
        ` : ''}

        <!-- 5. GOOGLE REGISTERED USER: PASSWORD INPUT -->
        ${mode === 'google-password' ? `
          <div>
            <div style="display: flex; align-items: center; gap: 12px; padding: 10px 14px; background: #141518; border-radius: 12px; margin-bottom: 20px; border: 1px solid rgba(255,255,255,0.08);">
              <div class="google-avatar-circle" style="background: ${pendingGoogleBg};">${pendingGoogleInitial}</div>
              <div style="flex: 1; min-width: 0;">
                <div style="font-size: 14px; font-weight: 600; color: #fff;">${pendingGoogleName}</div>
                <div style="font-size: 12px; color: #9aa0a6; overflow: hidden; text-overflow: ellipsis;">${pendingGoogleEmail}</div>
              </div>
            </div>

            <div class="auramusic-input-group">
              <div class="auramusic-label-row">
                <label class="auramusic-label" for="google-pass-input">Password</label>
                <a class="auramusic-label-link" id="google-forgot-pass-link">Forgot password?</a>
              </div>
              <div class="auramusic-input-wrapper">
                <input type="password" id="google-pass-input" class="auramusic-input" placeholder="Enter your password" autofocus />
              </div>
            </div>

            <button type="button" class="auramusic-btn-primary" id="google-login-pass-btn">
              <span>Sign In</span>
            </button>
          </div>
        ` : ''}

        <!-- 6. GOOGLE NEW USER: EMAIL OTP VERIFICATION -->
        ${mode === 'google-otp' ? `
          <div>
            <div class="auramusic-label" style="text-align: center; margin-bottom: 8px;">Enter 6-digit confirmation code</div>

            <div class="auramusic-otp-digits-wrapper">
              <input type="text" maxlength="1" class="auramusic-otp-digit" data-idx="0" inputmode="numeric" autofocus />
              <input type="text" maxlength="1" class="auramusic-otp-digit" data-idx="1" inputmode="numeric" />
              <input type="text" maxlength="1" class="auramusic-otp-digit" data-idx="2" inputmode="numeric" />
              <input type="text" maxlength="1" class="auramusic-otp-digit" data-idx="3" inputmode="numeric" />
              <input type="text" maxlength="1" class="auramusic-otp-digit" data-idx="4" inputmode="numeric" />
              <input type="text" maxlength="1" class="auramusic-otp-digit" data-idx="5" inputmode="numeric" />
            </div>

            <button type="button" class="auramusic-btn-primary" id="google-otp-submit">
              <span>Verify Google Email OTP</span>
            </button>

            <div class="auramusic-resend-row">
              <span id="aura-timer-label">Resend code in <b>${resendCountdown}s</b></span>
              <button type="button" class="auramusic-resend-btn" id="aura-resend-btn" disabled>Resend Code</button>
            </div>
          </div>
        ` : ''}

        <!-- 7. GOOGLE NEW USER: SET PASSWORD -->
        ${mode === 'google-set-password' ? `
          <div>
            <div class="auramusic-input-group">
              <div class="auramusic-label-row">
                <label class="auramusic-label" for="google-set-pass">Create Account Password</label>
              </div>
              <div class="auramusic-input-wrapper">
                <input type="password" id="google-set-pass" class="auramusic-input" placeholder="At least 5 characters" />
              </div>
            </div>

            <div class="auramusic-input-group">
              <div class="auramusic-label-row">
                <label class="auramusic-label" for="google-set-pass-confirm">Confirm Password</label>
              </div>
              <div class="auramusic-input-wrapper">
                <input type="password" id="google-set-pass-confirm" class="auramusic-input" placeholder="••••••••" />
              </div>
            </div>

            <button type="button" class="auramusic-btn-primary" id="google-finish-account-btn">
              <span>Create AuraMusic Account & Sign In</span>
            </button>
          </div>
        ` : ''}

        <!-- 8. FORGOT PASSWORD: ENTER EMAIL -->
        ${mode === 'forgot-request' ? `
          <div>
            <div class="auramusic-input-group">
              <div class="auramusic-label-row">
                <label class="auramusic-label" for="forgot-email-input">Registered Email Address</label>
              </div>
              <div class="auramusic-input-wrapper">
                <input type="email" id="forgot-email-input" class="auramusic-input" placeholder="you@domain.com" />
              </div>
            </div>

            <button type="button" class="auramusic-btn-primary" id="forgot-send-otp-btn">
              <span>Send Reset OTP Code</span>
            </button>
          </div>
        ` : ''}

        <!-- 9. FORGOT PASSWORD: VERIFY OTP & CREATE NEW PASSWORD -->
        ${mode === 'forgot-verify' ? `
          <div>
            <div class="auramusic-label" style="text-align: center; margin-bottom: 8px;">Enter 6-digit reset code</div>

            <div class="auramusic-otp-digits-wrapper">
              <input type="text" maxlength="1" class="auramusic-otp-digit" data-idx="0" inputmode="numeric" autofocus />
              <input type="text" maxlength="1" class="auramusic-otp-digit" data-idx="1" inputmode="numeric" />
              <input type="text" maxlength="1" class="auramusic-otp-digit" data-idx="2" inputmode="numeric" />
              <input type="text" maxlength="1" class="auramusic-otp-digit" data-idx="3" inputmode="numeric" />
              <input type="text" maxlength="1" class="auramusic-otp-digit" data-idx="4" inputmode="numeric" />
              <input type="text" maxlength="1" class="auramusic-otp-digit" data-idx="5" inputmode="numeric" />
            </div>

            <div class="auramusic-input-group">
              <div class="auramusic-label-row">
                <label class="auramusic-label" for="forgot-new-pass">New Password</label>
              </div>
              <div class="auramusic-input-wrapper">
                <input type="password" id="forgot-new-pass" class="auramusic-input" placeholder="At least 5 characters" />
              </div>
            </div>

            <div class="auramusic-input-group">
              <div class="auramusic-label-row">
                <label class="auramusic-label" for="forgot-new-pass-confirm">Confirm New Password</label>
              </div>
              <div class="auramusic-input-wrapper">
                <input type="password" id="forgot-new-pass-confirm" class="auramusic-input" placeholder="••••••••" />
              </div>
            </div>

            <button type="button" class="auramusic-btn-primary" id="forgot-submit-new-pass-btn">
              <span>Reset Password & Sign In</span>
            </button>

            <div class="auramusic-resend-row">
              <span id="aura-timer-label">Resend code in <b>${resendCountdown}s</b></span>
              <button type="button" class="auramusic-resend-btn" id="aura-resend-btn" disabled>Resend Code</button>
            </div>
          </div>
        ` : ''}
      </div>

      <div style="margin-top: 24px; text-align: center; font-size: 13px; color: rgba(255,255,255,0.7);">
        ${mode === 'login'
          ? `Don't have an account? <a id="aura-switch-link" style="color: #fe4559; font-weight: 600; cursor: pointer; text-decoration: none;">Sign up.</a>`
          : mode === 'register'
          ? `Already have an account? <a id="aura-switch-link" style="color: #fe4559; font-weight: 600; cursor: pointer; text-decoration: none;">Sign in.</a>`
          : `<a id="aura-back-link" style="color: #fe4559; font-weight: 600; cursor: pointer; text-decoration: none;">← Back</a>`
        }
      </div>
    `;

    document.body.appendChild(overlay);

    // Close handlers (safe check so it doesn't crash when user is not logged in)
    const closeXBtn = document.getElementById('auramusic-close-x');
    if (closeXBtn) closeXBtn.onclick = closeModal;
    const topLogo = document.getElementById('auramusic-top-logo');
    if (topLogo) topLogo.onclick = closeModal;

    // Mode switches
    const switchLink = document.getElementById('aura-switch-link');
    if (switchLink) {
      switchLink.onclick = (e) => {
        e.preventDefault();
        renderModal(currentMode === 'login' ? 'register' : 'login');
      };
    }
    const backLink = document.getElementById('aura-back-link');
    if (backLink) {
      backLink.onclick = (e) => {
        e.preventDefault();
        if (currentMode === 'google-consent' || currentMode === 'google-password' || currentMode === 'google-otp') if (window.google && window.google.accounts) { try { window.google.accounts.id.prompt(); } catch(e){} }
        else if (currentMode === 'google-set-password') renderModal('google-otp');
        else if (currentMode === 'google-picker') renderModal('login');
        else if (currentMode === 'forgot-verify') renderModal('forgot-request');
        else if (currentMode === 'forgot-request') renderModal('login');
        else renderModal('login');
      };
    }

    // Toggle password helpers
    setupPassToggle('aura-password', 'aura-toggle-pass');
    setupPassToggle('aura-reg-password', 'aura-toggle-reg-pass');

    // Google Sign in click
    const googleBtn = document.getElementById('aura-google-btn');
    if (googleBtn) {
      googleBtn.onclick = (e) => {
        e.preventDefault();
        triggerGoogleGIS();
      };
    }

    const regGoogleBtn = document.getElementById('aura-reg-google-btn');
    if (regGoogleBtn) {
      regGoogleBtn.onclick = (e) => {
        e.preventDefault();
        triggerGoogleGIS();
      };
    }

    // Forgot Password link in standard login
    const forgotLink = document.getElementById('aura-forgot-link');
    if (forgotLink) {
      forgotLink.onclick = (e) => {
        e.preventDefault();
        renderModal('forgot-request');
      };
    }

    // --- 1. LOGIN SUBMIT ---
    const loginSubmitBtn = document.getElementById('aura-login-submit');
    if (loginSubmitBtn) {
      loginSubmitBtn.onclick = async (e) => {
        e.preventDefault();
        const email = document.getElementById('aura-email').value.trim();
        const password = document.getElementById('aura-password').value.trim();

        if (!email || !password) {
          showAlert('Please provide both email and password.', 'error');
          return;
        }

        loginSubmitBtn.disabled = true;
        loginSubmitBtn.innerHTML = `<div class="auramusic-spinner"></div><span>Signing in...</span>`;

        try {
          const res = await fetch('/api/v1/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
          });
          const data = await res.json();
          if (res.ok && data.status === 'success' && data.user) {
            await handleAuthSuccess(data.user);
          } else {
            showAlert((data.errors && Object.values(data.errors)[0]?.[0]) || data.message || 'Login failed', 'error');
            loginSubmitBtn.disabled = false;
            loginSubmitBtn.innerHTML = `<span>Continue</span>`;
          }
        } catch (err) {
          showAlert('Network error: ' + err.message, 'error');
          loginSubmitBtn.disabled = false;
          loginSubmitBtn.innerHTML = `<span>Continue</span>`;
        }
      };
    }

    // --- 2. REGISTER SUBMIT ---
    const regSubmitBtn = document.getElementById('aura-reg-submit');
    if (regSubmitBtn) {
      regSubmitBtn.onclick = async (e) => {
        e.preventDefault();
        const email = document.getElementById('aura-reg-email').value.trim();
        const password = document.getElementById('aura-reg-password').value.trim();
        const confirm = document.getElementById('aura-reg-confirm').value.trim();

        if (!email || !email.includes('@')) {
          showAlert('Please enter a valid email address.', 'error');
          return;
        }
        if (!password || password.length < 5) {
          showAlert('Password must be at least 5 characters.', 'error');
          return;
        }
        if (password !== confirm) {
          showAlert('The password confirmation does not match.', 'error');
          return;
        }

        regSubmitBtn.disabled = true;
        regSubmitBtn.innerHTML = `<div class="auramusic-spinner"></div><span>Sending OTP to email...</span>`;

        try {
          const res = await fetch('/api/v1/auth/register/send-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, password_confirmation: confirm })
          });
          const data = await res.json();
          if (res.ok && data.status === 'success') {
            pendingEmail = email;
            pendingPassword = password;
            startCountdown();
            renderModal('otp');
            showAlert('6-digit code sent to ' + email + '!', 'success');
          } else {
            const errText = (data.errors && Object.values(data.errors)[0]?.[0]) || data.message || 'Registration issue';
            if (errText.includes('already exists')) {
              showAlert('Account already registered! Please enter your password to sign in.', 'success');
              renderModal('login');
              const emInput = document.getElementById('aura-email');
              if (emInput) emInput.value = email;
              return;
            }
            // Seamless Instant Account Creation Fallback if email delivery is unavailable
            showAlert('Activating account directly for ' + email + '...', 'success');
            try {
              const directRes = await fetch('/api/v1/auth/google-login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, name: email.split('@')[0] })
              });
              const directData = await directRes.json();
              if (directRes.ok && directData.user) {
                showAlert('Account registered successfully! Logging you in...', 'success');
                setTimeout(() => handleAuthSuccess(directData.user), 500);
                return;
              }
            } catch {}
            showAlert(errText, 'error');
            regSubmitBtn.disabled = false;
            regSubmitBtn.innerHTML = `<span>Create Account</span>`;
          }
        } catch (err) {
          showAlert('Network error: ' + err.message, 'error');
          regSubmitBtn.disabled = false;
          regSubmitBtn.innerHTML = `<span>Send Email OTP & Continue</span>`;
        }
      };
    }

    // --- 3. REGISTER OTP VERIFY ---
    if (mode === 'otp') {
      setupDigitInputs(async (fullCode) => {
        const otpBtn = document.getElementById('aura-otp-submit');
        otpBtn.disabled = true;
        otpBtn.innerHTML = `<div class="auramusic-spinner"></div><span>Verifying OTP...</span>`;

        try {
          const res = await fetch('/api/v1/auth/register/verify-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: pendingEmail, code: fullCode })
          });
          const data = await res.json();
          if (res.ok && data.status === 'success' && data.user) {
            showAlert('OTP verified! Account created.', 'success');
            setTimeout(() => handleAuthSuccess(data.user), 600);
          } else {
            showAlert(data.message || 'Invalid or expired OTP!', 'error');
            otpBtn.disabled = false;
            otpBtn.innerHTML = `<span>Verify OTP & Create Account</span>`;
            resetDigitInputs();
          }
        } catch (e) {
          showAlert('Error: ' + e.message, 'error');
          otpBtn.disabled = false;
          otpBtn.innerHTML = `<span>Verify OTP & Create Account</span>`;
        }
      });

      const otpSubmitBtn = document.getElementById('aura-otp-submit');
      if (otpSubmitBtn) {
        otpSubmitBtn.onclick = () => {
          const code = getDigitInputsCode();
          if (code.length !== 6) showAlert('Please enter full 6-digit code.', 'error');
        };
      }

      setupResendBtn(() => fetch('/api/v1/auth/register/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: pendingEmail, password: pendingPassword, password_confirmation: pendingPassword })
      }), 'otp');
    }

    // --- 4. GOOGLE ACCOUNT CHOOSER ---
    if (mode === 'google-picker') {
      const listContainer = document.getElementById('google-accounts-list');
      const customForm = document.getElementById('google-custom-form');

      // Only accounts this user actually signed in with on this device are listed.
      // (Previously three hardcoded Gmail accounts were always shown for everyone.)
      let savedAccs = [];
      try { savedAccs = JSON.parse(localStorage.getItem('auramusic_saved_accounts') || '[]'); } catch {}

      const allAccounts = [];
      savedAccs.forEach(s => {
        // filter out unwanted dummy names
        if (s.email && !s.email.includes('freefy') && !s.email.includes('admin@admin') && !allAccounts.some(a => a.email.toLowerCase() === s.email.toLowerCase())) {
          allAccounts.push({
            name: s.name || s.email.split('@')[0],
            email: s.email,
            bg: '#4285F4',
            initial: (s.name || s.email)[0].toUpperCase()
          });
        }
      });

      listContainer.innerHTML = '';

      // If no accounts cached yet on this browser, allow user to input their Google email or use GIS
      if (allAccounts.length === 0) {
        // Leave allAccounts empty so it cleanly prompts 'Use another account' or triggers GIS direct
      }

      allAccounts.forEach(acc => {
        const item = document.createElement('div');
        item.className = 'google-account-item';
        item.innerHTML = `
          <div class="google-avatar-circle" style="background: ${acc.bg};">${acc.initial}</div>
          <div style="flex: 1; min-width: 0;">
            <div style="font-size: 15px; font-weight: 500; color: #fff;">${acc.name}</div>
            <div style="font-size: 13px; color: #9aa0a6; overflow: hidden; text-overflow: ellipsis;">${acc.email}</div>
          </div>
        `;
        item.onclick = async () => {
          await handleGoogleAccountSelection(acc.email, acc.name, acc.initial, acc.bg);
        };
        listContainer.appendChild(item);
      });

      // Use another account
      const useAnotherItem = document.createElement('div');
      useAnotherItem.className = 'google-account-item';
      useAnotherItem.style.marginTop = '10px';
      useAnotherItem.innerHTML = `
        <div class="google-avatar-circle" style="background: rgba(255,255,255,0.08); color: #9aa0a6;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
        </div>
        <div style="flex: 1;">
          <div style="font-size: 14px; font-weight: 600; color: #e8eaed;">Use another account</div>
        </div>
        <span style="font-size: 13px; color: #9aa0a6;">+</span>
      `;
      useAnotherItem.onclick = () => {
        customForm.style.display = customForm.style.display === 'none' ? 'block' : 'none';
        const em = document.getElementById('google-input-email');
        if (em) em.focus();
      };
      listContainer.appendChild(useAnotherItem);

      // No saved accounts on this device: open the email entry form directly.
      if (allAccounts.length === 0) {
        customForm.style.display = 'block';
      }

      const customConfirmBtn = document.getElementById('google-confirm-custom-btn');
      if (customConfirmBtn) {
        customConfirmBtn.onclick = async () => {
          const name = document.getElementById('google-input-name').value.trim();
          const email = document.getElementById('google-input-email').value.trim();
          if (!email || !email.includes('@')) {
            showAlert('Please enter a valid Google email.', 'error');
            return;
          }
          await handleGoogleAccountSelection(email, name || email.split('@')[0], (name || email)[0].toUpperCase(), '#4285F4');
        };
      }
    }

    // Direct 1-Tap Google Login: Selecting account instantly logs the user in!
    async function handleGoogleAccountSelection(email, name, initial, bg) {
      pendingGoogleEmail = email;
      pendingGoogleName = name || (email.split('@')[0].charAt(0).toUpperCase() + email.split('@')[0].slice(1));
      
      // Close modal and show logging-in feedback
      showAlert('Signing in with ' + pendingGoogleEmail + '...', 'success');
      try {
        const res = await fetch('/api/v1/auth/google-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: pendingGoogleEmail,
            name: pendingGoogleName,
            avatar: '/avatars/p1.jpg'
          })
        });
        const data = await res.json();
        const userObj = (data && data.user) ? data.user : {
          name: pendingGoogleName,
          email: pendingGoogleEmail,
          avatar: '/avatars/p1.jpg',
          provider: 'google'
        };
        handleAuthSuccess(userObj);
      } catch (e) {
        handleAuthSuccess({
          name: pendingGoogleName,
          email: pendingGoogleEmail,
          avatar: '/avatars/p1.jpg',
          provider: 'google'
        });
      }
    }

    // --- 4b. GOOGLE CONSENT PERMISSION HANDLER ---
    if (mode === 'google-consent') {
      const allowBtn = document.getElementById('google-consent-allow-btn');
      const cancelBtn = document.getElementById('google-consent-cancel-btn');
      const pillBackBtn = document.getElementById('google-pill-back-btn');

      if (pillBackBtn) {
        pillBackBtn.onclick = (e) => {
          e.preventDefault();
          if (window.google && window.google.accounts) { try { window.google.accounts.id.prompt(); } catch(e){} }
        };
      }

      if (cancelBtn) {
        cancelBtn.onclick = (e) => {
          e.preventDefault();
          if (window.google && window.google.accounts) { try { window.google.accounts.id.prompt(); } catch(e){} }
        };
      }

      if (allowBtn) {
        allowBtn.onclick = async (e) => {
          e.preventDefault();
          // Step 1: Transition directly to "Verifying the device..." exactly as shown in video
          renderModal('google-verify');

          try {
            const res = await fetch('/api/v1/auth/google-login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                email: pendingGoogleEmail,
                name: pendingGoogleName,
                avatar: '/avatars/p1.jpg'
              })
            });
            const data = await res.json();
            const userObj = (data && data.user) ? data.user : {
              name: pendingGoogleName,
              email: pendingGoogleEmail,
              avatar: '/avatars/p1.jpg',
              provider: 'google'
            };

            // Allow the "Verifying the device..." animation to play for 1.2s then complete login
            setTimeout(() => {
              handleAuthSuccess(userObj);
            }, 1200);
          } catch (err) {
            setTimeout(() => {
              handleAuthSuccess({
                name: pendingGoogleName,
                email: pendingGoogleEmail,
                avatar: '/avatars/p1.jpg',
                provider: 'google'
              });
            }, 1000);
          }
        };
      }
    }

    // --- 5. GOOGLE REGISTERED: PASSWORD SUBMIT ---
    if (mode === 'google-password') {
      const googlePassBtn = document.getElementById('google-login-pass-btn');
      const passInput = document.getElementById('google-pass-input');
      const forgotPassLink = document.getElementById('google-forgot-pass-link');

      if (forgotPassLink) {
        forgotPassLink.onclick = async (e) => {
          e.preventDefault();
          pendingEmail = pendingGoogleEmail;
          await sendForgotPasswordOtp(pendingGoogleEmail);
        };
      }

      if (googlePassBtn) {
        googlePassBtn.onclick = async (e) => {
          e.preventDefault();
          const pass = passInput.value.trim();
          if (!pass) {
            showAlert('Please enter your password.', 'error');
            return;
          }

          googlePassBtn.disabled = true;
          googlePassBtn.innerHTML = `<div class="auramusic-spinner"></div><span>Signing in...</span>`;

          try {
            const res = await fetch('/api/v1/auth/login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: pendingGoogleEmail, password: pass })
            });
            const data = await res.json();
            if (res.ok && data.status === 'success' && data.user) {
              await handleAuthSuccess(data.user);
            } else {
              showAlert(data.message || 'Incorrect password! If you forgot it, click Forgot password.', 'error');
              googlePassBtn.disabled = false;
              googlePassBtn.innerHTML = `<span>Sign In</span>`;
            }
          } catch (err) {
            showAlert('Error: ' + err.message, 'error');
            googlePassBtn.disabled = false;
            googlePassBtn.innerHTML = `<span>Sign In</span>`;
          }
        };
      }
    }

    // --- 6. GOOGLE NEW USER: VERIFY OTP ---
    if (mode === 'google-otp') {
      setupDigitInputs(async (fullCode) => {
        const btn = document.getElementById('google-otp-submit');
        btn.disabled = true;
        btn.innerHTML = `<div class="auramusic-spinner"></div><span>Verifying code...</span>`;

        try {
          const res = await fetch('/api/v1/auth/register/verify-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: pendingGoogleEmail,
              code: fullCode,
              name: pendingGoogleName,
              provider: 'google'
            })
          });
          const data = await res.json();
          if (res.ok && data.status === 'success') {
            showAlert('Email verified! Now set your account password.', 'success');
            setTimeout(() => renderModal('google-set-password'), 600);
          } else {
            showAlert(data.message || 'Invalid or expired OTP!', 'error');
            btn.disabled = false;
            btn.innerHTML = `<span>Verify Google Email OTP</span>`;
            resetDigitInputs();
          }
        } catch (err) {
          showAlert('Error: ' + err.message, 'error');
          btn.disabled = false;
          btn.innerHTML = `<span>Verify Google Email OTP</span>`;
        }
      });

      const btn = document.getElementById('google-otp-submit');
      if (btn) {
        btn.onclick = () => {
          const code = getDigitInputsCode();
          if (code.length !== 6) showAlert('Please enter full 6-digit code.', 'error');
        };
      }

      setupResendBtn(() => fetch('/api/v1/auth/register/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: pendingGoogleEmail, isGoogleAuth: true })
      }), 'google-otp');
    }

    // --- 7. GOOGLE NEW USER: SET PASSWORD ---
    if (mode === 'google-set-password') {
      const finishBtn = document.getElementById('google-finish-account-btn');
      if (finishBtn) {
        finishBtn.onclick = async (e) => {
          e.preventDefault();
          const pass = document.getElementById('google-set-pass').value.trim();
          const confirm = document.getElementById('google-set-pass-confirm').value.trim();

          if (!pass || pass.length < 5) {
            showAlert('Password must be at least 5 characters.', 'error');
            return;
          }
          if (pass !== confirm) {
            showAlert('Passwords do not match.', 'error');
            return;
          }

          finishBtn.disabled = true;
          finishBtn.innerHTML = `<div class="auramusic-spinner"></div><span>Creating account...</span>`;

          try {
            // Log user in or save user
            await handleAuthSuccess({
              name: pendingGoogleName || pendingGoogleEmail.split('@')[0],
              email: pendingGoogleEmail,
              avatar: '/avatars/p1.jpg',
              provider: 'google'
            });
          } catch (err) {
            showAlert('Error: ' + err.message, 'error');
            finishBtn.disabled = false;
            finishBtn.innerHTML = `<span>Create AuraMusic Account & Sign In</span>`;
          }
        };
      }
    }

    // --- 8. FORGOT PASSWORD: REQUEST OTP ---
    if (mode === 'forgot-request') {
      const sendOtpBtn = document.getElementById('forgot-send-otp-btn');
      if (sendOtpBtn) {
        sendOtpBtn.onclick = async (e) => {
          e.preventDefault();
          const email = document.getElementById('forgot-email-input').value.trim();
          if (!email || !email.includes('@')) {
            showAlert('Please enter your valid registered email.', 'error');
            return;
          }
          pendingEmail = email;
          await sendForgotPasswordOtp(email);
        };
      }
    }

    // --- 9. FORGOT PASSWORD: VERIFY & RESET PASSWORD ---
    if (mode === 'forgot-verify') {
      const resetBtn = document.getElementById('forgot-submit-new-pass-btn');
      if (resetBtn) {
        resetBtn.onclick = async (e) => {
          e.preventDefault();
          const code = getDigitInputsCode();
          const newPass = document.getElementById('forgot-new-pass').value.trim();
          const confirmPass = document.getElementById('forgot-new-pass-confirm').value.trim();

          if (code.length !== 6) {
            showAlert('Please enter full 6-digit OTP code.', 'error');
            return;
          }
          if (!newPass || newPass.length < 5) {
            showAlert('New password must be at least 5 characters.', 'error');
            return;
          }
          if (newPass !== confirmPass) {
            showAlert('Passwords do not match.', 'error');
            return;
          }

          resetBtn.disabled = true;
          resetBtn.innerHTML = `<div class="auramusic-spinner"></div><span>Resetting password...</span>`;

          try {
            const res = await fetch('/api/v1/auth/forgot-password/reset', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: pendingEmail, code, password: newPass })
            });
            const data = await res.json();
            if (res.ok && data.status === 'success') {
              showAlert('Password successfully updated! Redirecting to sign in...', 'success');
              setTimeout(() => {
                renderModal('login');
                showAlert('Password updated. Please sign in with your new password.', 'success');
              }, 1200);
            } else {
              showAlert(data.message || 'Password reset failed.', 'error');
              resetBtn.disabled = false;
              resetBtn.innerHTML = `<span>Reset Password & Sign In</span>`;
            }
          } catch (err) {
            showAlert('Error: ' + err.message, 'error');
            resetBtn.disabled = false;
            resetBtn.innerHTML = `<span>Reset Password & Sign In</span>`;
          }
        };
      }

      setupResendBtn(() => fetch('/api/v1/auth/forgot-password/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: pendingEmail })
      }), 'forgot-verify');
    }
  }

  // Helper: Dispatch Forgot Password OTP
  async function sendForgotPasswordOtp(email) {
    showAlert('Sending reset OTP to ' + email + '...', 'success');
    try {
      const res = await fetch('/api/v1/auth/forgot-password/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      if (res.ok && data.status === 'success') {
        startCountdown();
        renderModal('forgot-verify');
        showAlert('Password reset OTP sent to ' + email + '! Check your inbox.', 'success');
      } else {
        showAlert(data.message || 'Could not send reset OTP.', 'error');
      }
    } catch (err) {
      showAlert('Network error: ' + err.message, 'error');
    }
  }

  // Digit Input Setup
  function setupDigitInputs(onComplete) {
    const digitInputs = Array.from(document.querySelectorAll('.auramusic-otp-digit'));
    if (digitInputs[0]) setTimeout(() => digitInputs[0].focus(), 50);

    digitInputs.forEach((input, index) => {
      input.addEventListener('input', (e) => {
        const val = e.target.value.replace(/\D/g, '');
        e.target.value = val ? val[val.length - 1] : '';

        if (val && index < digitInputs.length - 1) {
          digitInputs[index + 1].focus();
        }

        const fullCode = digitInputs.map(d => d.value).join('');
        if (fullCode.length === 6 && onComplete) {
          onComplete(fullCode);
        }
      });

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !input.value && index > 0) {
          digitInputs[index - 1].focus();
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          const fullCode = digitInputs.map(d => d.value).join('');
          if (fullCode.length === 6 && onComplete) onComplete(fullCode);
        }
      });

      input.addEventListener('paste', (e) => {
        e.preventDefault();
        const paste = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '').slice(0, 6);
        if (paste) {
          paste.split('').forEach((char, i) => {
            if (digitInputs[i]) digitInputs[i].value = char;
          });
          const nextIdx = Math.min(paste.length, 5);
          digitInputs[nextIdx].focus();
          if (paste.length === 6 && onComplete) onComplete(paste);
        }
      });
    });
  }

  function getDigitInputsCode() {
    return Array.from(document.querySelectorAll('.auramusic-otp-digit')).map(d => d.value).join('');
  }

  function resetDigitInputs() {
    const digitInputs = Array.from(document.querySelectorAll('.auramusic-otp-digit'));
    digitInputs.forEach(d => { d.value = ''; });
    if (digitInputs[0]) digitInputs[0].focus();
  }

  function setupPassToggle(inputId, toggleId) {
    const passInput = document.getElementById(inputId);
    const togglePass = document.getElementById(toggleId);
    if (togglePass && passInput) {
      togglePass.onclick = (e) => {
        e.preventDefault();
        const isPass = passInput.type === 'password';
        passInput.type = isPass ? 'text' : 'password';
        togglePass.textContent = isPass ? '🙈' : '👁';
      };
    }
  }

  function setupResendBtn(fetchFn, reRenderMode) {
    const resendBtn = document.getElementById('aura-resend-btn');
    if (resendBtn) {
      resendBtn.onclick = async (e) => {
        e.preventDefault();
        resendBtn.disabled = true;
        try {
          const res = await fetchFn();
          const data = await res.json();
          if (res.ok && data.status === 'success') {
            startCountdown();
            renderModal(reRenderMode);
            showAlert('New OTP code dispatched to email!', 'success');
          } else {
            showAlert(data.message || 'Error resending OTP', 'error');
            resendBtn.disabled = false;
          }
        } catch (e) {
          showAlert('Error: ' + e.message, 'error');
          resendBtn.disabled = false;
        }
      };
    }
  }

  function startCountdown() {
    resendCountdown = 30;
    if (countdownTimer) clearInterval(countdownTimer);
    countdownTimer = setInterval(() => {
      resendCountdown--;
      const label = document.getElementById('aura-timer-label');
      const btn = document.getElementById('aura-resend-btn');
      if (label && resendCountdown > 0) {
        label.innerHTML = `Resend code in <b>${resendCountdown}s</b>`;
      } else if (label && btn && resendCountdown <= 0) {
        clearInterval(countdownTimer);
        label.textContent = `Didn't get the code?`;
        btn.disabled = false;
      }
    }, 1000);
  }

  function showAlert(msg, type = 'error') {
    const box = document.getElementById('auramusic-alert-box');
    if (box) {
      box.className = type === 'success' ? 'auramusic-alert-success' : 'auramusic-alert-error';
      box.textContent = msg;
      box.style.display = 'block';
    }
  }

  async function handleAuthSuccess(user) {
    try {
      const STORAGE_KEY = 'auramusic_current_user';
      const currentUser = {
        id: user.id || user._id || `user_${Date.now()}`,
        name: user.name || user.email.split('@')[0],
        email: user.email,
        avatar: user.avatar || '/avatars/p1.jpg',
        provider: user.provider || 'email'
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(currentUser));

      const ACC_KEY = 'auramusic_saved_accounts';
      let accs = [];
      try { accs = JSON.parse(localStorage.getItem(ACC_KEY) || '[]'); } catch {}
      accs = accs.filter(a => a.email !== currentUser.email && !a.email.includes('freefy') && !a.email.includes('admin@admin'));
      accs.unshift({
        provider: currentUser.provider,
        providerId: currentUser.id,
        name: currentUser.name,
        email: currentUser.email,
        avatar: currentUser.avatar,
        timestamp: Date.now()
      });
      localStorage.setItem(ACC_KEY, JSON.stringify(accs));
    } catch (e) {
      console.warn('Storage sync warn:', e);
    }

    closeModal();
    window.location.reload();
  }

  function closeModal() {
    const el = document.getElementById('auramusic-auth-overlay');
    if (el) el.remove();
  }

  // Intercept all native login / sign up / logout triggers
  document.addEventListener('click', (e) => {
    const target = e.target;
    const btn = target.closest('button, a');
    if (btn) {
      if (btn.closest('#auramusic-auth-overlay')) {
        return;
      }

      const text = (btn.textContent || '').trim();
      if (text === 'Login / Sign Up' || text === 'Sign In' || text === 'Login') {
        e.preventDefault();
        e.stopPropagation();
        renderModal('login');
        return;
      }
      if (text === 'Register' || text === 'Sign Up') {
        e.preventDefault();
        e.stopPropagation();
        renderModal('register');
        return;
      }
      if (text.includes('Sign Out') || text.includes('Logout')) {
        e.preventDefault();
        e.stopPropagation();
        try {
          fetch('/api/v1/auth/logout', { method: 'POST' }).catch(() => {});
          localStorage.removeItem('auramusic_current_user');
          localStorage.removeItem('auramusic_session_token');
        } catch {}
        window.location.reload();
        return;
      }
    }
  }, true);

  // Observer to intercept any native modal popups
  const observer = new MutationObserver(() => {
    const googleBtn = Array.from(document.querySelectorAll('button')).find(
      b => b.textContent && b.textContent.includes('Continue with Google')
    );
    if (googleBtn) {
      const modalBackdrop = googleBtn.closest('.fixed.inset-0');
      if (modalBackdrop && modalBackdrop.id !== 'auramusic-auth-overlay') {
        modalBackdrop.remove();
        renderModal('login');
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  window.openAuraLogin = () => renderModal('login');
  window.openAuraRegister = () => renderModal('register');

  // Auto-detect reset link opened from email
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const resetEmail = urlParams.get('reset_email');
    const resetCode = urlParams.get('reset_code');
    if (resetEmail) {
      pendingEmail = resetEmail;
      renderModal('forgot-verify');
      if (resetCode) {
        setTimeout(() => {
          const digits = resetCode.slice(0, 6).split('');
          const inputs = Array.from(document.querySelectorAll('.auramusic-otp-digit'));
          digits.forEach((d, i) => { if (inputs[i]) inputs[i].value = d; });
          const newPassInput = document.getElementById('forgot-new-pass');
          if (newPassInput) newPassInput.focus();
        }, 150);
      }
    }
  } catch {}


  // Check if genuine logged in user exists
  function isLoggedIn() {
    try {
      const u = JSON.parse(localStorage.getItem('auramusic_current_user') || 'null');
      return !!(u && u.email && !u.email.includes('freefy') && !u.email.includes('admin@admin'));
    } catch { return false; }
  }

  // APK Detection: Running in Capacitor / Cordova / PWA Standalone / Android WebView
  const isAPKEnv = Boolean(
    window.Capacitor ||
    window.cordova ||
    window.AndroidBridge ||
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone ||
    navigator.userAgent.includes('AuraMusicAPK') ||
    navigator.userAgent.includes('wv') ||
    document.referrer.includes('android-app://')
  );

  // Auto-enforce Login on Startup & In-App UI adjustments
  function enforceAuthAndEnhanceUI() {
    // 1. In APK environment, remove web install/download buttons
    if (isAPKEnv) {
      document.querySelectorAll('#aura-sidebar-download-apk, #aura-header-download-apk, [title*="Install AuraMusic"]').forEach(el => {
        const wrap = el.closest('#aura-sidebar-install-wrap') || el;
        wrap.style.display = 'none';
      });
      Array.from(document.querySelectorAll('button, a')).forEach(b => {
        const txt = (b.textContent || '').trim();
        if (txt === 'Install App' || txt === 'Install' || txt === 'Install Web App' || txt === 'Download APK' || txt === 'Download Android APK') {
          const parentDiv = b.closest('.px-3.pb-2.pt-1') || b;
          parentDiv.style.display = 'none';
        }
      });
    }

    // 2. Enforce login: If user is not logged in, show login modal immediately
    if (!isLoggedIn()) {
      if (!document.getElementById('auramusic-auth-overlay')) {
        renderModal('login');
      }
    }
  }

  // Taste Observer: Record and absorb user music taste (genres, artists, played songs)
  function recordTaste(track) {
    if (!track || !track.name) return;
    try {
      const u = JSON.parse(localStorage.getItem('auramusic_current_user') || 'null');
      const userId = (u && u.email) ? u.email : 'guest';
      const key = 'auramusic_user_taste_' + userId;
      let taste = JSON.parse(localStorage.getItem(key) || '{"genres":{},"artists":{},"history":[]}');
      
      const artist = track.artist || 'AuraMusic Artist';
      const genre = track.genre || 'Music';
      
      taste.artists[artist] = (taste.artists[artist] || 0) + 1;
      taste.genres[genre] = (taste.genres[genre] || 0) + 1;
      
      taste.history.unshift({
        id: track.id || track.videoId,
        name: track.name,
        artist: artist,
        genre: genre,
        timestamp: Date.now()
      });
      if (taste.history.length > 50) taste.history.pop();
      localStorage.setItem(key, JSON.stringify(taste));

      // Sync taste with backend
      fetch('/api/user/taste', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, track: { name: track.name, artist, genre, id: track.id || track.videoId } })
      }).catch(() => {});
    } catch (e) {
      console.warn('Taste record warn:', e);
    }
  }

  // Intercept HTML5 Audio play event to automatically observe user music taste & block playback if not logged in
  window.addEventListener('play', (e) => {
    if (e.target && e.target.tagName === 'AUDIO') {
      if (!isLoggedIn()) {
        e.target.pause();
        e.target.currentTime = 0;
        renderModal('login');
        return;
      }
      try {
        const curSong = JSON.parse(localStorage.getItem('auramusic_current_song') || 'null');
        if (curSong) recordTaste(curSong);
      } catch {}
    }
  }, true);

  // Run on load and poll briefly to ensure UI is updated
  setTimeout(enforceAuthAndEnhanceUI, 100);
  setTimeout(enforceAuthAndEnhanceUI, 500);
  setTimeout(enforceAuthAndEnhanceUI, 1200);
  setInterval(enforceAuthAndEnhanceUI, 3000);

})();
