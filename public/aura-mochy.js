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
    if (window.__auraMainAudio && window.__auraMainAudio.id !== 'aura-shadow-preloader') {
      return window.__auraMainAudio;
    }
    if (Array.isArray(window.__auraAudioInstances) && window.__auraAudioInstances.length > 0) {
      const found = window.__auraAudioInstances.find(a => a && a.id !== 'aura-shadow-preloader' && a.src)
                 || window.__auraAudioInstances.find(a => a && a.id !== 'aura-shadow-preloader');
      if (found) return found;
    }
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
  let _compressorNode = null;
  let _analyser = null;
  let _8dInterval = null;
  let _8dAngle = 0;
  let _crossfadeTriggeredFor = '';

  function ensureAudioDsp() {
    const audio = getMainAudio();
    if (!audio) return false;
    try {
      audio.playbackRate = Number(settings.playbackSpeed) || 1.0;
      const hasActiveDsp = settings.eightD || Number(settings.bassBoost || 0) !== 0 ||
        (settings.eqBands || []).some(g => Number(g) !== 0);
      if (!hasActiveDsp && !_dspConnected) {
        return true;
      }
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

      _compressorNode = _audioCtx.createDynamicsCompressor ? _audioCtx.createDynamicsCompressor() : null;
      if (_compressorNode) {
        _compressorNode.threshold.value = -12;
        _compressorNode.ratio.value = 4;
      }

      _pannerNode = _audioCtx.createStereoPanner ? _audioCtx.createStereoPanner() : null;
      _analyser = _audioCtx.createAnalyser();
      _analyser.fftSize = 64;

      let prev = src;
      _eqFilters.forEach(f => { prev.connect(f); prev = f; });
      prev.connect(_bassFilter);
      prev = _bassFilter;
      if (_compressorNode) { prev.connect(_compressorNode); prev = _compressorNode; }
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
  let _activeTab = 'settings'; // 'settings' | 'audiolab' | 'skins' | 'explore' | 'storage' | 'live'
  let _settingsSearch = '';

  // ── Live System State ─────────────────────────────────────────────────────
  let _lyricsLines = [];           // [{time, text}]
  let _lyricsInterval = null;      // synced ticker interval
  let _liveRoomId = null;          // current room if hosting/listening
  let _liveHostInterval = null;    // host sync interval
  let _liveListenInterval = null;  // listener poll interval
  let _liveIsHost = false;

  window.auraOpenMochyStudio = function(initialTab = 'settings') {
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
      { id: 'settings', label: '⚙️ Settings' },
      { id: 'audiolab', label: '🎛️ AudioLab' },
      { id: 'skins', label: '🎨 Skins' },
      { id: 'live', label: '🔴 Live' },
      { id: 'explore', label: '📊 Charts' },
      { id: 'storage', label: '💾 Storage' }
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

    if (_activeTab === 'settings') {
      const q = (_settingsSearch || '').toLowerCase().trim();
      const items = [
        {
          id: 'audiolab',
          title: 'Audio Lab',
          sub: '5-Band EQ, Bass Boost, 8D Spatial & Speed',
          icon: '<svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M5 9h3v10H5zm5.5-5h3v15h-3zM16 12h3v7h-3z"/></svg>',
          action: "window.auraSwitchMochyTab('audiolab')"
        },
        {
          id: 'playback',
          title: 'Playback',
          sub: 'InnerTube AAC/Lossless, Sleep Timer & Speed',
          icon: '<svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
          action: "window.auraSwitchMochyTab('audiolab')"
        },
        {
          id: 'nowplaying',
          title: 'Now playing',
          sub: 'Fullscreen Video Mode, Vinyl / iPod / Bedside Skins',
          icon: '<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 15h10"/></svg>',
          action: "window.auraOpenVideoPlayer()"
        },
        {
          id: 'behaviour',
          title: 'App behaviour',
          sub: 'Live Lyrics Ticker, Reduced Blur & Animations',
          icon: '<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.6.77 1 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
          action: "window.auraSwitchMochyTab('skins')"
        },
        {
          id: 'search_pro',
          title: 'Search Explorer (Albums, Artists, Playlists)',
          sub: 'Typed YouTube Music search, browse & Wikipedia artist bios',
          icon: '<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>',
          action: "window.auraOpenSearchExplorer && window.auraOpenSearchExplorer()"
        },
        {
          id: 'importer',
          title: 'Import Playlists (Spotify, Apple, Tidal)',
          sub: 'Import public playlists or CSV tracklists into AuraMusic',
          icon: '<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
          action: "window.auraOpenPlaylistImporter && window.auraOpenPlaylistImporter()"
        },
        {
          id: 'local_music',
          title: 'Local Music Scanner',
          sub: 'Scan & play MP3, M4A, FLAC & WAV files from device storage',
          icon: '<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
          action: "window.auraOpenLocalScanner && window.auraOpenLocalScanner()"
        },
        {
          id: 'stats',
          title: 'Listening History & Stats',
          sub: 'Top artists, play counts & listening time',
          icon: '<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>',
          action: "window.auraOpenListeningStats && window.auraOpenListeningStats()"
        },
        {
          id: 'customisation',
          title: 'Customisation (Themes, Fonts & Gestures)',
          sub: 'Accent colors, AMOLED, custom fonts, modules & Edit Profile',
          icon: '<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="13.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="10.5" r="2.5"/><circle cx="8.5" cy="7.5" r="2.5"/><circle cx="6.5" cy="12.5" r="2.5"/><path d="M12 22c4.97 0 9-4.03 9-9 0-4.97-4.03-9-9-9S3 8.03 3 13c0 2.76 2.24 5 5 5h1c1.1 0 2 .9 2 2 0 1.1.9 2 1 2z"/></svg>',
          action: "window.auraOpenProCustomize && window.auraOpenProCustomize()"
        },
        {
          id: 'storage',
          title: 'Storage',
          sub: 'Stream Cache, Clear Temporary Cache & Offline',
          icon: '<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
          action: "window.auraSwitchMochyTab('storage')"
        },
        {
          id: 'integrations',
          title: 'Integrations',
          sub: 'Live Listen Together Rooms & LRCLib Synced Lyrics',
          icon: '<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v6M12 16v6M4.93 4.93l4.24 4.24M14.83 14.83l4.24 4.24M2 12h6M16 12h6"/></svg>',
          action: "window.auraSwitchMochyTab('live')"
        },
        {
          id: 'device',
          title: 'Device integration',
          sub: 'MediaSession Lockscreen Controls & Background Audio',
          icon: '<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 12h.01M12 12h.01"/></svg>',
          action: "window.auraShowDeviceIntegration()"
        }
      ].filter(it => !q || it.title.toLowerCase().includes(q) || it.sub.toLowerCase().includes(q));

      body.innerHTML = `
        <div class="flex items-center gap-2.5">
          <div class="flex-1 flex items-center gap-2.5 px-4 py-3 rounded-full bg-[#131722] border border-white/[0.08]">
            <svg class="w-4 h-4 text-slate-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            <input id="mochy-settings-search" type="text" value="${_settingsSearch.replace(/"/g, '&quot;')}"
              oninput="window.auraFilterMochySettings(this.value)"
              placeholder="Search settings"
              class="w-full bg-transparent text-sm text-white placeholder-slate-400 focus:outline-none" />
          </div>
          <button onclick="window.auraOpenEditProfileFromMochy()" title="Edit Profile" class="w-11 h-11 rounded-full bg-[#131722] border border-white/[0.08] flex items-center justify-center text-slate-300 hover:text-white cursor-pointer shrink-0">
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6"/></svg>
          </button>
        </div>

        <div class="space-y-2.5" id="mochy-settings-list">
          ${items.map(it => `
            <button onclick="${it.action}" class="w-full flex items-center gap-4 px-4 py-4 rounded-2xl bg-[#11141d] hover:bg-[#171c28] border border-white/[0.06] text-left transition-all cursor-pointer group">
              <div class="w-10 h-10 rounded-full bg-white/[0.07] text-slate-200 flex items-center justify-center shrink-0 group-hover:bg-emerald-500/20 group-hover:text-emerald-400 transition-colors">
                ${it.icon}
              </div>
              <div class="min-w-0 flex-1">
                <div class="text-sm font-bold text-white">${it.title}</div>
                <div class="text-[11px] text-slate-400 truncate mt-0.5">${it.sub}</div>
              </div>
              <svg class="w-4 h-4 text-slate-500 group-hover:text-white shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>
            </button>
          `).join('')}
        </div>
      `;
      return;
    }

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
            <button onclick="const a=window.__auraMainAudio||document.querySelector('audio:not(#aura-shadow-preloader)'); if(a){a.paused?a.play():a.pause();} setTimeout(()=>window.auraLaunchSkinOverlay('ipod'),150)" class="absolute bottom-3 left-1/2 -translate-x-1/2 text-slate-300 text-xs cursor-pointer">⏯</button>
            <div onclick="const a=window.__auraMainAudio||document.querySelector('audio:not(#aura-shadow-preloader)'); if(a){a.paused?a.play():a.pause();} setTimeout(()=>window.auraLaunchSkinOverlay('ipod'),150)" class="mochy-ipod-center text-white text-xs font-bold">●</div>
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
            <button onclick="const a=window.__auraMainAudio||document.querySelector('audio:not(#aura-shadow-preloader)'); if(a){a.paused?a.play():a.pause();} setTimeout(()=>window.auraLaunchSkinOverlay('bedside'),150)" class="w-11 h-11 rounded-full bg-emerald-500 text-black font-bold flex items-center justify-center cursor-pointer">${isPlaying ? '⏸' : '▶'}</button>
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

  // ── Lyrics Ticker (Multi-Provider + Word-by-Word Sync) ────────────────────
  let _lyricsProviderName = '';
  window.auraStartLiveLyrics = async function() {
    const song = getCurrentSong();
    if (!song || (!song.name && !song.title)) return toast('Play a song first', 'error');
    const songName = song.name || song.title || '';
    const artistName = song.artist || '';
    const videoId = song.videoId || '';
    const a = getMainAudio();
    const duration = (a && a.duration && isFinite(a.duration)) ? a.duration : (song.duration || '');
    const providers = (typeof window.auraGetEnabledLyricsProviders === 'function')
      ? window.auraGetEnabledLyricsProviders().join(',')
      : '';
    toast('Fetching synced lyrics…');
    try {
      const url = '/api/lyrics/live?title=' + encodeURIComponent(songName) +
        '&artist=' + encodeURIComponent(artistName) +
        (videoId ? '&videoId=' + encodeURIComponent(videoId) : '') +
        (duration ? '&duration=' + encodeURIComponent(duration) : '') +
        (providers ? '&providers=' + encodeURIComponent(providers) : '');
      const res = await fetch(url);
      const data = await res.json();
      if (!data.success || !data.lines || !data.lines.length) {
        return toast('No synced lyrics found across providers', 'error');
      }
      _lyricsLines = data.lines;
      _lyricsProviderName = data.provider || 'Synced';
      renderLyricsTicker(_lyricsLines);
      toast(`Lyrics: ${_lyricsProviderName} (${_lyricsLines.length} lines)`);
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

    // Create ticker bar above player & mobile bottom nav
    const isMobile = window.innerWidth < 768;
    const ticker = document.createElement('div');
    ticker.id = 'aura-lyrics-ticker';
    ticker.style.cssText = [
      'position:fixed', 'left:0', 'right:0',
      'bottom:' + (isMobile ? '130px' : '84px'),
      'z-index:35',
      'background:linear-gradient(to right,rgba(7,8,12,0.96),rgba(16,185,129,0.16),rgba(7,8,12,0.96))',
      'border-top:1px solid rgba(16,185,129,0.22)',
      'border-bottom:1px solid rgba(16,185,129,0.12)',
      'backdrop-filter:blur(10px)',
      'padding:6px 44px 6px 12px', 'pointer-events:auto',
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
        const curLine = lines[cur];
        const nextText = lines[cur + 1] ? lines[cur + 1].text : '';
        if (Array.isArray(curLine.words) && curLine.words.length > 0) {
          line1.innerHTML = curLine.words.map(w => {
            const active = w.time <= t;
            return `<span style="color:${active ? '#34d399' : 'rgba(255,255,255,0.45)'};transition:color 0.12s;">${w.text.replace(/</g, '&lt;')} </span>`;
          }).join('');
        } else {
          const curText = curLine.text || '';
          if (line1.textContent !== curText) {
            line1.style.opacity = '0';
            setTimeout(function() { line1.textContent = curText; line1.style.opacity = '1'; }, 120);
          }
        }
        line2.textContent = (_lyricsProviderName ? `[${_lyricsProviderName}] ` : '') + nextText;
      } else {
        line1.textContent = '♪ ' + (getCurrentSong() ? (getCurrentSong().name || getCurrentSong().title || '') : '');
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
      _liveRoomId = data.room ? data.room.roomId : data.roomId;
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
            // Load new song if different — use __auraPlaySong or direct audio fallback
            if (song && (!curSong || (song.videoId && curSong.videoId !== song.videoId) || (song.name && curSong.name !== song.name))) {
              const streamUrl = song.url || (song.videoId ? '/api/yt/stream?id=' + encodeURIComponent(song.videoId) + '&title=' + encodeURIComponent(song.name || '') : '');
              const songObj = {
                name: song.name || song.title, title: song.name || song.title,
                artist: song.artist || 'Artist', image: song.image || '/logo.png',
                videoId: song.videoId, id: song.id || song.videoId,
                url: streamUrl
              };
              if (typeof window.__auraPlaySong === 'function') {
                window.__auraPlaySong(songObj, [songObj]);
              } else if (au && streamUrl) {
                try { localStorage.setItem('auramusic_current_song', JSON.stringify(songObj)); } catch {}
                au.src = streamUrl;
                au.play().catch(function() {});
              }
              const targetSeek = d.room.livePositionSec || 0;
              if (au && targetSeek > 2) {
                const onLoaded = function() {
                  au.removeEventListener('canplay', onLoaded);
                  try { au.currentTime = targetSeek; } catch {}
                };
                au.addEventListener('canplay', onLoaded);
              }
            } else if (au && Math.abs(au.currentTime - d.room.livePositionSec) > 2.5) {
              // Seek to live position (allow ±2.5s tolerance)
              try { au.currentTime = d.room.livePositionSec; } catch {}
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
  // 5c. MOCHY SETTINGS HELPERS & FULLSCREEN SYNCED VIDEO PLAYER (SCREENSHOT 1-3)
  // ═══════════════════════════════════════════════════════════════════════════
  window.auraFilterMochySettings = function(val) {
    _settingsSearch = val || '';
    const cursorPos = document.getElementById('mochy-settings-search')?.selectionStart || _settingsSearch.length;
    renderMochyTabContent();
    const inp = document.getElementById('mochy-settings-search');
    if (inp) { inp.focus(); try { inp.setSelectionRange(cursorPos, cursorPos); } catch {} }
  };

  window.auraOpenEditProfileFromMochy = function() {
    window.auraCloseMochyStudio();
    if (typeof window.auraOpenEditProfileModal === 'function') {
      window.auraOpenEditProfileModal();
    } else if (typeof window.auraOpenCommunity === 'function') {
      window.auraOpenCommunity();
      setTimeout(() => {
        if (typeof window.auraOpenEditProfileModal === 'function') window.auraOpenEditProfileModal();
      }, 250);
    } else {
      toast('Open Profile tab to edit your profile');
    }
  };

  window.auraShowDeviceIntegration = function() {
    const hasMedia = 'mediaSession' in navigator;
    toast(hasMedia ? '📱 Lockscreen & Background Media Controls: Active' : '📱 Standard Audio Output Active');
  };

  let _videoSyncTimer = null;
  let _videoOverlayPage = 0; // 0 = Video Only, 1 = Video + Synced Lyrics, 2 = Track Info
  window.auraCloseVideoPlayer = function() {
    clearInterval(_videoSyncTimer);
    _videoSyncTimer = null;
    const ov = document.getElementById('aura-mochy-video-overlay');
    if (ov) ov.remove();
  };

  window.auraOpenVideoPlayer = async function() {
    const song = getCurrentSong();
    if (!song || !song.videoId) {
      return toast('Play a YouTube Music track first for Video Mode', 'error');
    }
    window.auraCloseMochyStudio();
    window.auraCloseVideoPlayer();

    const ov = document.createElement('div');
    ov.id = 'aura-mochy-video-overlay';
    ov.style.cssText = 'position:fixed;inset:0;z-index:12500;background:#07080c;display:flex;flex-direction:column;justify-content:flex-end;overflow:hidden;font-family:inherit;user-select:none;';
    ov.innerHTML = `
      <video id="aura-mochy-video-el" playsinline muted autoplay loop style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;background:#000;"></video>
      <div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0.45) 0%,rgba(0,0,0,0.05) 35%,rgba(7,8,12,0.88) 78%,rgba(7,8,12,0.98) 100%);pointer-events:none;"></div>
      <div style="position:absolute;top:14px;left:50%;transform:translateX(-50%);width:48px;height:4px;border-radius:999px;background:rgba(255,255,255,0.38);"></div>
      <div id="aura-video-status" style="position:absolute;top:28px;left:50%;transform:translateX(-50%);font-size:11px;font-weight:800;color:rgba(255,255,255,0.75);background:rgba(0,0,0,0.45);padding:4px 12px;border-radius:999px;backdrop-filter:blur(8px);">Loading HD Video…</div>

      <div id="aura-video-lyrics-box" style="display:none;position:relative;z-index:2;padding:0 24px 16px;text-align:center;">
        <div id="aura-video-lyric-cur" style="font-size:18px;font-weight:900;color:#fff;text-shadow:0 2px 12px rgba(0,0,0,0.8);"></div>
        <div id="aura-video-lyric-next" style="font-size:13px;font-weight:600;color:rgba(255,255,255,0.55);margin-top:4px;"></div>
      </div>

      <div style="position:relative;z-index:2;padding:20px 22px 26px;space-y:14px;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
          <div style="min-width:0;flex:1;">
            <div style="display:flex;align-items:center;gap:8px;">
              <h2 id="aura-vid-title" style="margin:0;font-size:20px;font-weight:900;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${(song.name || song.title || 'Track').replace(/</g, '&lt;')}</h2>
              <span style="font-size:10px;font-weight:800;color:rgba(255,255,255,0.8);border:1px solid rgba(255,255,255,0.35);padding:1px 6px;border-radius:6px;flex-shrink:0;">AAC</span>
            </div>
            <p id="aura-vid-artist" style="margin:3px 0 0;font-size:13px;color:rgba(255,255,255,0.68);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${(song.artist || 'Artist').replace(/</g, '&lt;')}</p>
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
            <button onclick="document.querySelector('button[title*=Like i],button[aria-label*=Like i]')?.click()" style="width:38px;height:38px;border-radius:999px;background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.15);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
            </button>
            <button onclick="window.auraCloseVideoPlayer()" title="Minimize Video" style="width:38px;height:38px;border-radius:999px;background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.15);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="m18 15-6-6-6 6"/></svg>
            </button>
          </div>
        </div>

        <div style="margin-top:16px;">
          <input id="aura-vid-seek" type="range" min="0" max="100" value="0" style="width:100%;accent-color:#fff;height:4px;cursor:pointer;" />
          <div style="display:flex;justify-content:space-between;font-size:11px;color:rgba(255,255,255,0.65);margin-top:4px;font-variant-numeric:tabular-nums;">
            <span id="aura-vid-cur">0:00</span>
            <span id="aura-vid-dur">0:00</span>
          </div>
        </div>

        <div style="display:flex;align-items:center;justify-content:center;gap:42px;margin-top:16px;">
          <button onclick="document.querySelector('button[title*=Previous i],button[aria-label*=Previous i]')?.click()" style="background:none;border:none;color:#fff;cursor:pointer;padding:8px;">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="currentColor"><path d="M11 18V6l-8.5 6 8.5 6zm.5-6 8.5 6V6l-8.5 6z"/></svg>
          </button>
          <button id="aura-vid-playbtn" style="background:none;border:none;color:#fff;cursor:pointer;padding:8px;">
            <svg width="44" height="44" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
          </button>
          <button onclick="document.querySelector('button[title*=Next i],button[aria-label*=Next i]')?.click()" style="background:none;border:none;color:#fff;cursor:pointer;padding:8px;">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="currentColor"><path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z"/></svg>
          </button>
        </div>

        <div id="aura-vid-dots" onclick="window.auraCycleVideoPage()" style="margin:18px auto 0;padding:8px 14px;border-radius:14px;border:1px solid rgba(255,255,255,0.14);background:rgba(255,255,255,0.04);display:flex;align-items:center;gap:6px;width:fit-content;cursor:pointer;">
          <span class="w-1.5 h-1.5 rounded-full bg-white"></span>
          <span class="w-1.5 h-1.5 rounded-full bg-white/35"></span>
          <span class="w-1.5 h-1.5 rounded-full bg-white/35"></span>
        </div>
      </div>
    `;
    document.body.appendChild(ov);

    const vEl = document.getElementById('aura-mochy-video-el');
    const seekEl = document.getElementById('aura-vid-seek');
    const playBtn = document.getElementById('aura-vid-playbtn');
    const statusEl = document.getElementById('aura-video-status');
    const fmt = (sec) => {
      sec = Math.max(0, Math.floor(sec || 0));
      return Math.floor(sec / 60) + ':' + (sec % 60 < 10 ? '0' : '') + (sec % 60);
    };

    window.auraCycleVideoPage = function() {
      _videoOverlayPage = (_videoOverlayPage + 1) % 3;
      const lyrBox = document.getElementById('aura-video-lyrics-box');
      if (lyrBox) lyrBox.style.display = _videoOverlayPage === 1 ? 'block' : 'none';
      if (_videoOverlayPage === 1 && !_lyricsLines.length) window.auraStartLiveLyrics();
      const dots = document.querySelectorAll('#aura-vid-dots span');
      dots.forEach((d, idx) => { d.className = idx === _videoOverlayPage ? 'w-1.5 h-1.5 rounded-full bg-white' : 'w-1.5 h-1.5 rounded-full bg-white/35'; });
    };

    playBtn.onclick = () => {
      const au = getMainAudio();
      if (!au) return;
      if (au.paused) { au.play().catch(() => {}); vEl.play().catch(() => {}); }
      else { au.pause(); vEl.pause(); }
    };

    seekEl.oninput = () => {
      const au = getMainAudio();
      if (au && au.duration) {
        const target = (parseFloat(seekEl.value) / 100) * au.duration;
        au.currentTime = target;
        if (vEl.readyState >= 2) vEl.currentTime = target;
      }
    };

    // Load Mochy InnerTube Video stream
    const vidSrc = '/api/yt/video?id=' + encodeURIComponent(song.videoId.replace(/^yt_/, ''));
    vEl.src = vidSrc;
    vEl.oncanplay = () => {
      if (statusEl) statusEl.style.display = 'none';
      const au = getMainAudio();
      if (au) {
        try { vEl.currentTime = au.currentTime; } catch {}
        if (!au.paused) vEl.play().catch(() => {});
      }
    };
    vEl.onerror = () => {
      if (statusEl) statusEl.textContent = 'Video unavailable — Audio Mode';
    };

    let lastVidId = song.videoId;
    _videoSyncTimer = setInterval(() => {
      const au = getMainAudio();
      const cur = getCurrentSong();
      if (cur && cur.videoId && cur.videoId !== lastVidId) {
        lastVidId = cur.videoId;
        document.getElementById('aura-vid-title').textContent = cur.name || cur.title || 'Track';
        document.getElementById('aura-vid-artist').textContent = cur.artist || 'Artist';
        vEl.src = '/api/yt/video?id=' + encodeURIComponent(cur.videoId.replace(/^yt_/, ''));
      }
      if (!au) return;
      if (au.duration && isFinite(au.duration)) {
        seekEl.value = (au.currentTime / au.duration) * 100;
        document.getElementById('aura-vid-cur').textContent = fmt(au.currentTime);
        document.getElementById('aura-vid-dur').textContent = fmt(au.duration);
      }
      playBtn.innerHTML = au.paused
        ? '<svg width="44" height="44" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>'
        : '<svg width="44" height="44" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';

      if (vEl.readyState >= 2) {
        if (au.paused && !vEl.paused) vEl.pause();
        else if (!au.paused && vEl.paused) vEl.play().catch(() => {});
        if (Math.abs(vEl.currentTime - au.currentTime) > 0.6) {
          try { vEl.currentTime = au.currentTime; } catch {}
        }
      }
      if (_videoOverlayPage === 1 && _lyricsLines.length) {
        const t = au.currentTime + (settings.lyricsOffsetSec || 0);
        let ci = -1;
        for (let i = 0; i < _lyricsLines.length; i++) {
          if (_lyricsLines[i].time <= t) ci = i; else break;
        }
        const cEl = document.getElementById('aura-video-lyric-cur');
        const nEl = document.getElementById('aura-video-lyric-next');
        if (cEl) cEl.textContent = ci >= 0 ? _lyricsLines[ci].text : '';
        if (nEl) nEl.textContent = ci >= 0 && _lyricsLines[ci + 1] ? _lyricsLines[ci + 1].text : '';
      }
    }, 350);
  };

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
        window.auraOpenMochyStudio('settings');
      };
      sidebarNav.appendChild(btn);

      if (!sidebarNav.querySelector('.aura-mochy-live-btn')) {
        const liveBtn = document.createElement('button');
        liveBtn.className = 'aura-mochy-live-btn w-full flex items-center justify-between px-3.5 py-3 rounded-2xl font-bold text-sm transition-all duration-200 text-slate-400 hover:text-white hover:bg-white/[0.05] cursor-pointer';
        liveBtn.innerHTML = `
          <div class="flex items-center space-x-3.5">
            <span class="text-base">🔴</span>
            <span>Live & Synced Lyrics</span>
          </div>
          <span class="text-[10px] uppercase font-black px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/30">LIVE</span>
        `;
        liveBtn.onclick = () => {
          const mobileOverlay = liveBtn.closest('.fixed.inset-0');
          if (mobileOverlay) mobileOverlay.click();
          window.auraOpenMochyStudio('live');
        };
        sidebarNav.appendChild(liveBtn);
      }
    });

    // Apply Vinyl Turntable spin & inject Video Mode pill in fullscreen player
    const fullPlayer = document.querySelector('div[class*="z-50 bg-[#07080c]"]');
    if (fullPlayer) {
      if (!fullPlayer.querySelector('.aura-mochy-video-pill')) {
        const vBtn = document.createElement('button');
        vBtn.className = 'aura-mochy-video-pill fixed top-4 right-16 z-[55] px-3 py-1.5 rounded-full bg-white/10 hover:bg-emerald-500/25 border border-white/15 text-white text-xs font-bold flex items-center gap-1.5 backdrop-blur-md cursor-pointer';
        vBtn.innerHTML = '<span>🎬</span><span>Video</span>';
        vBtn.onclick = (e) => { e.stopPropagation(); window.auraOpenVideoPlayer(); };
        fullPlayer.appendChild(vBtn);
      }
      const fullCover = fullPlayer.querySelector('img.rounded-3xl, img.rounded-2xl');
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

    // Inject Mochy Settings Hub button on Profile page (Screenshot 3 style)
    const logoutBtns = Array.from(document.querySelectorAll('button')).filter(b => /logout/i.test(b.textContent || ''));
    logoutBtns.forEach(lb => {
      const card = lb.parentElement;
      if (!card || card.querySelector('.aura-mochy-profile-settings-btn')) return;
      const sBtn = document.createElement('button');
      sBtn.className = 'aura-mochy-profile-settings-btn mt-3 w-full max-w-xs mx-auto flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 text-xs font-extrabold cursor-pointer transition-all';
      sBtn.innerHTML = '<span>⚙️</span><span>Settings, AudioLab, Video & Live</span>';
      sBtn.onclick = () => window.auraOpenMochyStudio('settings');
      card.appendChild(sBtn);
    });
  }

  // Auto-close Mochy Studio when tapping bottom nav or header
  document.addEventListener('click', (e) => {
    const navTarget = e.target.closest('nav button, aside button:not(.aura-mochy-sidebar-btn):not(.aura-mochy-live-btn), header button, header input, header a');
    if (!navTarget) return;
    if (navTarget.closest('#aura-mochy-modal, #aura-mochy-skin-overlay, #aura-mochy-share-modal')) return;
    window.auraCloseMochyStudio();
  }, true);

  let _lastLiveLyricsKey = '';
  function syncOnSongActivity() {
    applyGlobalPreferences();
    ensureAudioDsp();
    if (_lyricsInterval) {
      const s = getCurrentSong();
      const key = s ? `${s.videoId || ''}_${s.name || s.title || ''}` : '';
      if (key && key !== _lastLiveLyricsKey) {
        _lastLiveLyricsKey = key;
        window.auraStartLiveLyrics();
      }
    }
  }

  setInterval(() => {
    injectMochyNav();
    if (_lyricsInterval) syncOnSongActivity();
    const cf = Number(settings.crossfadeSec || 0);
    const a = getMainAudio();
    if (cf > 0 && a && !a.paused && a.duration && isFinite(a.duration) && a.duration > cf + 2) {
      const rem = a.duration - a.currentTime;
      const srcKey = a.src || '';
      if (rem > 0 && rem <= cf && _crossfadeTriggeredFor !== srcKey) {
        _crossfadeTriggeredFor = srcKey;
        const origVol = a.volume || 1;
        let step = 8;
        const ramp = setInterval(() => {
          step--;
          a.volume = Math.max(0.05, origVol * (step / 8));
          if (step <= 0) {
            clearInterval(ramp);
            document.querySelector('button[title*=Next i], button[aria-label*=Next i]')?.click();
            setTimeout(() => { a.volume = origVol; }, 600);
          }
        }, Math.max(80, Math.floor((cf * 1000) / 10)));
      }
    }
  }, 1000);
  window.addEventListener('DOMContentLoaded', () => {
    applyGlobalPreferences();
    injectMochyNav();
  });
  window.addEventListener('play', syncOnSongActivity, true);

  console.log('🎛️ AuraMusic × Mochy Suite Loaded.');
})();
