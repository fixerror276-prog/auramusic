// auramusic: REA OTP Authentication Modal Extension
(function() {
  // Inject OTP styles
  const style = document.createElement('style');
  style.id = 'aura-otp-styles';
  style.textContent = `
    .aura-otp-overlay {
      position: fixed;
      inset: 0;
      z-index: 99999;
      background: rgba(0, 0, 0, 0.82);
      backdrop-filter: blur(12px);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
      animation: auraFadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @keyframes auraFadeIn {
      from { opacity: 0; transform: scale(0.96); }
      to { opacity: 1; transform: scale(1); }
    }
    .aura-otp-card {
      position: relative;
      width: 100%;
      max-width: 440px;
      background: #111422;
      border: 1px solid rgba(16, 185, 129, 0.3);
      box-shadow: 0 25px 60px -15px rgba(0,0,0,0.7), 0 0 40px rgba(16, 185, 129, 0.15);
      border-radius: 28px;
      padding: 32px 28px;
      color: #fff;
    }
    .aura-otp-title {
      font-size: 22px;
      font-weight: 800;
      color: #fff;
      display: flex;
      align-items: center;
      gap: 10px;
      letter-spacing: -0.02em;
    }
    .aura-otp-badge {
      font-size: 11px;
      font-weight: 700;
      padding: 3px 8px;
      border-radius: 999px;
      background: rgba(16, 185, 129, 0.15);
      border: 1px solid rgba(16, 185, 129, 0.3);
      color: #34d399;
    }
    .aura-otp-input {
      width: 100%;
      padding: 14px 16px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 16px;
      color: #fff;
      font-size: 14px;
      outline: none;
      transition: all 0.2s ease;
      box-sizing: border-box;
    }
    .aura-otp-input:focus {
      border-color: #10b981;
      background: rgba(16, 185, 129, 0.08);
      box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.2);
    }
    .aura-otp-code-input {
      width: 100%;
      text-align: center;
      font-size: 26px;
      font-weight: 800;
      letter-spacing: 0.35em;
      padding: 12px;
      border-radius: 16px;
      background: rgba(0, 0, 0, 0.4);
      border: 1px solid rgba(16, 185, 129, 0.4);
      color: #34d399;
      outline: none;
      box-sizing: border-box;
    }
    .aura-otp-btn {
      width: 100%;
      padding: 14px;
      border-radius: 16px;
      font-weight: 700;
      font-size: 14px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      border: none;
      box-sizing: border-box;
    }
    .aura-otp-btn-primary {
      background: linear-gradient(135deg, #10b981, #059669);
      color: #000;
      font-weight: 800;
      box-shadow: 0 10px 25px -5px rgba(16, 185, 129, 0.4);
    }
    .aura-otp-btn-primary:hover {
      background: linear-gradient(135deg, #34d399, #10b981);
      transform: translateY(-1px);
    }
    .aura-otp-btn-secondary {
      background: rgba(255, 255, 255, 0.06);
      color: #94a3b8;
      border: 1px solid rgba(255, 255, 255, 0.1);
    }
    .aura-otp-btn-secondary:hover {
      background: rgba(255, 255, 255, 0.12);
      color: #fff;
    }
    .aura-otp-banner {
      background: rgba(16, 185, 129, 0.12);
      border: 1px solid rgba(16, 185, 129, 0.3);
      padding: 12px 14px;
      border-radius: 14px;
      font-size: 12px;
      color: #a7f3d0;
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 16px;
    }
    .aura-otp-error {
      background: rgba(239, 68, 68, 0.15);
      border: 1px solid rgba(239, 68, 68, 0.3);
      padding: 10px 14px;
      border-radius: 12px;
      font-size: 12px;
      color: #fca5a5;
      margin-top: 10px;
    }
  `;
  document.head.appendChild(style);

  let currentStep = 'init'; // 'init' | 'otp'
  let userEmail = '';
  let userName = '';
  let demoOtp = '';

  function openOtpModal() {
    closeExistingModal();

    const overlay = document.createElement('div');
    overlay.id = 'aura-otp-modal-root';
    overlay.className = 'aura-otp-overlay';

    overlay.innerHTML = `
      <div class="aura-otp-card" id="aura-otp-card" onclick="event.stopPropagation()">
        <button id="aura-otp-close-btn" style="position: absolute; top: 20px; right: 20px; background: rgba(255,255,255,0.08); border: none; color: #94a3b8; width: 32px; height: 32px; border-radius: 50%; font-size: 16px; cursor: pointer; display: flex; align-items: center; justify-content: center;">✕</button>
        
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 6px;">
          <div style="width: 36px; height: 36px; border-radius: 12px; background: rgba(16,185,129,0.15); border: 1px solid rgba(16,185,129,0.3); display: flex; align-items: center; justify-content: center; font-size: 18px;">🔐</div>
          <div>
            <div class="aura-otp-title">
              Create Account
              <span class="aura-otp-badge">OTP VERIFIED</span>
            </div>
            <div style="font-size: 12px; color: #94a3b8; margin-top: 2px;">Fast, secure 1-click verification with OTP</div>
          </div>
        </div>

        <div id="aura-otp-body" style="margin-top: 24px;">
          <!-- Step 1: Enter details -->
          <div id="aura-otp-step-1">
            <div style="margin-bottom: 16px;">
              <label style="display: block; font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">Your Name</label>
              <input type="text" id="aura-otp-name" class="aura-otp-input" placeholder="e.g. Pankaj Kumar" value="" />
            </div>

            <div style="margin-bottom: 20px;">
              <label style="display: block; font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">Email Address</label>
              <input type="email" id="aura-otp-email" class="aura-otp-input" placeholder="you@domain.com" value="" />
            </div>

            <div id="aura-otp-err-1" class="aura-otp-error" style="display: none; margin-bottom: 16px;"></div>

            <button id="aura-otp-send-btn" class="aura-otp-btn aura-otp-btn-primary">
              <span>Send Verification OTP</span>
              <span>→</span>
            </button>
          </div>

          <!-- Step 2: Enter OTP -->
          <div id="aura-otp-step-2" style="display: none;">
            <div class="aura-otp-banner" id="aura-otp-demo-banner">
              <span style="font-size: 18px;">📩</span>
              <div>
                <div>OTP sent to <b id="aura-otp-target-email"></b></div>
                <div style="margin-top: 3px; font-size: 11px; color: #34d399;">Your test OTP code is: <b id="aura-otp-code-hint" style="font-size: 14px; letter-spacing: 0.1em; background: rgba(0,0,0,0.3); padding: 2px 6px; border-radius: 6px;"></b></div>
              </div>
            </div>

            <div style="margin-bottom: 20px;">
              <label style="display: block; font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; text-align: center;">Enter 6-Digit Verification Code</label>
              <input type="text" maxlength="6" id="aura-otp-code" class="aura-otp-code-input" placeholder="••••••" />
            </div>

            <div id="aura-otp-err-2" class="aura-otp-error" style="display: none; margin-bottom: 16px;"></div>

            <button id="aura-otp-verify-btn" class="aura-otp-btn aura-otp-btn-primary" style="margin-bottom: 12px;">
              <span>Verify & Complete Sign Up</span>
              <span>✓</span>
            </button>

            <button id="aura-otp-resend-btn" class="aura-otp-btn aura-otp-btn-secondary">
              <span>Resend Code</span>
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    overlay.onclick = closeExistingModal;
    document.getElementById('aura-otp-close-btn').onclick = closeExistingModal;

    // Step 1 handler
    const sendBtn = document.getElementById('aura-otp-send-btn');
    sendBtn.onclick = async () => {
      const name = document.getElementById('aura-otp-name').value.trim();
      const email = document.getElementById('aura-otp-email').value.trim();
      const errBox = document.getElementById('aura-otp-err-1');

      if (!name || !email) {
        errBox.textContent = 'Please provide both your name and a valid email address.';
        errBox.style.display = 'block';
        return;
      }

      sendBtn.disabled = true;
      sendBtn.innerHTML = '<span>Generating OTP...</span>';

      try {
        const res = await fetch('/api/auth/otp/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, name })
        });
        const data = await res.json();

        if (data.success) {
          userEmail = email;
          userName = name;
          demoOtp = data.otp;

          document.getElementById('aura-otp-step-1').style.display = 'none';
          document.getElementById('aura-otp-step-2').style.display = 'block';
          document.getElementById('aura-otp-target-email').textContent = email;
          document.getElementById('aura-otp-code-hint').textContent = data.otp;
          document.getElementById('aura-otp-code').focus();
        } else {
          errBox.textContent = data.error || 'Failed to send OTP.';
          errBox.style.display = 'block';
          sendBtn.disabled = false;
          sendBtn.innerHTML = '<span>Send Verification OTP</span> <span>→</span>';
        }
      } catch (err) {
        errBox.textContent = 'Network error sending OTP: ' + err.message;
        errBox.style.display = 'block';
        sendBtn.disabled = false;
        sendBtn.innerHTML = '<span>Send Verification OTP</span> <span>→</span>';
      }
    };

    // Step 2 verify handler
    const verifyBtn = document.getElementById('aura-otp-verify-btn');
    verifyBtn.onclick = async () => {
      const code = document.getElementById('aura-otp-code').value.trim();
      const errBox = document.getElementById('aura-otp-err-2');

      if (!code || code.length !== 6) {
        errBox.textContent = 'Please enter the complete 6-digit code.';
        errBox.style.display = 'block';
        return;
      }

      verifyBtn.disabled = true;
      verifyBtn.innerHTML = '<span>Verifying & Setting up account...</span>';

      try {
        const res = await fetch('/api/auth/otp/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: userEmail, code, name: userName })
        });
        const data = await res.json();

        if (data.success && data.user) {
          // Persist user in local storage to match app login state
          try {
            const STORAGE_KEY = 'auramusic_current_user';
            const userObj = {
              id: data.user.id || data.user._id || `user_${Date.now()}`,
              name: data.user.name || data.user.email.split('@')[0],
              email: data.user.email,
              avatar: data.user.avatar || '/avatars/p1.jpg',
              provider: 'otp'
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(userObj));
            localStorage.setItem('auramusic_user_session', JSON.stringify(userObj));
            if (data.token) localStorage.setItem('auramusic_session_token', data.token);

            // Also update any app profile accounts
            const ACC_KEY = 'auramusic_saved_accounts';
            let accs = [];
            try { accs = JSON.parse(localStorage.getItem(ACC_KEY) || '[]'); } catch {}
            accs = accs.filter(a => a.email !== userObj.email);
            accs.unshift({
              provider: 'otp',
              providerId: userObj.id,
              name: userObj.name,
              email: userObj.email,
              avatar: userObj.avatar,
              timestamp: Date.now()
            });
            localStorage.setItem(ACC_KEY, JSON.stringify(accs));

            // Instant UI update
            if (window.__auraUpdateUser) window.__auraUpdateUser();
            window.dispatchEvent(new CustomEvent('auramusic:auth', { detail: userObj }));
          } catch (e) {
            console.error('Storage error:', e);
          }

          // Trigger success celebration and reload/update state
          closeExistingModal();
          setTimeout(() => {
            window.location.reload();
          }, 150);
        } else {
          errBox.textContent = data.error || 'Invalid or expired OTP code.';
          errBox.style.display = 'block';
          verifyBtn.disabled = false;
          verifyBtn.innerHTML = '<span>Verify & Complete Sign Up</span> <span>✓</span>';
        }
      } catch (err) {
        errBox.textContent = 'Verification error: ' + err.message;
        errBox.style.display = 'block';
        verifyBtn.disabled = false;
        verifyBtn.innerHTML = '<span>Verify & Complete Sign Up</span> <span>✓</span>';
      }
    };

    // Resend handler
    document.getElementById('aura-otp-resend-btn').onclick = async () => {
      const errBox = document.getElementById('aura-otp-err-2');
      errBox.style.display = 'none';
      try {
        const res = await fetch('/api/auth/otp/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: userEmail, name: userName })
        });
        const data = await res.json();
        if (data.success) {
          demoOtp = data.otp;
          document.getElementById('aura-otp-code-hint').textContent = data.otp;
          errBox.className = 'aura-otp-banner';
          errBox.textContent = 'New verification code generated and sent!';
          errBox.style.display = 'block';
          setTimeout(() => { errBox.style.display = 'none'; }, 3000);
        }
      } catch (e) {
        errBox.textContent = 'Error resending: ' + e.message;
        errBox.style.display = 'block';
      }
    };
  }

  function closeExistingModal() {
    const el = document.getElementById('aura-otp-modal-root');
    if (el) el.remove();
  }

  // Observer to inject "Sign Up with Email OTP" into the app's Auth modal whenever it opens
  const observer = new MutationObserver(() => {
    // Check if the original auth modal is present
    const continueWithGoogleBtn = Array.from(document.querySelectorAll('button')).find(
      b => b.textContent && b.textContent.includes('Continue with Google')
    );

    if (continueWithGoogleBtn && !document.getElementById('aura-otp-launch-btn')) {
      const container = continueWithGoogleBtn.parentElement;
      if (container) {
        const otpBtn = document.createElement('button');
        otpBtn.id = 'aura-otp-launch-btn';
        otpBtn.type = 'button';
        otpBtn.className = 'w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-black font-extrabold text-sm shadow-xl shadow-emerald-500/20 transition-all flex items-center justify-center space-x-3 active:scale-[0.99] group cursor-pointer';
        otpBtn.style.marginTop = '12px';
        otpBtn.innerHTML = `
          <span style="font-size: 16px;">💬</span>
          <span class="font-extrabold text-black text-center">Create Account with Email & OTP</span>
          <span style="background: rgba(0,0,0,0.2); font-size: 10px; padding: 2px 6px; border-radius: 999px; text-transform: uppercase; font-weight: 900;">Instant</span>
        `;

        otpBtn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          // Close or hide native modal and open OTP modal
          openOtpModal();
        };

        // Insert right after Apple button or before Google button
        container.appendChild(otpBtn);
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Expose global helper
  window.openAuraOtpModal = openOtpModal;
})();
