// ═══════════════════════════════════════════════════════════════════════════
// AuraMusic × Mochy Suite v1.0
// Brings Mochy-Music's flagship AudioLab, Player Skins, Sleep Timer,
// Share Card Studio, Charts & Moods Explorer, and Storage Manager to AuraMusic.
// Preserves AuraMusic Brand, Logo, Admin Panel & Music Taste DNA System.
// ═══════════════════════════════════════════════════════════════════════════
(function AuraMochySuite() {
  'use strict';

  const STORAGE_KEY = 'auramusic_mochy_settings_v1';

  const DEFAULT_SETTINGS = {
    playerStyle: 'default', // 'default' | 'vinyl' | 'ipod' | 'bedside'
    eqPreset: 'Flat',
    eqBands: [0, 0, 0, 0, 0], // 60Hz, 230Hz, 910Hz, 3.6kHz, 14kHz
    bassBoost: 0,
    eightD: false,
    reverb: 'off', // 'off' | 'studio' | 'hall' | 'cathedral'
    playbackSpeed: 1.0,
    crossfadeSec: 0,
    disableBlur: false,
    animSpeed: 'normal', // 'fast' | 'normal' | 'slow'
    miniLyricsTicker: true,
    lyricsOffsetSec: 0,
    lyricsFontSize: 'md'
  };

  let settings = loadSettings();

  function loadSettings() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      return { ...DEFAULT_SETTINGS, ...(raw || {}) };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {}
    applyGlobalPreferences();
  }
  // expose for inline html handlers
  window.auraSaveSettings = saveSettings;
  window.auraSetLyricsOffset = function(v) {
    settings.lyricsOffsetSec = parseFloat(v);
    saveSettings();
  };

  function toast(msg, type = 'success') {
    if (window.__auraToast) { window.__auraToast(msg); return; }
    const el = document.createElement('div');
    el.textContent = msg;
    Object.assign(el.style, {
      position: 'fixed', bottom: '95px', left: '50%', transform: 'translateX(-50%)',
      background: type === 'error' ? '#ef4444' : '#10b981', color: '#fff',
      padding: '10px 22px', borderRadius: '999px', fontSize: '13px', fontWeight: '700',
      zIndex: '9999999', boxShadow: '0 8px 30px rgba(0,0,0,0.6)', pointerEvents: 'none'
    });
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2600);
  }

  function getCurrentSong() {
    try { return JSON.parse(localStorage.getItem('auramusic_current_song') || 'null'); } catch { return null; }
  }

  function getMainAudio() {
    const audios = Array.from(document.querySelectorAll('audio'));
    return audios.find(a => a.id !== 'aura-shadow-preloader' && a.src) || audios.find(a => a.id !== 'aura-shadow-preloader') || null;
  }

  // ── Inject Mochy Styles (Vinyl, iPod, Bedside, Blur/Anim toggles) ─────────
  const style = document.createElement('style');
  style.id = 'aura-mochy-styles';
  style.textContent = `
    @keyframes auraVinylSpin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    .aura-vinyl-spin {
      animation: auraVinylSpin 12s linear infinite;
      border-radius: 9999px !important;
    }
    .aura-vinyl-paused {
      animation-play-state: paused !important;
    }
    body.aura-no-blur * {
      backdrop-filter: none !important;
      -webkit-backdrop-filter: none !important;
    }
    body.aura-anim-fast * {
      transition-duration: 90ms !important;
    }
    body.aura-anim-slow * {
      transition-duration: 450ms !important;
    }
    #aura-mochy-modal, #aura-mochy-skin-overlay, #aura-mochy-share-modal {
      background: #07080c !important;
      max-width: 100vw !important;
      overflow-x: hidden !important;
    }
    /* Mobile-friendly visible range sliders */
    #aura-mochy-modal input[type="range"] {
      -webkit-appearance: none;
      appearance: none;
      width: 100%;
      height: 6px;
      background: rgba(255,255,255,0.14);
      border-radius: 999px;
      outline: none;
    }
    #aura-mochy-modal input[type="range"]::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 16px;
      height: 16px;
      border-radius: 999px;
      background: #10b981;
      border: 2px solid #fff;
      cursor: pointer;
    }
    /* iPod Click Wheel */
    .mochy-ipod-shell {
      width: 310px;
      background: linear-gradient(145deg, #272b38, #141720);
      border: 2px solid rgba(255,255,255,0.12);
      border-radius: 36px;
      padding: 20px;
      box-shadow: 0 25px 60px rgba(0,0,0,0.85), inset 0 1px 1px rgba(255,255,255,0.15);
    }
    .mochy-ipod-screen {
      background: linear-gradient(180deg, #101624, #090c14);
      border: 3px solid #05070b;
      border-radius: 14px;
      padding: 12px;
      height: 215px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .mochy-ipod-wheel {
      width: 195px;
      height: 195px;
      border-radius: 9999px;
      background: radial-gradient(circle at 30% 30%, #2f3545, #181c26);
      border: 2px solid rgba(255,255,255,0.08);
      position: relative;
      margin: 22px auto 4px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.6);
    }
    .mochy-ipod-center {
      width: 72px;
      height: 72px;
      border-radius: 9999px;
      background: linear-gradient(145deg, #1b202c, #0f121a);
      border: 1px solid rgba(255,255,255,0.12);
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
    }
  `;
  document.head.appendChild(style);

  function applyGlobalPreferences() {
    document.body.classList.toggle('aura-no-blur', Boolean(settings.disableBlur));
    document.body.classList.toggle('aura-anim-fast', settings.animSpeed === 'fast');
    document.body.classList.toggle('aura-anim-slow', settings.animSpeed === 'slow');
    const a = getMainAudio();
    if (a) {
      try { a.playbackRate = Number(settings.playbackSpeed) || 1.0; } catch {}
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. MOCHY AUDIOLAB DSP ENGINE (5-Band EQ, Bass Boost, 8D Panning, Reverb)
  // ═══════════════════════════════════════════════════════════════════════════
  const EQ_PRESETS = {
    'Flat': [0, 0, 0, 0, 0],
    'Bass Boost': [7, 5, 0, 1, 2],
    'Vocal Clarity': [-2, 0, 5, 4, 2],
    'Lo-Fi Chill': [3, 2, -1, -3, -5],
    'Electronic / EDM': [6, 3, -1, 4, 6],
    'Rock': [5, 2, -1, 3, 5],
    'Acoustic': [2, 1, 3, 2, 3],
    'Night Club': [8, 4, 0, 3, 5]
  };
  const EQ_FREQS = [60, 230, 910, 3600, 14000];
  const EQ_LABELS = ['60Hz', '230Hz', '910Hz', '3.6k', '14k'];

  let _audioCtx = null;
  let _dspConnected = false;
  let _eqFilters = [];
  let _bassFilter = null;
  let _pannerNode = null;
  let _analyser = null;
  let _8dInterval = null;
  let _8dAngle = 0;

  function ensureAudioDsp() {
    const audio = getMainAudio();
    if (!audio) return false;
    try {
      audio.playbackRate = Number(settings.playbackSpeed) || 1.0;
      if (_dspConnected) {
        updateDspParams();
        return true;
      }
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return false;
      if (!_audioCtx) _audioCtx = new Ctx();
      if (_audioCtx.state === 'suspended') _audioCtx.resume().catch(() => {});

      // Note: MediaElementSource requires CORS if cross-origin; wrap safely
      if (!audio._mochySrcNode) {
        audio._mochySrcNode = _audioCtx.createMediaElementSource(audio);
      }
      const src = audio._mochySrcNode;

      _eqFilters = EQ_FREQS.map((freq, idx) => {
        const f = _audioCtx.createBiquadFilter();
        f.type = idx === 0 ? 'lowshelf' : idx === EQ_FREQS.length - 1 ? 'highshelf' : 'peaking';
        f.frequency.value = freq;
        f.Q.value = 1.1;
        f.gain.value = settings.eqBands[idx] || 0;
        return f;
      });

      _bassFilter = _audioCtx.createBiquadFilter();
      _bassFilter.type = 'lowshelf';
      _bassFilter.frequency.value = 85;
      _bassFilter.gain.value = settings.bassBoost || 0;

      _pannerNode = _audioCtx.createStereoPanner ? _audioCtx.createStereoPanner() : null;
      _analyser = _audioCtx.createAnalyser();
      _analyser.fftSize = 64;

      let prev = src;
      _eqFilters.forEach(f => { prev.connect(f); prev = f; });
      prev.connect(_bassFilter);
      prev = _bassFilter;
      if (_pannerNode) { prev.connect(_pannerNode); prev = _pannerNode; }
      prev.connect(_analyser);
      _analyser.connect(_audioCtx.destination);

      _dspConnected = true;
      updateDspParams();
      return true;
    } catch (e) {
      // Safe fallback if browser blocks cross-origin MediaElementAudioSourceNode
      return false;
    }
  }

  function updateDspParams() {
    _eqFilters.forEach((f, i) => {
      if (f) f.gain.value = Number(settings.eqBands[i] || 0);
    });
    if (_bassFilter) _bassFilter.gain.value = Number(settings.bassBoost || 0);

    // 8D Spatial Panning orbit
    clearInterval(_8dInterval);
    if (settings.eightD && _pannerNode) {
      _8dInterval = setInterval(() => {
        _8dAngle += 0.08;
        try { _pannerNode.pan.value = Math.sin(_8dAngle) * 0.85; } catch {}
      }, 60);
    } else if (_pannerNode) {
      try { _pannerNode.pan.value = 0; } catch {}
    }

    const a = getMainAudio();
    if (a) {
      try { a.playbackRate = Number(settings.playbackSpeed) || 1.0; } catch {}
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. SLEEP TIMER (With Smooth Volume Fade-Out)
  // ═══════════════════════════════════════════════════════════════════════════
  let _sleepTimerInterval = null;
  let _sleepEndsAt = 0;

  window.auraSetSleepTimer = function(minutes) {
    clearInterval(_sleepTimerInterval);
    if (!minutes || minutes <= 0) {
      _sleepEndsAt = 0;
      toast('Sleep Timer cancelled');
      renderMochyTabContent();
      return;
    }
    _sleepEndsAt = Date.now() + minutes * 60 * 1000;
    toast(`⏰ Sleep Timer set for ${minutes} min`);
    _sleepTimerInterval = setInterval(() => {
      const rem = _sleepEndsAt - Date.now();
      const label = document.getElementById('mochy-sleep-remaining');
      if (rem <= 0) {
        clearInterval(_sleepTimerInterval);
        _sleepEndsAt = 0;
        const a = getMainAudio();
        if (a && !a.paused) {
          // Smooth 2s fade out
          const origVol = a.volume;
          let step = 10;
          const fade = setInterval(() => {
            step--;
            a.volume = Math.max(0, origVol * (step / 10));
            if (step <= 0) {
              clearInterval(fade);
              a.pause();
              a.volume = origVol;
              toast('💤 Sleep Timer: Playback paused');
            }
          }, 200);
        }
        renderMochyTabContent();
        return;
      }
      if (label) {
        const m = Math.floor(rem / 60000);
        const s = Math.floor((rem % 60000) / 1000);
        label.textContent = `${m}:${s < 10 ? '0' : ''}${s}`;
      }
    }, 1000);
    renderMochyTabContent();
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. MOCHY STUDIO MODAL (AudioLab, Skins, Sleep Timer, Charts, Storage)
  // ═══════════════════════════════════════════════════════════════════════════
  let _activeTab = 'audiolab'; // 'audiolab' | 'skins' | 'explore' | 'storage' | 'live'

  // ── Live System State ─────────────────────────────────────────────────────
  let _lyricsLines = [];           // [{time, text}]
  let _lyricsInterval = null;      // synced ticker interval
  let _liveRoomId = null;          // current room if hosting/listening
  let _liveHostInterval = null;    // host sync interval
  let _liveListenInterval = null;  // listener poll interval
  let _liveIsHost = false;

  window.auraOpenMochyStudio = function(initialTab = 'audiolab') {
    _activeTab = initialTab;
    let modal = document.getElementById('aura-mochy-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'aura-mochy-modal';
      modal.style.background = '#07080c';
      modal.className = 'fixed inset-x-0 top-0 bottom-16 md:bottom-0 z-[26] md:z-[46] text-slate-100 flex flex-col overflow-hidden animate-fadeIn select-none font-sans';
      document.body.appendChild(modal);
    }
    modal.style.display = 'flex';
    renderMochyStudioShell();
    renderMochyTabContent();
  };

  window.auraCloseMochyStudio = function() {
    const modal = document.getElementById('aura-mochy-modal');
    if (modal) modal.style.display = 'none';
  };

  function renderMochyStudioShell() {
    const modal = document.getElementById('aura-mochy-modal');
    if (!modal) return;

    const tabs = [
      { id: 'audiolab', label: '🎛️ AudioLab & FX' },
      { id: 'skins', label: '🎨 Player Skins & Timer' },
      { id: 'explore', label: '📊 Charts & Moods' },
      { id: 'storage', label: '💾 Storage & About' },
      { id: 'live', label: '🔴 Live' }
    ];

    modal.innerHTML = `
      <!-- Header -->
      <div class="p-4 sm:p-6 border-b border-white/[0.08] flex items-center justify-between bg-[#0B0E17] shrink-0">
        <div class="flex items-center space-x-3">
          <img src="/logo.png" alt="AuraMusic" class="w-9 h-9 rounded-xl object-cover ring-2 ring-emerald-500/30" />
          <div>
            <div class="flex items-center space-x-2">
              <h1 class="text-lg sm:text-xl font-black text-white">AuraMusic Studio</h1>
              <span class="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 text-[10px] font-black border border-emerald-500/30">MOCHY ENGINE</span>
            </div>
            <p class="text-[11px] text-slate-400">AudioLab DSP, Player Skins, Charts & Customizer</p>
          </div>
        </div>
        <button onclick="window.auraCloseMochyStudio()" class="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/[0.08] cursor-pointer">
          <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      </div>

      <!-- Tabs Bar (Wraps cleanly on mobile so nothing overflows) -->
      <div class="px-3 sm:px-6 py-2.5 border-b border-white/[0.06] bg-[#090b12] flex flex-wrap items-center gap-1.5 shrink-0">
        ${tabs.map(t => `
          <button onclick="window.auraSwitchMochyTab('${t.id}')" class="px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl text-[11px] sm:text-xs font-extrabold whitespace-nowrap transition-all cursor-pointer ${_activeTab === t.id ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20' : 'bg-white/[0.04] text-slate-400 hover:text-white'}">${t.label}</button>
        `).join('')}
      </div>

      <!-- Content -->
      <div id="aura-mochy-body" class="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-6 md:p-8 pb-32 max-w-5xl mx-auto w-full space-y-4 sm:space-y-6"></div>
    `;
  }

  window.auraSwitchMochyTab = function(tabId) {
    _activeTab = tabId;
    renderMochyStudioShell();
    renderMochyTabContent();
  };

  function renderMochyTabContent() {
    const body = document.getElementById('aura-mochy-body');
    if (!body) return;

    if (_activeTab === 'audiolab') {
      ensureAudioDsp();
      const remMin = _sleepEndsAt > Date.now() ? Math.ceil((_sleepEndsAt - Date.now()) / 60000) : 0;
      body.innerHTML = `
        <!-- Live Visualizer Card -->
        <div class="rounded-3xl bg-[#0e1320] border border-white/[0.08] p-5 space-y-4">
          <div class="flex items-center justify-between">
            <div>
              <h2 class="text-base font-black text-white">5-Band Equalizer & Presets</h2>
              <p class="text-[11px] text-slate-400">Real-time Web Audio DSP shaping</p>
            </div>
            <span class="px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 text-[10px] font-bold">${settings.eqPreset}</span>
          </div>

          <canvas id="mochy-lab-viz" width="600" height="72" class="w-full h-16 rounded-xl bg-black/40 border border-white/[0.05]"></canvas>

          <!-- Preset Chips -->
          <div class="flex flex-wrap gap-2">
            ${Object.keys(EQ_PRESETS).map(name => `
              <button onclick="window.auraApplyEqPreset('${name}')" class="px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition-all ${settings.eqPreset === name ? 'bg-emerald-500 text-black' : 'bg-white/[0.05] text-slate-300 hover:bg-white/10'}">${name}</button>
            `).join('')}
          </div>

          <!-- 5 Band Sliders (2-col on phone, 5-col on desktop so zero horizontal overflow) -->
          <div class="grid grid-cols-2 sm:grid-cols-5 gap-2.5 pt-2">
            ${EQ_LABELS.map((lbl, idx) => `
              <div class="flex flex-col items-center space-y-2 p-2.5 rounded-2xl bg-white/[0.03] border border-white/[0.05]">
                <div class="w-full flex items-center justify-between text-[11px]">
                  <span class="text-slate-400 font-bold">${lbl}</span>
                  <span class="font-mono text-emerald-400 font-bold" id="mochy-eq-val-${idx}">${settings.eqBands[idx] > 0 ? '+' : ''}${settings.eqBands[idx]}dB</span>
                </div>
                <input type="range" min="-12" max="12" step="1" value="${settings.eqBands[idx]}" oninput="window.auraSetEqBand(${idx}, this.value)" class="w-full accent-emerald-500 cursor-pointer" />
              </div>
            `).join('')}
          </div>
        </div>

        <!-- FX Cards: Bass Boost, 8D Spatial, Playback Speed -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div class="rounded-3xl bg-[#0e1320] border border-white/[0.08] p-5 space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-sm font-black text-white">🔊 Bass Boost</span>
              <span id="mochy-bass-val" class="text-xs font-mono text-emerald-400 font-bold">+${settings.bassBoost}dB</span>
            </div>
            <input type="range" min="0" max="14" step="1" value="${settings.bassBoost}" oninput="window.auraSetBassBoost(this.value)" class="w-full accent-emerald-500 cursor-pointer" />
            <p class="text-[11px] text-slate-400">Deep sub-bass punch at 85Hz</p>
          </div>

          <div class="rounded-3xl bg-[#0e1320] border border-white/[0.08] p-5 space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-sm font-black text-white">🎧 8D Spatial Audio</span>
              <button onclick="window.auraToggle8D()" class="px-3 py-1 rounded-full text-xs font-extrabold cursor-pointer ${settings.eightD ? 'bg-emerald-500 text-black' : 'bg-white/10 text-slate-300'}">${settings.eightD ? 'ON' : 'OFF'}</button>
            </div>
            <p class="text-[11px] text-slate-400">360° rotating headphone soundstage</p>
          </div>

          <div class="rounded-3xl bg-[#0e1320] border border-white/[0.08] p-5 space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-sm font-black text-white">⚡ Playback Speed</span>
              <span id="mochy-speed-val" class="text-xs font-mono text-emerald-400 font-bold">${settings.playbackSpeed}x</span>
            </div>
            <div class="flex items-center gap-1.5">
              ${[0.75, 1.0, 1.25, 1.5].map(sp => `
                <button onclick="window.auraSetSpeed(${sp})" class="flex-1 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${Number(settings.playbackSpeed) === sp ? 'bg-emerald-500 text-black' : 'bg-white/[0.06] text-slate-300'}">${sp}x</button>
              `).join('')}
            </div>
          </div>
        </div>

        <!-- Quick Actions: Share Card & Sleep Timer -->
        <div class="rounded-3xl bg-[#0e1320] border border-white/[0.08] p-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 class="text-sm font-black text-white">🎨 Share Song Poster Card</h3>
            <p class="text-[11px] text-slate-400">Generate an Instagram/WhatsApp song card with AuraMusic branding</p>
          </div>
          <button onclick="window.auraOpenShareCardStudio()" class="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-xs cursor-pointer">Open Share Studio</button>
        </div>
      `;
      startLabVisualizer();
    } else if (_activeTab === 'skins') {
      const remStr = _sleepEndsAt > Date.now() ? `${Math.ceil((_sleepEndsAt - Date.now()) / 60000)} min left` : 'Off';
      body.innerHTML = `
        <!-- Player Style Selector -->
        <div class="rounded-3xl bg-[#0e1320] border border-white/[0.08] p-5 space-y-4">
          <h2 class="text-base font-black text-white">Player Skins & Modes (Mochy Styles)</h2>
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
            ${[
              { id: 'default', icon: '✨', title: 'Aura Modern', desc: 'Standard AuraMusic player' },
              { id: 'vinyl', icon: '💿', title: 'Vinyl Turntable', desc: 'Spinning disc art mode' },
              { id: 'ipod', icon: '📟', title: 'iPod Classic', desc: 'Interactive Click Wheel' },
              { id: 'bedside', icon: '🌙', title: 'Bedside Clock', desc: 'Minimalist night display' }
            ].map(st => `
              <div onclick="window.auraSetPlayerStyle('${st.id}')" class="p-4 rounded-2xl border cursor-pointer transition-all ${settings.playerStyle === st.id ? 'border-emerald-500 bg-emerald-500/10' : 'border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06]'}">
                <div class="text-2xl mb-2">${st.icon}</div>
                <div class="text-xs font-extrabold text-white">${st.title}</div>
                <div class="text-[10px] text-slate-400 mt-0.5">${st.desc}</div>
              </div>
            `).join('')}
          </div>
          ${settings.playerStyle === 'ipod' || settings.playerStyle === 'bedside' ? `
            <button onclick="window.auraLaunchSkinOverlay('${settings.playerStyle}')" class="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-xs cursor-pointer">Launch ${settings.playerStyle === 'ipod' ? 'iPod Classic' : 'Bedside Clock'} Mode Now</button>
          ` : ''}
        </div>

        <!-- Sleep Timer -->
        <div class="rounded-3xl bg-[#0e1320] border border-white/[0.08] p-5 space-y-4">
          <div class="flex items-center justify-between">
            <div>
              <h2 class="text-base font-black text-white">⏰ Sleep Timer</h2>
              <p class="text-[11px] text-slate-400">Smooth volume fade-out before pausing</p>
            </div>
            <span id="mochy-sleep-remaining" class="px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-400 text-xs font-mono font-bold">${remStr}</span>
          </div>
          <div class="flex flex-wrap gap-2">
            ${[10, 15, 30, 45, 60].map(m => `
              <button onclick="window.auraSetSleepTimer(${m})" class="px-4 py-2 rounded-xl bg-white/[0.05] hover:bg-emerald-500 hover:text-black text-xs font-bold text-slate-200 cursor-pointer transition-colors">${m} min</button>
            `).join('')}
            <button onclick="window.auraSetSleepTimer(0)" class="px-4 py-2 rounded-xl bg-red-500/15 text-red-400 hover:bg-red-500/25 text-xs font-bold cursor-pointer">Turn Off</button>
          </div>
        </div>

        <!-- Behaviour & Performance Customizer -->
        <div class="rounded-3xl bg-[#0e1320] border border-white/[0.08] p-5 space-y-4">
          <h2 class="text-base font-black text-white">UI & Performance Customizer</h2>
          <div class="flex items-center justify-between py-2 border-b border-white/[0.06]">
            <div>
              <div class="text-xs font-bold text-white">Disable Blur Effects</div>
              <div class="text-[11px] text-slate-400">Improves FPS & battery on older phones</div>
            </div>
            <button onclick="window.auraToggleBlur()" class="px-3.5 py-1.5 rounded-full text-xs font-extrabold cursor-pointer ${settings.disableBlur ? 'bg-emerald-500 text-black' : 'bg-white/10 text-slate-300'}">${settings.disableBlur ? 'Blur OFF' : 'Blur ON'}</button>
          </div>
          <div class="flex items-center justify-between py-2">
            <div>
              <div class="text-xs font-bold text-white">Animation Speed</div>
              <div class="text-[11px] text-slate-400">Adjust UI transition speed</div>
            </div>
            <div class="flex gap-1.5">
              ${['fast', 'normal', 'slow'].map(sp => `
                <button onclick="window.auraSetAnimSpeed('${sp}')" class="px-3 py-1 rounded-lg text-xs font-bold capitalize cursor-pointer ${settings.animSpeed === sp ? 'bg-emerald-500 text-black' : 'bg-white/10 text-slate-300'}">${sp}</button>
              `).join('')}
            </div>
          </div>
        </div>
      `;
    } else if (_activeTab === 'explore') {
      const moods = [
        { name: 'Bollywood Romantic', query: 'Arijit Singh Romantic Hits', color: 'from-rose-600/40 to-pink-900/40' },
        { name: 'Punjabi Bangers', query: 'Karan Aujla AP Dhillon Diljit', color: 'from-amber-600/40 to-orange-900/40' },
        { name: 'Late Night Lo-Fi', query: 'Hindi Lofi Slowed Reverb', color: 'from-indigo-600/40 to-slate-900/60' },
        { name: 'Workout & Gym', query: 'Punjabi Gym Motivation Bass', color: 'from-emerald-600/40 to-teal-900/40' },
        { name: 'Global Top 50', query: 'Top Global English Pop Hits 2026', color: 'from-cyan-600/40 to-blue-900/40' },
        { name: 'Indie & Acoustic', query: 'Anuv Jain Prateek Kuhad Indie', color: 'from-purple-600/40 to-violet-900/40' }
      ];
      body.innerHTML = `
        <div class="space-y-4">
          <h2 class="text-base font-black text-white">📊 Charts, Moods & Genres</h2>
          <p class="text-xs text-slate-400">Tap any mood to instantly search & play in AuraMusic (feeds your Taste DNA!)</p>
          <div class="grid grid-cols-2 sm:grid-cols-3 gap-3.5">
            ${moods.map(m => `
              <div onclick="window.auraPlayMoodChart('${m.query}')" class="p-5 rounded-2xl bg-gradient-to-br ${m.color} border border-white/10 hover:border-emerald-400/50 cursor-pointer transition-all hover:scale-[1.02]">
                <div class="text-sm font-black text-white">${m.name}</div>
                <div class="text-[11px] text-white/70 mt-1">▶ Tap to Play</div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    } else if (_activeTab === 'live') {
      const lyricsActive = !!_lyricsInterval;
      const inRoom = !!_liveRoomId;
      const roomBadge = inRoom ? `<span class="px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30 text-[10px] font-black animate-pulse">🔴 ${_liveIsHost ? 'HOSTING' : 'LISTENING'}</span>` : '';

      body.innerHTML = `
        <!-- Synced Lyrics Ticker -->
        <div class="rounded-3xl bg-[#0e1320] border border-white/[0.08] p-5 space-y-4">
          <div class="flex items-center justify-between">
            <div>
              <h2 class="text-base font-black text-white">🎵 Synced Lyrics Ticker</h2>
              <p class="text-xs text-slate-400 mt-0.5">Auto-synced LRC lyrics from LRCLib — floats above player</p>
            </div>
            ${lyricsActive ? '<span class="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-black">● ACTIVE</span>' : ''}
          </div>
          <div class="flex gap-2 flex-wrap">
            <button onclick="window.auraStartLiveLyrics()" class="px-4 py-2.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 text-xs font-bold cursor-pointer">
              ${lyricsActive ? '🔄 Reload Lyrics' : '▶ Show Live Lyrics'}
            </button>
            ${lyricsActive ? '<button onclick="window.auraStopLiveLyrics()" class="px-4 py-2.5 rounded-xl bg-red-500/15 hover:bg-red-500/25 text-red-400 border border-red-500/30 text-xs font-bold cursor-pointer">✕ Stop Ticker</button>' : ''}
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div class="p-3 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
              <div class="text-[10px] text-slate-500 uppercase tracking-wider">Lines Loaded</div>
              <div class="text-lg font-black text-white mt-0.5">${_lyricsLines.length || '—'}</div>
            </div>
            <div class="p-3 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
              <div class="text-[10px] text-slate-500 uppercase tracking-wider">Offset</div>
              <div class="text-lg font-black text-emerald-400 mt-0.5">${settings.lyricsOffsetSec > 0 ? '+' : ''}${settings.lyricsOffsetSec}s</div>
            </div>
          </div>
          <div class="flex items-center gap-3">
            <label class="text-xs text-slate-400 font-bold shrink-0">Offset (s):</label>
            <input type="range" min="-5" max="5" step="0.5" value="${settings.lyricsOffsetSec}"
              oninput="window.auraSetLyricsOffset(this.value);this.nextElementSibling.textContent=parseFloat(this.value)+'s'"
              class="flex-1 accent-emerald-500 h-1.5 rounded-full cursor-pointer" />
            <span class="text-xs text-slate-300 w-10 text-right font-bold">${settings.lyricsOffsetSec}s</span>
          </div>
        </div>

        <!-- Live Listen Together -->
        <div class="rounded-3xl bg-[#0e1320] border border-white/[0.08] p-5 space-y-4">
          <div class="flex items-center justify-between">
            <div>
              <h2 class="text-base font-black text-white">📡 Live Listen Together ${roomBadge}</h2>
              <p class="text-xs text-slate-400 mt-0.5">Share a room code — friends join and hear in sync</p>
            </div>
          </div>
          ${inRoom ? `
            <div class="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 space-y-3">
              <div class="flex items-center justify-between">
                <div>
                  <div class="text-[10px] text-emerald-400 font-black uppercase tracking-wider">Room Code</div>
                  <div class="text-2xl font-black text-white tracking-widest mt-0.5">${_liveRoomId}</div>
                </div>
                <button onclick="navigator.clipboard.writeText('${_liveRoomId}').then(function(){window.__auraToast&&window.__auraToast('Room code copied!')})" class="p-3 rounded-xl bg-white/[0.08] hover:bg-white/[0.15] cursor-pointer text-slate-300">
                  <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                </button>
              </div>
              <button onclick="window.auraLeaveRoom()" class="w-full py-2.5 rounded-xl bg-red-500/15 hover:bg-red-500/25 text-red-400 border border-red-500/30 text-xs font-bold cursor-pointer">
                ${_liveIsHost ? '✕ End Room' : '✕ Leave Room'}
              </button>
            </div>
          ` : `
            <div class="space-y-3">
              <button onclick="window.auraCreateLiveRoom()" class="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500/20 to-teal-500/20 hover:from-emerald-500/30 hover:to-teal-500/30 text-emerald-300 border border-emerald-500/30 text-sm font-black cursor-pointer">
                🎙 Create Live Room (Host)
              </button>
              <div class="flex gap-2">
                <input id="live-join-input" type="text" maxlength="12" placeholder="Enter room code…"
                  class="flex-1 px-3 py-2.5 rounded-xl bg-white/[0.05] border border-white/[0.1] text-white text-sm placeholder-slate-500 focus:outline-none focus:border-emerald-500/50" />
                <button onclick="window.auraJoinLiveRoom(document.getElementById('live-join-input').value.trim())"
                  class="px-4 py-2.5 rounded-xl bg-teal-500/15 hover:bg-teal-500/25 text-teal-300 border border-teal-500/30 text-xs font-bold cursor-pointer">
                  Join
                </button>
              </div>
            </div>
          `}
        </div>

        <!-- How it works -->
        <div class="rounded-3xl bg-[#0e1320] border border-white/[0.08] p-5 space-y-2">
          <h3 class="text-sm font-black text-white">ℹ️ How it works</h3>
          <ul class="text-xs text-slate-400 space-y-1.5 list-disc list-inside">
            <li>Synced lyrics fetched from <span class="text-emerald-400">LRCLib</span> — word-perfect timing</li>
            <li>Lyrics scroll auto-synced to current playback position</li>
            <li><span class="text-emerald-400">Create Room</span> → share code → friends join → everyone hears the same song at the same position</li>
            <li>Host controls playback; listeners auto-sync every 3 seconds</li>
          </ul>
        </div>
      `;
    } else if (_activeTab === 'storage') {
      let totalBytes = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        totalBytes += (k.length + (localStorage.getItem(k) || '').length) * 2;
      }
      const kb = (totalBytes / 1024).toFixed(1);
      body.innerHTML = `
        <div class="rounded-3xl bg-[#0e1320] border border-white/[0.08] p-5 space-y-4">
          <h2 class="text-base font-black text-white">💾 Storage & Stream Cache</h2>
          <div class="grid grid-cols-2 gap-3">
            <div class="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
              <div class="text-xs text-slate-400">App Cache & Metadata</div>
              <div class="text-xl font-black text-emerald-400 mt-1">${kb} KB</div>
            </div>
            <div class="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
              <div class="text-xs text-slate-400">Stream URL Cache</div>
              <div class="text-xl font-black text-white mt-1">${window.__auraStreamCache ? window.__auraStreamCache.size : 0} tracks</div>
            </div>
          </div>
          <button onclick="window.auraClearMochyCache()" class="px-5 py-2.5 rounded-xl bg-red-500/15 hover:bg-red-500/25 text-red-400 border border-red-500/30 text-xs font-bold cursor-pointer">Clear Temporary Stream Cache</button>
        </div>

        <div class="rounded-3xl bg-[#0e1320] border border-white/[0.08] p-5 space-y-2">
          <div class="flex items-center space-x-3">
            <img src="/logo.png" alt="AuraMusic" class="w-10 h-10 rounded-xl" />
            <div>
              <div class="text-sm font-black text-white">AuraMusic</div>
              <div class="text-[11px] text-slate-400">AudioLab, Skins & Studio features inspired by Mochy Music (GPL-3.0)</div>
            </div>
          </div>
        </div>
      `;
    }
  }

  // Visualizer loop inside AudioLab
  let _vizRaf = null;
  function startLabVisualizer() {
    cancelAnimationFrame(_vizRaf);
    const canvas = document.getElementById('mochy-lab-viz');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const bars = 32;
    const data = new Uint8Array(bars);

    function draw() {
      if (!document.getElementById('mochy-lab-viz')) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const a = getMainAudio();
      const playing = a && !a.paused;

      if (_analyser && playing) {
        _analyser.getByteFrequencyData(data);
      } else {
        for (let i = 0; i < bars; i++) {
          data[i] = playing ? (40 + Math.sin(Date.now() * 0.008 + i * 0.5) * 35 + Math.random() * 40) : 8;
        }
      }

      const bw = canvas.width / bars;
      for (let i = 0; i < bars; i++) {
        const h = Math.max(4, (data[i] / 255) * (canvas.height - 10));
        ctx.fillStyle = '#10b981';
        ctx.fillRect(i * bw + 3, canvas.height - h, bw - 6, h);
      }
      _vizRaf = requestAnimationFrame(draw);
    }
    draw();
  }

  // ── DSP Control Handlers ──────────────────────────────────────────────────
  window.auraApplyEqPreset = function(name) {
    if (!EQ_PRESETS[name]) return;
    settings.eqPreset = name;
    settings.eqBands = [...EQ_PRESETS[name]];
    saveSettings();
    ensureAudioDsp();
    renderMochyTabContent();
  };

  window.auraSetEqBand = function(idx, val) {
    settings.eqBands[idx] = Number(val);
    settings.eqPreset = 'Custom';
    const el = document.getElementById(`mochy-eq-val-${idx}`);
    if (el) el.textContent = `${val > 0 ? '+' : ''}${val}dB`;
    saveSettings();
    ensureAudioDsp();
  };

  window.auraSetBassBoost = function(val) {
    settings.bassBoost = Number(val);
    const el = document.getElementById('mochy-bass-val');
    if (el) el.textContent = `+${val}dB`;
    saveSettings();
    ensureAudioDsp();
  };

  window.auraToggle8D = function() {
    settings.eightD = !settings.eightD;
    saveSettings();
    ensureAudioDsp();
    renderMochyTabContent();
    toast(settings.eightD ? '🎧 8D Spatial Audio ON' : '8D Audio OFF');
  };

  window.auraSetSpeed = function(sp) {
    settings.playbackSpeed = Number(sp);
    saveSettings();
    updateDspParams();
    renderMochyTabContent();
    toast(`⚡ Speed: ${sp}x`);
  };

  window.auraToggleBlur = function() {
    settings.disableBlur = !settings.disableBlur;
    saveSettings();
    renderMochyTabContent();
  };

  window.auraSetAnimSpeed = function(sp) {
    settings.animSpeed = sp;
    saveSettings();
    renderMochyTabContent();
  };

  window.auraClearMochyCache = function() {
    if (window.__auraStreamCache) window.__auraStreamCache.clear();
    toast('Stream cache cleared ✓');
    renderMochyTabContent();
  };

  window.auraPlayMoodChart = async function(query) {
    toast(`Loading ${query}...`);
    try {
      const r = await fetch(`/api/yt/search?q=${encodeURIComponent(query)}`);
      const songs = await r.json();
      if (Array.isArray(songs) && songs.length > 0 && window.__auraPlaySong) {
        window.__auraPlaySong(songs[0], songs);
        window.auraCloseMochyStudio();
        toast(`▶ Playing ${songs[0].name || query}`);
      } else {
        toast('No tracks found for this chart', 'error');
      }
    } catch {
      toast('Failed to load chart', 'error');
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. PLAYER SKINS: VINYL TURNTABLE, IPOD CLASSIC & BEDSIDE CLOCK MODE
  // ═══════════════════════════════════════════════════════════════════════════
  window.auraSetPlayerStyle = function(styleId) {
    settings.playerStyle = styleId;
    saveSettings();
    renderMochyTabContent();
    if (styleId === 'ipod' || styleId === 'bedside') {
      window.auraLaunchSkinOverlay(styleId);
    } else {
      const ov = document.getElementById('aura-mochy-skin-overlay');
      if (ov) ov.remove();
      toast(`Player style: ${styleId}`);
    }
  };

  window.auraLaunchSkinOverlay = function(mode) {
    let ov = document.getElementById('aura-mochy-skin-overlay');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'aura-mochy-skin-overlay';
      ov.style.background = '#07080c';
      ov.className = 'fixed inset-0 z-[12000] flex flex-col items-center justify-center p-4 select-none font-sans';
      document.body.appendChild(ov);
    }

    const song = getCurrentSong() || { name: 'AuraMusic', artist: 'Select a track', image: '/logo.png' };
    const a = getMainAudio();
    const isPlaying = a && !a.paused;

    if (mode === 'ipod') {
      ov.innerHTML = `
        <button onclick="document.getElementById('aura-mochy-skin-overlay').remove()" class="absolute top-5 right-5 px-4 py-2 rounded-xl bg-white/10 text-white text-xs font-bold cursor-pointer">Exit iPod</button>
        <div class="mochy-ipod-shell">
          <div class="mochy-ipod-screen">
            <div class="flex items-center justify-between text-[10px] text-emerald-400 font-bold border-b border-white/10 pb-1">
              <span>AuraMusic iPod</span>
              <span>${isPlaying ? '▶ Playing' : '⏸ Paused'}</span>
            </div>
            <div class="flex items-center space-x-3 my-auto">
              <img src="${song.image || '/logo.png'}" class="w-20 h-20 rounded-lg object-cover shadow-lg bg-slate-900" />
              <div class="min-w-0 flex-1">
                <div class="text-xs font-black text-white truncate">${song.name}</div>
                <div class="text-[11px] text-slate-400 truncate">${song.artist || 'Artist'}</div>
              </div>
            </div>
            <div class="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
              <div class="h-full bg-emerald-400 w-1/2"></div>
            </div>
          </div>
          <div class="mochy-ipod-wheel">
            <button onclick="document.getElementById('aura-mochy-skin-overlay').remove()" class="absolute top-3 left-1/2 -translate-x-1/2 text-[10px] font-black text-slate-300 tracking-wider cursor-pointer">MENU</button>
            <button onclick="document.querySelector('button[title*=Previous], button[aria-label*=Previous]')?.click(); setTimeout(()=>window.auraLaunchSkinOverlay('ipod'),300)" class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 text-sm cursor-pointer">⏮</button>
            <button onclick="document.querySelector('button[title*=Next], button[aria-label*=Next]')?.click(); setTimeout(()=>window.auraLaunchSkinOverlay('ipod'),300)" class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 text-sm cursor-pointer">⏭</button>
            <button onclick="const a=document.querySelector('audio:not(#aura-shadow-preloader)'); if(a){a.paused?a.play():a.pause();} setTimeout(()=>window.auraLaunchSkinOverlay('ipod'),150)" class="absolute bottom-3 left-1/2 -translate-x-1/2 text-slate-300 text-xs cursor-pointer">⏯</button>
            <div onclick="const a=document.querySelector('audio:not(#aura-shadow-preloader)'); if(a){a.paused?a.play():a.pause();} setTimeout(()=>window.auraLaunchSkinOverlay('ipod'),150)" class="mochy-ipod-center text-white text-xs font-bold">●</div>
          </div>
        </div>
      `;
    } else if (mode === 'bedside') {
      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      ov.innerHTML = `
        <button onclick="document.getElementById('aura-mochy-skin-overlay').remove()" class="absolute top-5 right-5 px-4 py-2 rounded-xl bg-white/10 text-white text-xs font-bold cursor-pointer">Exit Bedside</button>
        <div class="text-center space-y-6 max-w-md">
          <div class="text-6xl sm:text-7xl font-black text-emerald-400/90 tracking-tighter font-mono">${timeStr}</div>
          <div class="p-5 rounded-3xl bg-white/[0.03] border border-white/[0.06] flex items-center space-x-4 text-left">
            <img src="${song.image || '/logo.png'}" class="w-16 h-16 rounded-2xl object-cover" />
            <div class="min-w-0 flex-1">
              <div class="text-sm font-black text-white truncate">${song.name}</div>
              <div class="text-xs text-slate-400 truncate">${song.artist || 'Artist'}</div>
            </div>
            <button onclick="const a=document.querySelector('audio:not(#aura-shadow-preloader)'); if(a){a.paused?a.play():a.pause();} setTimeout(()=>window.auraLaunchSkinOverlay('bedside'),150)" class="w-11 h-11 rounded-full bg-emerald-500 text-black font-bold flex items-center justify-center cursor-pointer">${isPlaying ? '⏸' : '▶'}</button>
          </div>
        </div>
      `;
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. MOCHY SHARE CARD STUDIO (Canvas Image Export with AuraMusic Logo)
  // ═══════════════════════════════════════════════════════════════════════════
  window.auraOpenShareCardStudio = function() {
    const song = getCurrentSong() || { name: 'AuraMusic Track', artist: 'AuraMusic Artist', image: '/logo.png' };
    let modal = document.getElementById('aura-mochy-share-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'aura-mochy-share-modal';
      modal.style.background = '#07080c';
      modal.className = 'fixed inset-0 z-[12500] flex items-center justify-center p-4 select-none font-sans';
      document.body.appendChild(modal);
    }
    modal.style.display = 'flex';
    modal.innerHTML = `
      <div class="w-full max-w-md bg-[#111522] border border-white/10 rounded-3xl p-6 space-y-4 shadow-2xl">
        <div class="flex items-center justify-between">
          <h3 class="text-base font-black text-white">✨ Share Song Card</h3>
          <button onclick="document.getElementById('aura-mochy-share-modal').style.display='none'" class="text-slate-400 hover:text-white cursor-pointer">✕</button>
        </div>
        <canvas id="mochy-share-canvas" width="540" height="680" class="w-full rounded-2xl border border-white/10 shadow-xl"></canvas>
        <input id="mochy-share-quote" type="text" placeholder="Add a vibe / lyric line..." value="Now vibing on AuraMusic 🎧" class="w-full py-2 px-3 rounded-xl bg-white/[0.05] border border-white/10 text-xs text-white" oninput="window.auraRedrawShareCard()" />
        <div class="flex gap-2">
          <button onclick="window.auraDownloadShareCard()" class="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-xs cursor-pointer">⬇ Download Card PNG</button>
        </div>
      </div>
    `;
    window.auraRedrawShareCard();
  };

  window.auraRedrawShareCard = function() {
    const canvas = document.getElementById('mochy-share-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const song = getCurrentSong() || { name: 'AuraMusic', artist: 'Artist', image: '/logo.png' };
    const quote = document.getElementById('mochy-share-quote')?.value || '';

    // Rich dark gradient
    const grad = ctx.createLinearGradient(0, 0, 540, 680);
    grad.addColorStop(0, '#091a16');
    grad.addColorStop(0.5, '#0b0e17');
    grad.addColorStop(1, '#06070a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 540, 680);

    // Draw Album Art (fallback safe)
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(70, 70, 400, 400, 28);
      ctx.clip();
      ctx.drawImage(img, 70, 70, 400, 400);
      ctx.restore();
      drawCardText();
    };
    img.onerror = drawCardText;
    img.src = song.image || '/logo.png';

    function drawCardText() {
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 28px sans-serif';
      ctx.fillText((song.name || 'Track').slice(0, 28), 70, 520);

      ctx.fillStyle = '#34d399';
      ctx.font = '600 18px sans-serif';
      ctx.fillText((song.artist || 'Artist').slice(0, 34), 70, 552);

      ctx.fillStyle = '#cbd5e1';
      ctx.font = 'italic 16px sans-serif';
      ctx.fillText(quote.slice(0, 44), 70, 595);

      ctx.fillStyle = '#10b981';
      ctx.font = 'bold 14px sans-serif';
      ctx.fillText('AURAMUSIC • 320KBPS LOSSLESS', 70, 642);
    }
  };

  window.auraDownloadShareCard = function() {
    const canvas = document.getElementById('mochy-share-canvas');
    if (!canvas) return;
    try {
      const a = document.createElement('a');
      a.download = `AuraMusic_Card_${Date.now()}.png`;
      a.href = canvas.toDataURL('image/png');
      a.click();
      toast('Share Card downloaded ✓');
    } catch {
      toast('Could not export cross-origin artwork', 'error');
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 5b. LIVE SYSTEM — Synced Lyrics Ticker + Live Listen Together
  // Inspired by Mochy Music Live features (GPL-3.0) — reimplemented in JS
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Lyrics Ticker ──────────────────────────────────────────────────────────
  window.auraStartLiveLyrics = async function() {
    const song = getCurrentSong();
    if (!song || !song.name) return toast('Play a song first', 'error');
    toast('Fetching synced lyrics…');
    try {
      const res = await fetch('/api/lyrics/live?title=' + encodeURIComponent(song.name) + '&artist=' + encodeURIComponent(song.artist || ''));
      const data = await res.json();
      if (!data.success || !data.lines || !data.lines.length) {
        return toast('No synced lyrics found for this song', 'error');
      }
      _lyricsLines = data.lines;
      renderLyricsTicker(_lyricsLines);
      toast('Lyrics loaded — ' + _lyricsLines.length + ' lines');
      // Refresh live tab UI if open
      if (_activeTab === 'live') renderMochyTabContent();
    } catch (err) {
      toast('Lyrics fetch failed', 'error');
    }
  };

  window.auraStopLiveLyrics = function() {
    clearInterval(_lyricsInterval);
    _lyricsInterval = null;
    const ticker = document.getElementById('aura-lyrics-ticker');
    if (ticker) ticker.remove();
    if (_activeTab === 'live') renderMochyTabContent();
  };

  function renderLyricsTicker(lines) {
    // Remove existing ticker
    const existing = document.getElementById('aura-lyrics-ticker');
    if (existing) existing.remove();
    clearInterval(_lyricsInterval);

    // Create ticker bar above player (player bar is ~64px, so bottom: 64px)
    const ticker = document.createElement('div');
    ticker.id = 'aura-lyrics-ticker';
    ticker.style.cssText = [
      'position:fixed', 'left:0', 'right:0', 'bottom:64px', 'z-index:24',
      'background:linear-gradient(to right,rgba(7,8,12,0.95),rgba(16,185,129,0.12),rgba(7,8,12,0.95))',
      'border-top:1px solid rgba(16,185,129,0.15)',
      'padding:6px 48px 6px 12px', 'pointer-events:auto',
      'display:flex', 'flex-direction:column', 'gap:2px'
    ].join(';');

    ticker.innerHTML = `
      <button id="aura-lyrics-close" title="Close lyrics" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;color:rgba(255,255,255,0.4);font-size:16px;cursor:pointer;line-height:1;padding:4px;">✕</button>
      <div id="aura-lyrics-line1" style="font-size:12px;font-weight:800;color:#10b981;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:opacity 0.3s;line-height:1.3;">♪ Ready</div>
      <div id="aura-lyrics-line2" style="font-size:10px;color:rgba(255,255,255,0.4);text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.2;"></div>
    `;
    document.body.appendChild(ticker);

    document.getElementById('aura-lyrics-close').onclick = function() {
      window.auraStopLiveLyrics();
    };

    function updateTicker() {
      const a = getMainAudio();
      if (!a || !lines.length) return;
      const t = a.currentTime + (settings.lyricsOffsetSec || 0);
      let cur = -1;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].time <= t) cur = i; else break;
      }
      const line1 = document.getElementById('aura-lyrics-line1');
      const line2 = document.getElementById('aura-lyrics-line2');
      if (!line1) return;
      if (cur >= 0) {
        const curText = lines[cur].text || '';
        const nextText = lines[cur + 1] ? lines[cur + 1].text : '';
        if (line1.textContent !== curText) {
          line1.style.opacity = '0';
          setTimeout(function() { line1.textContent = curText; line1.style.opacity = '1'; }, 150);
        }
        line2.textContent = nextText;
      } else {
        line1.textContent = '♪ ' + (getCurrentSong() ? getCurrentSong().name || '' : '');
        line2.textContent = '';
      }
    }

    _lyricsInterval = setInterval(updateTicker, 300);
    updateTicker();
  }

  // ── Live Listen Together ────────────────────────────────────────────────────
  function getLiveUserId() {
    try {
      const u = JSON.parse(localStorage.getItem('auramusic_user') || 'null');
      if (u) return u.id || u._id || u.email || 'anon';
    } catch {}
    return 'anon_' + Math.random().toString(36).slice(2, 8);
  }

  function getLiveUserName() {
    try {
      const u = JSON.parse(localStorage.getItem('auramusic_user') || 'null');
      if (u) return u.displayName || u.name || u.email || 'Anonymous';
    } catch {}
    return 'Anonymous';
  }

  window.auraCreateLiveRoom = async function() {
    const song = getCurrentSong();
    if (!song || !song.name) return toast('Play a song first to create a live room', 'error');
    const a = getMainAudio();
    try {
      const res = await fetch('/api/live/room/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: getLiveUserId(),
          hostName: getLiveUserName(),
          song: song,
          positionSec: a ? a.currentTime : 0,
          isPlaying: a ? !a.paused : false
        })
      });
      const data = await res.json();
      if (!data.success) return toast(data.error || 'Failed to create room', 'error');
      _liveRoomId = data.roomId;
      _liveIsHost = true;
      toast('🔴 Live room created: ' + _liveRoomId);
      // Start host sync every 3s
      clearInterval(_liveHostInterval);
      _liveHostInterval = setInterval(function() {
        const au = getMainAudio();
        fetch('/api/live/room/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roomId: _liveRoomId,
            userId: getLiveUserId(),
            positionSec: au ? au.currentTime : 0,
            isPlaying: au ? !au.paused : false,
            song: getCurrentSong()
          })
        }).catch(function() {});
      }, 3000);
      showLiveBadge(true);
      if (_activeTab === 'live') renderMochyTabContent();
    } catch (err) {
      toast('Could not create room', 'error');
    }
  };

  window.auraJoinLiveRoom = async function(roomId) {
    if (!roomId) return toast('Enter a room code', 'error');
    try {
      const res = await fetch('/api/live/room?id=' + encodeURIComponent(roomId));
      const data = await res.json();
      if (!data.success) return toast(data.error || 'Room not found', 'error');
      _liveRoomId = roomId;
      _liveIsHost = false;
      toast('📡 Joined live room: ' + roomId);

      function syncFromHost() {
        fetch('/api/live/room?id=' + encodeURIComponent(roomId))
          .then(function(r) { return r.json(); })
          .then(function(d) {
            if (!d.success) return;
            const au = getMainAudio();
            const song = d.room.song;
            const curSong = getCurrentSong();
            // Load new song if different
            if (song && au && (!curSong || curSong.videoId !== song.videoId)) {
              if (window.auraPlayVideo) window.auraPlayVideo(song.videoId, song.name, song.artist, song.image);
            }
            // Seek to live position (allow ±2s tolerance)
            if (au && Math.abs(au.currentTime - d.room.livePositionSec) > 2) {
              au.currentTime = d.room.livePositionSec;
            }
            if (au) {
              if (d.room.isPlaying && au.paused) au.play().catch(function() {});
              else if (!d.room.isPlaying && !au.paused) au.pause();
            }
          }).catch(function() {});
      }

      clearInterval(_liveListenInterval);
      syncFromHost();
      _liveListenInterval = setInterval(syncFromHost, 3000);
      showLiveBadge(false);
      if (_activeTab === 'live') renderMochyTabContent();
    } catch (err) {
      toast('Could not join room', 'error');
    }
  };

  window.auraLeaveRoom = function() {
    clearInterval(_liveHostInterval);
    clearInterval(_liveListenInterval);
    _liveHostInterval = null;
    _liveListenInterval = null;
    _liveRoomId = null;
    _liveIsHost = false;
    removeLiveBadge();
    toast('Left live room');
    if (_activeTab === 'live') renderMochyTabContent();
  };

  function showLiveBadge(isHost) {
    removeLiveBadge();
    const badge = document.createElement('div');
    badge.id = 'aura-live-badge';
    badge.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:50;background:rgba(239,68,68,0.9);color:#fff;font-size:11px;font-weight:900;letter-spacing:0.08em;padding:4px 12px;border-radius:999px;pointer-events:none;animation:pulse 2s infinite;';
    badge.textContent = isHost ? '🔴 LIVE HOST' : '🔴 LIVE';
    document.body.appendChild(badge);
  }

  function removeLiveBadge() {
    const b = document.getElementById('aura-live-badge');
    if (b) b.remove();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. SIDEBAR / 3-LINE MENU INJECTION & VINYL SKIN SYNC
  // ═══════════════════════════════════════════════════════════════════════════
  function injectMochyNav() {
    const sidebarNavs = document.querySelectorAll('aside [class*="space-y-1.5"], aside nav');
    sidebarNavs.forEach(sidebarNav => {
      if (sidebarNav.querySelector('.aura-mochy-sidebar-btn')) return;
      const btn = document.createElement('button');
      btn.className = 'aura-mochy-sidebar-btn w-full flex items-center justify-between px-3.5 py-3 rounded-2xl font-bold text-sm transition-all duration-200 text-slate-400 hover:text-white hover:bg-white/[0.05] cursor-pointer';
      btn.innerHTML = `
        <div class="flex items-center space-x-3.5">
          <span class="text-base">🎛️</span>
          <span>AudioLab & Skins</span>
        </div>
        <span class="text-[10px] uppercase font-black px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">FX</span>
      `;
      btn.onclick = () => {
        const mobileOverlay = btn.closest('.fixed.inset-0');
        if (mobileOverlay) mobileOverlay.click();
        window.auraOpenMochyStudio('audiolab');
      };
      sidebarNav.appendChild(btn);
    });

    // Apply Vinyl Turntable spin to fullscreen player cover if selected
    const fullCover = document.querySelector('div[class*="z-50 bg-[#07080c]"] img.rounded-3xl, div[class*="z-50 bg-[#07080c]"] img.rounded-2xl');
    if (fullCover) {
      const a = getMainAudio();
      if (settings.playerStyle === 'vinyl') {
        fullCover.classList.add('aura-vinyl-spin');
        fullCover.classList.toggle('aura-vinyl-paused', !a || a.paused);
      } else {
        fullCover.classList.remove('aura-vinyl-spin', 'aura-vinyl-paused');
      }
    }
  }

  // Auto-close Mochy Studio when tapping bottom nav or header
  document.addEventListener('click', (e) => {
    const navTarget = e.target.closest('nav button, aside button:not(.aura-mochy-sidebar-btn), header button, header input, header a');
    if (!navTarget) return;
    if (navTarget.closest('#aura-mochy-modal, #aura-mochy-skin-overlay, #aura-mochy-share-modal')) return;
    window.auraCloseMochyStudio();
  }, true);

  setInterval(injectMochyNav, 1000);
  window.addEventListener('DOMContentLoaded', () => {
    applyGlobalPreferences();
    injectMochyNav();
  });
  window.addEventListener('play', () => {
    applyGlobalPreferences();
  }, true);

  console.log('🎛️ AuraMusic × Mochy Suite Loaded.');
})();
