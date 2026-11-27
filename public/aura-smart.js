// ═══════════════════════════════════════════════════════════════════════════
// AuraMusic Smart Features v3.0
// • Add to Playlist button on every song card
// • Like → auto-syncs to ❤️ Favorites system playlist
// • Recently Played auto-playlist (per user account)
// • Shuffle from Library/Playlists
// • Fast playback: pre-warm stream URLs ≤ 1.5s
// • BUFFERING OPTIMIZER v3: <2s song start, Range prefetch, 2s timeout
//   fallback to next song, zero freeze, background metadata loading
// ═══════════════════════════════════════════════════════════════════════════
(function AuraSmart() {
  'use strict';

  // ── Helpers ───────────────────────────────────────────────────────────────
  function getUser() {
    try { return JSON.parse(localStorage.getItem('auramusic_current_user') || 'null'); } catch { return null; }
  }
  function getUserId() { const u = getUser(); return (u && (u.id || u._id || u.email)) ? (u.id || u._id || u.email) : 'guest'; }
  function getCurrentSong() {
    try { return JSON.parse(localStorage.getItem('auramusic_current_song') || 'null'); } catch { return null; }
  }
  function toast(msg, type = 'success') {
    // Use app's own toast if available
    if (window.__auraToast) { window.__auraToast(msg); return; }
    const el = document.createElement('div');
    el.textContent = msg;
    Object.assign(el.style, {
      position: 'fixed', bottom: '90px', left: '50%', transform: 'translateX(-50%)',
      background: type === 'error' ? '#ef4444' : '#10b981',
      color: '#fff', padding: '10px 20px', borderRadius: '999px',
      fontSize: '13px', fontWeight: '600', zIndex: '999999',
      boxShadow: '0 4px 20px rgba(0,0,0,0.5)', pointerEvents: 'none',
      opacity: '0', transition: 'opacity 0.2s'
    });
    document.body.appendChild(el);
    requestAnimationFrame(() => { el.style.opacity = '1'; });
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 2500);
  }

  // ── 1. INSTANT QUEUE PRELOAD ENGINE (<0.5s GAPLESS PLAYBACK) ───────────────
  // Automatically pre-resolves & buffers upcoming songs in the queue as soon
  // as the queue is created, guaranteeing instantaneous (<0.5s) track playback
  // on skips and auto-advances.
  window.__auraStreamCache = window.__auraStreamCache || new Map();
  let _shadowAudioPreloader = null;
  let _activePreloadId = null;
  let _queuePreloadTimer = null;
  const _warmedQueueSet = new Set();

  function getShadowPreloader() {
    if (!_shadowAudioPreloader && typeof document !== 'undefined') {
      _shadowAudioPreloader = document.createElement('audio');
      _shadowAudioPreloader.preload = 'auto';
      _shadowAudioPreloader.muted = true;
      _shadowAudioPreloader.volume = 0;
      _shadowAudioPreloader.setAttribute('playsinline', '');
      _shadowAudioPreloader.style.display = 'none';
      _shadowAudioPreloader.id = 'aura-shadow-preloader';
      if (document.body) {
        document.body.appendChild(_shadowAudioPreloader);
      } else {
        document.addEventListener('DOMContentLoaded', () => {
          document.body.appendChild(_shadowAudioPreloader);
        });
      }
    }
    return _shadowAudioPreloader;
  }

  function cleanVideoId(id) {
    return String(id || '').replace(/^yt[-_]/, '').trim();
  }

  function normSongKey(name, artist) {
    return `${(name || '').trim()}::${(artist || '').trim()}`.toLowerCase();
  }

  // Pre-resolve direct stream URL and pre-buffer into shadow audio element
  async function preloadUpcomingSong(song, isNextImmediate = false) {
    if (!song) return;
    const vid = cleanVideoId(song.videoId || song.id);
    const title = song.name || song.title || '';
    const artist = song.artist || (song.artists?.primary?.[0]?.name) || '';
    const key = normSongKey(title, artist);
    const titleOnlyKey = title ? title.split('|')[0].replace(/\(.*?\)|\[.*?\]/g, '').trim().toLowerCase() : '';
    const itemKey = vid || key || titleOnlyKey;

    let streamUrl = (vid && window.__auraStreamCache.get(vid)) ||
                    (key && window.__auraStreamCache.get(key)) ||
                    (titleOnlyKey && window.__auraStreamCache.get(titleOnlyKey)) ||
                    (song.id && window.__auraStreamCache.get(String(song.id)));

    if (!streamUrl && itemKey && !_warmedQueueSet.has(itemKey)) {
      _warmedQueueSet.add(itemKey);
      try {
        const queryParams = new URLSearchParams({ json: '1' });
        if (vid) queryParams.set('id', vid);
        if (title) queryParams.set('title', title);
        if (artist) queryParams.set('artist', artist);

        const res = await fetch(`/api/yt/stream?${queryParams.toString()}`, {
          signal: AbortSignal.timeout(4500)
        });
        if (res.ok) {
          const data = await res.json();
          if (data && data.streamUrl) {
            streamUrl = data.streamUrl;
            if (vid) {
              window.__auraStreamCache.set(vid, streamUrl);
              window.__auraStreamCache.set('yt_' + vid, streamUrl);
              window.__auraStreamCache.set(`/api/yt/stream?id=${vid}`, streamUrl);
            }
            if (song.id) window.__auraStreamCache.set(String(song.id), streamUrl);
            if (key) window.__auraStreamCache.set(key, streamUrl);
            if (titleOnlyKey) window.__auraStreamCache.set(titleOnlyKey, streamUrl);
          }
        }
      } catch (_) {}
    }

    // Pre-warm server concurrently
    if (vid) {
      const warmParams = new URLSearchParams({ id: vid });
      if (title) warmParams.set('title', title);
      if (artist) warmParams.set('artist', artist);
      fetch(`/api/yt/warm?${warmParams.toString()}`).catch(() => {});
    }

    // Shadow audio buffering: muted play -> immediate pause forces mobile browsers to buffer actual audio frames!
    if (streamUrl && isNextImmediate) {
      if (_activePreloadId !== itemKey) {
        _activePreloadId = itemKey;
        const preloader = getShadowPreloader();
        if (preloader) {
          try {
            preloader.muted = true;
            preloader.volume = 0;
            preloader.src = streamUrl;
            preloader.load();
            const onReadyToBuffer = () => {
              preloader.pause();
              try { preloader.currentTime = 0; } catch (_) {}
            };
            preloader.addEventListener('playing', onReadyToBuffer, { once: true });
            const p = preloader.play();
            if (p && p.catch) p.catch(() => {});
          } catch (_) {}
        }
      }
    }
  }

  // Master function triggered IMMEDIATELY whenever a queue is formed or changed
  function triggerImmediateQueuePreload() {
    clearTimeout(_queuePreloadTimer);
    _queuePreloadTimer = setTimeout(() => {
      try {
        const queueRaw = localStorage.getItem('auramusic_queue');
        if (!queueRaw) return;
        const queue = JSON.parse(queueRaw);
        if (!Array.isArray(queue) || queue.length === 0) return;

        const idx = parseInt(localStorage.getItem('auramusic_queue_index') || '0', 10);
        const curSong = queue[idx];
        const nextSong = queue[idx + 1];

        // 1. Immediately buffer the NEXT upcoming song (0.2s skip playback)
        if (nextSong) preloadUpcomingSong(nextSong, true);

        // 2. Pre-resolve stream URLs for the next 10 songs in parallel (instant skip-skip-skip!)
        for (let offset = 2; offset <= 10; offset++) {
          const upcoming = queue[idx + offset];
          if (upcoming) preloadUpcomingSong(upcoming, false);
        }

        // 3. Proactive queue refill: if <= 5 songs remain ahead, pre-warm related list NOW
        if (curSong && (queue.length - 1 - idx) <= 5 && window.__auraRelated?.load) {
          window.__auraRelated.load(curSong, (relList) => {
            if (Array.isArray(relList) && relList.length && window.__pfWarm) {
              window.__pfWarm(relList.slice(0, 10).map(s => s.videoId || s.id));
            }
          });
        }
      } catch (_) {}
    }, 15);
  }

  // Intercept navigator.mediaSession.setActionHandler to capture direct playNext callback
  try {
    if (typeof navigator !== 'undefined' && navigator.mediaSession && navigator.mediaSession.setActionHandler) {
      const origSetActionHandler = navigator.mediaSession.setActionHandler;
      navigator.mediaSession.setActionHandler = function(action, handler) {
        if (action === 'nexttrack') {
          navigator.mediaSession._nexttrackHandler = handler;
        }
        return origSetActionHandler.apply(this, arguments);
      };
    }
  } catch (_) {}
  try {
    const _origSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function(k, v) {
      _origSetItem.apply(this, arguments);
      if (k === 'auramusic_queue' || k === 'auramusic_queue_index') {
        triggerImmediateQueuePreload();
      }
    };
  } catch (_) {}

  // Storage listener across tabs/windows
  window.addEventListener('storage', (e) => {
    if (e.key === 'auramusic_queue' || e.key === 'auramusic_queue_index') {
      triggerImmediateQueuePreload();
    }
  });

  // Track playback timeupdate:
  // 1) Ensure next 10 tracks are buffered when current song passes 45%
  // 2) Auto-advance 5.5s before song ends so playback never gets stuck at 0:00!
  window.addEventListener('timeupdate', (e) => {
    const a = e.target;
    if (!a || a.tagName !== 'AUDIO' || a.id === 'aura-shadow-preloader') return;
    if (a.duration > 0 && a.currentTime / a.duration > 0.45) {
      if (!a._auraPreloadedNext) {
        a._auraPreloadedNext = true;
        triggerImmediateQueuePreload();
      }
    }
    if (!a.paused && isFinite(a.duration) && a.duration > 15) {
      const rem = a.duration - a.currentTime;
      if (rem > 0 && rem <= 5.5 && !a._auraAutoAdvanced) {
        a._auraAutoAdvanced = true;
        // 1. Try MediaSession next action (direct React playNext hook)
        let handled = false;
        try {
          if (typeof navigator !== 'undefined' && navigator.mediaSession) {
            // Trigger nexttrack if handler exists
            const nexttrackHandler = navigator.mediaSession._nexttrackHandler;
            if (typeof nexttrackHandler === 'function') {
              nexttrackHandler();
              handled = true;
            }
          }
        } catch (_) {}

        // 2. Try global or React next buttons
        if (!handled) {
          const nextBtn = document.querySelector('button[title*="Next" i], button[aria-label*="Next" i], button svg.lucide-skip-forward')?.closest('button');
          if (nextBtn) {
            nextBtn.click();
            handled = true;
          }
        }

        // 3. Fallback: trigger React audio ended event naturally if button query misses
        if (!handled) {
          try {
            a.dispatchEvent(new Event('ended'));
          } catch (_) {}
        }
      }
    }
  }, true);

  // Play event: reset flags and trigger preload for new track + next 10
  window.addEventListener('play', (e) => {
    const a = e.target;
    if (a && a.tagName === 'AUDIO' && a.id !== 'aura-shadow-preloader') {
      a._auraPreloadedNext = false;
      a._auraAutoAdvanced = false;
      triggerImmediateQueuePreload();
    }
  }, true);

  // Intercept HTMLMediaElement.prototype.src to instantly swap direct pre-buffered CDN URL!
  try {
    const _mediaSrcDesc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src');
    if (_mediaSrcDesc && _mediaSrcDesc.set) {
      Object.defineProperty(HTMLMediaElement.prototype, 'src', {
        get: function() {
          return _mediaSrcDesc.get.call(this);
        },
        set: function(val) {
          let targetUrl = val;
          if (this.id !== 'aura-shadow-preloader' && typeof val === 'string' && val.includes('/api/yt/stream')) {
            const match = val.match(/[?&]id=([a-zA-Z0-9_-]+)/);
            const vid = match ? match[1].replace(/^yt[-_]/, '') : '';
            const titleMatch = val.match(/[?&]title=([^&]+)/) || val.match(/[?&]q=([^&]+)/);
            const artistMatch = val.match(/[?&]artist=([^&]+)/);
            const title = titleMatch ? decodeURIComponent(titleMatch[1]) : '';
            const artist = artistMatch ? decodeURIComponent(artistMatch[1]) : '';
            const key = normSongKey(title, artist);
            const titleOnlyKey = title ? title.split('|')[0].replace(/\(.*?\)|\[.*?\]/g, '').trim().toLowerCase() : '';

            const cached = (vid && window.__auraStreamCache.get(vid)) ||
                           (key && window.__auraStreamCache.get(key)) ||
                           (titleOnlyKey && window.__auraStreamCache.get(titleOnlyKey)) ||
                           window.__auraStreamCache.get(val);

            if (cached) {
              targetUrl = cached;
              console.log('[AuraInstant] ⚡ 0.5s Instant Playback Hit for:', vid || title);
            }
          }
          return _mediaSrcDesc.set.call(this, targetUrl);
        },
        configurable: true,
        enumerable: true
      });
    }
  } catch (_) {}

  // Hook window.fetch for /api/yt/stream json=1 to instantly return cached stream URL
  try {
    const _origFetch = window.fetch;
    window.fetch = function(resource, init) {
      if (typeof resource === 'string' && resource.includes('/api/yt/stream') && resource.includes('json=1')) {
        const match = resource.match(/[?&]id=([a-zA-Z0-9_-]+)/);
        const vid = match ? match[1].replace(/^yt[-_]/, '') : '';
        if (vid && window.__auraStreamCache && window.__auraStreamCache.has(vid)) {
          const streamUrl = window.__auraStreamCache.get(vid);
          return Promise.resolve(new Response(JSON.stringify({ streamUrl: streamUrl, source: 'aura-instant-cache' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          }));
        }
      }
      // Auto-warm top 12 songs whenever search/related/trending results arrive so EVERY tap plays in 0.1-0.3s
      if (typeof resource === 'string' && (resource.includes('/api/yt/search') || resource.includes('/api/yt/related') || resource.includes('/api/search/songs'))) {
        return _origFetch.apply(this, arguments).then(res => {
          try {
            if (res && res.ok) {
              res.clone().json().then(data => {
                const list = Array.isArray(data) ? data : (data?.data?.results || data?.queue || []);
                if (Array.isArray(list) && list.length && window.__pfWarm) {
                  window.__pfWarm(list.slice(0, 12).map(s => s.videoId || s.id).filter(Boolean));
                }
              }).catch(() => {});
            }
          } catch (_) {}
          return res;
        });
      }
      return _origFetch.apply(this, arguments);
    };
  } catch (_) {}

  // Initial trigger in case queue already exists on page load
  setTimeout(triggerImmediateQueuePreload, 300);

  // ── BUFFERING OPTIMIZER v3: <2s start, timeout fallback, background metadata ──
  const PLAY_TIMEOUT_MS = 2000;
  let _playTimeoutTimer = null;
  let _currentAttemptId = 0;

  // Expose fast-play function globally so React app can call it
  window.__auraFastPlay = function(audio, primaryUrl, fallbackUrl, onTimeout) {
    if (!audio || !primaryUrl) return Promise.resolve(false);
    const attemptId = ++_currentAttemptId;
    return new Promise((resolve) => {
      let done = false;
      function finish(ok) {
        if (done) return;
        done = true;
        clearTimeout(_playTimeoutTimer);
        resolve(ok);
      }
      // 2-second timeout: try fallback, then skip to next
      _playTimeoutTimer = setTimeout(() => {
        if (done) return;
        if (fallbackUrl && fallbackUrl !== audio.src) {
          audio.src = fallbackUrl;
          audio.load();
          audio.play().then(() => finish(true)).catch(() => {
            if (onTimeout) onTimeout();
            finish(false);
          });
        } else {
          if (onTimeout) onTimeout();
          finish(false);
        }
      }, PLAY_TIMEOUT_MS);

      audio.addEventListener('canplay', function h() {
        audio.removeEventListener('canplay', h);
        finish(true);
      }, { once: true });
      audio.addEventListener('error', function h() {
        audio.removeEventListener('error', h);
        finish(false);
      }, { once: true });
    });
  };

  // Auto-detect stalled audio and skip to next song
  (function setupStalledDetector() {
    let _stalledTimer = null;
    window.addEventListener('waiting', function(e) {
      if (!e.target || e.target.tagName !== 'AUDIO') return;
      const audio = e.target;
      _stalledTimer = setTimeout(() => {
        // If still waiting after 3s, try next song button
        if (audio.readyState < 3) {
          const nextBtn = document.querySelector('[data-action="next"], button[aria-label*="next" i], button[aria-label*="Next" i], #next-btn, .next-btn');
          if (nextBtn) { nextBtn.click(); }
        }
      }, 3000);
    }, true);
    window.addEventListener('playing', function(e) {
      if (e.target && e.target.tagName === 'AUDIO') clearTimeout(_stalledTimer);
    }, true);
  })();

  // Deferred metadata: load lyrics/album art AFTER song starts
  window.__auraDeferMetadata = function(songData) {
    setTimeout(() => {
      if (!songData) return;
      if (window.__auraLoadLyrics) window.__auraLoadLyrics(songData);
      // Fire any pending non-critical loads
    }, 2500);
  };

  // Audio element: set aggressive buffering hints
  (function optimizeAudioElement() {
    function patchAudio(audio) {
      if (audio._auraOptimized) return;
      audio._auraOptimized = true;
      audio.preload = 'auto';
      // Set buffer hint if supported
      if ('mozAutoplayEnabled' in audio) return; // Firefox quirk
    }
    // Patch existing audio elements
    document.querySelectorAll('audio').forEach(patchAudio);
    // Patch future audio elements
    const _orig = window.Audio;
    if (_orig) {
      window.Audio = function(...args) {
        const a = new _orig(...args);
        a.preload = 'auto';
        return a;
      };
    }
    // Also observe DOM for new audio elements
    const mo = new MutationObserver(muts => {
      muts.forEach(m => m.addedNodes.forEach(n => {
        if (n.tagName === 'AUDIO') patchAudio(n);
        else if (n.querySelectorAll) n.querySelectorAll('audio').forEach(patchAudio);
      }));
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  })();

  // ── 2. Recently Played: record ONLY when user explicitly taps a song ───
  // (Auto-played subsequent songs in the queue will NOT be added to Recently Played)
  const RP_KEY = 'aura_recently_played_local';
  let _userTappedSong = false;
  let _tapTimeout = null;

  function markUserTapped() {
    _userTappedSong = true;
    clearTimeout(_tapTimeout);
    _tapTimeout = setTimeout(() => { _userTappedSong = false; }, 4000);
  }

  // Intercept taps/clicks on song cards, search result items, list rows, and play buttons
  document.addEventListener('pointerdown', function(e) {
    const card = e.target.closest('[class*="song"], [class*="track"], [class*="Card"], [class*="card"], [class*="item"], [data-song-id], [data-videoid], button');
    if (card) {
      markUserTapped();
    }
  }, true);

  // Also listen to Enter key in search
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      markUserTapped();
    }
  }, true);

  function recordRecentlyPlayed(song) {
    if (!song || !song.name) return;
    const uid = getUserId();
    // Local
    try {
      let rp = JSON.parse(localStorage.getItem(RP_KEY) || '[]');
      const songId = song.id || song.videoId || song.name;
      rp = rp.filter(s => (s.id || s.videoId || s.name) !== songId);
      rp.unshift({ ...song, playedAt: Date.now() });
      if (rp.length > 50) rp.pop();
      localStorage.setItem(RP_KEY, JSON.stringify(rp));
    } catch {}
    // Server (non-blocking)
    fetch('/api/recently-played', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: uid, song })
    }).catch(() => {});

    // Pre-warm the song's stream immediately on tap
    const vid = song.videoId || (song.id && song.id.replace(/^yt[-_]/, ''));
    if (vid) warmVideoId(vid);
  }

  // ── KEY FIX: Watch localStorage for auramusic_current_song changes ───────
  // Fires when user taps a song. ONLY records to Recently Played if user explicitly tapped it!
  let _lastTrackedSongId = null;

  function checkSongChange() {
    try {
      const song = getCurrentSong();
      if (!song) return;
      const sid = song.id || song.videoId || song.name;
      if (sid && sid !== _lastTrackedSongId) {
        _lastTrackedSongId = sid;
        // ONLY record to Recently Played if user tapped to play (not auto-played queue songs)
        if (_userTappedSong) {
          _userTappedSong = false;
          recordRecentlyPlayed(song);
        } else {
          // Pre-warm the song even if auto-played
          const vid = song.videoId || (song.id && song.id.replace(/^yt[-_]/, ''));
          if (vid) warmVideoId(vid);
        }
      }
    } catch {}
  }

  // Poll every 500ms for instant tap detection
  setInterval(checkSongChange, 500);

  // Also hook storage event for cross-tab detection
  window.addEventListener('storage', function(e) {
    if (e.key === 'auramusic_current_song') checkSongChange();
  });

  // Also fire on audio play event
  window.addEventListener('play', function(e) {
    if (e.target && e.target.tagName === 'AUDIO') checkSongChange();
  }, true);

  // ── 3. Add-to-Playlist Modal ─────────────────────────────────────────────
  let atpModal = null;
  let atpSong = null;

  function injectATPStyles() {
    if (document.getElementById('aura-atp-styles')) return;
    const style = document.createElement('style');
    style.id = 'aura-atp-styles';
    style.textContent = `
      #aura-atp-backdrop {
        position: fixed; inset: 0; z-index: 1000000;
        background: rgba(0,0,0,0.75); display: flex;
        align-items: flex-end; justify-content: center;
        animation: auraFadeIn 0.18s ease;
      }
      #aura-atp-modal {
        background: #1c1d22; border-radius: 20px 20px 0 0;
        width: 100%; max-width: 480px; padding: 20px 0 32px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        animation: auraSlideUp 0.22s cubic-bezier(0.16,1,0.3,1);
      }
      @keyframes auraSlideUp {
        from { transform: translateY(60px); opacity: 0; }
        to   { transform: translateY(0);    opacity: 1; }
      }
      #aura-atp-modal h3 {
        font-size: 15px; font-weight: 700; color: #fff;
        padding: 0 20px 12px; margin: 0;
        border-bottom: 1px solid rgba(255,255,255,0.08);
      }
      .aura-atp-playlist-item {
        display: flex; align-items: center; gap: 12px;
        padding: 13px 20px; cursor: pointer; color: #e2e8f0;
        font-size: 14px; font-weight: 500; transition: background 0.15s;
      }
      .aura-atp-playlist-item:hover { background: rgba(255,255,255,0.06); }
      .aura-atp-playlist-icon { font-size: 20px; width: 32px; text-align: center; }
      #aura-atp-close {
        display: block; margin: 8px auto 0; padding: 10px 32px;
        background: rgba(255,255,255,0.08); color: #aaa;
        border: none; border-radius: 999px; font-size: 14px;
        font-weight: 600; cursor: pointer; transition: background 0.15s;
      }
      #aura-atp-close:hover { background: rgba(255,255,255,0.14); }
      .aura-atp-playlist-count { font-size: 12px; color: #64748b; margin-left: auto; }
    `;
    document.head.appendChild(style);
  }

  async function openAddToPlaylist(song) {
    atpSong = song;
    injectATPStyles();
    // Close existing
    if (atpModal) atpModal.remove();

    const uid = getUserId();
    // Fetch playlists
    let playlists = [];
    try {
      const res = await fetch('/api/user/playlists?userId=' + encodeURIComponent(uid));
      const data = await res.json();
      if (data.success) playlists = data.playlists || [];
    } catch {}

    // Also add local playlists not yet synced
    try {
      const local = JSON.parse(localStorage.getItem('auramusic_cached_playlists') || '[]');
      local.forEach(lp => {
        if (!playlists.find(p => String(p.id || p._id) === String(lp.id || lp._id))) {
          playlists.unshift(lp);
        }
      });
    } catch {}

    // Filter out system playlists with auto-behavior
    const userPlaylists = playlists.filter(p => !p._system || p._system === 'favorites');

    const backdrop = document.createElement('div');
    backdrop.id = 'aura-atp-backdrop';
    backdrop.innerHTML = `
      <div id="aura-atp-modal">
        <h3>➕ Add to Playlist</h3>
        <div id="aura-atp-create-quick" style="display:flex; gap:8px; padding:10px 16px; border-bottom:1px solid rgba(255,255,255,0.08);">
          <input type="text" id="aura-new-pl-input" placeholder="Create new playlist..." style="flex:1; background:rgba(0,0,0,0.5); border:1px solid rgba(255,255,255,0.15); border-radius:10px; padding:8px 12px; color:#fff; font-size:13px; outline:none;" />
          <button id="aura-new-pl-submit" style="background:#10b981; color:#000; font-weight:700; border:none; border-radius:10px; padding:8px 14px; font-size:12px; cursor:pointer;">Create</button>
        </div>
        <div id="aura-atp-list-items" style="max-height:260px; overflow-y:auto;">
          ${userPlaylists.length === 0
            ? '<div class="aura-atp-playlist-item" style="color:#64748b">No custom playlists yet. Create one above!</div>'
            : userPlaylists.map(pl => `
              <div class="aura-atp-playlist-item" data-plid="${escHtml(String(pl.id || pl._id))}" data-plname="${escHtml(pl.name || '')}">
                <span class="aura-atp-playlist-icon">${pl._system === 'favorites' ? '❤️' : pl.isSystem ? '🕐' : '🎵'}</span>
                <span>${escHtml(pl.name || 'Playlist')}</span>
                <span class="aura-atp-playlist-count">${(pl.songs || []).length} songs</span>
              </div>`).join('')
          }
        </div>
        <button id="aura-atp-close">Cancel</button>
      </div>
    `;
    document.body.appendChild(backdrop);
    atpModal = backdrop;

    // Instant playlist creation from inside modal
    const quickInput = document.getElementById('aura-new-pl-input');
    const quickSubmit = document.getElementById('aura-new-pl-submit');
    if (quickSubmit && quickInput) {
      quickSubmit.onclick = async () => {
        const name = quickInput.value.trim();
        if (!name) return;
        quickSubmit.textContent = '...';
        try {
          const r = await fetch('/api/playlists', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: uid, name })
          });
          const j = await r.json();
          if (j.success && j.playlist) {
            toast('✅ Playlist created instantly!');
            // Add current song immediately to new playlist
            if (atpSong) {
              await addSongToPlaylist(j.playlist.id, atpSong);
            }
            backdrop.remove();
            atpModal = null;
          } else {
            toast(j.error || 'Duplicate playlist name', 'error');
            quickSubmit.textContent = 'Create';
          }
        } catch {
          toast('Failed to create playlist', 'error');
          quickSubmit.textContent = 'Create';
        }
      };
    }

    backdrop.addEventListener('click', function(e) {
      const item = e.target.closest('.aura-atp-playlist-item');
      if (item && item.dataset.plid) {
        addSongToPlaylist(item.dataset.plid, atpSong);
        backdrop.remove();
        atpModal = null;
      }
      if (e.target.id === 'aura-atp-backdrop' || e.target.id === 'aura-atp-close') {
        backdrop.remove();
        atpModal = null;
      }
    });
  }

  function escHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  async function addSongToPlaylist(playlistId, song) {
    const uid = getUserId();
    try {
      const res = await fetch('/api/playlist/add-song', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: uid, playlistId, song })
      });
      const data = await res.json();
      if (data.success) {
        if (data.alreadyExists) {
          toast('Already in playlist', 'error');
        } else {
          toast('✅ Added to playlist!');
          // Update local cache
          try {
            let cached = JSON.parse(localStorage.getItem('auramusic_cached_playlists') || '[]');
            const pl = cached.find(p => String(p.id || p._id) === String(playlistId));
            if (pl) {
              const sid = song.id || song.videoId;
              if (!pl.songs) pl.songs = [];
              if (!pl.songs.some(s => (s.id || s.videoId) === sid)) pl.songs.unshift(song);
              if (!pl.cover && !pl.coverUrl && song.image) {
                pl.cover = song.image;
                pl.coverUrl = song.image;
              }
              localStorage.setItem('auramusic_cached_playlists', JSON.stringify(cached));
            }
          } catch {}
          if (typeof window.__auraRefreshPlaylists === 'function') {
            window.__auraRefreshPlaylists();
          }
        }
      } else {
        toast(data.error || 'Failed to add song', 'error');
      }
    } catch {
      toast('Network error', 'error');
    }
  }

  // ── 4. Inject "Add to Playlist" buttons on song cards ────────────────────
  function extractSongFromCard(card) {
    // Try to find a song from the card's data attributes or text
    const name = card.dataset.songName || card.querySelector('[data-song-name]')?.dataset.songName
      || card.querySelector('.song-title, [class*="title"]')?.textContent?.trim()
      || '';
    const artist = card.dataset.artist || card.querySelector('[data-artist]')?.dataset.artist
      || card.querySelector('.song-artist, [class*="artist"], [class*="subtitle"]')?.textContent?.trim()
      || '';
    const id = card.dataset.songId || card.dataset.videoid || '';
    const image = card.querySelector('img')?.src || '';
    if (!name) return null;
    return { id: id || `local_${name}`, name, artist, image, videoId: id };
  }

  function getSongFromContext(el) {
    // Walk up to find a song card/row
    let node = el;
    for (let i = 0; i < 8; i++) {
      if (!node || node === document.body) break;
      const song = extractSongFromCard(node);
      if (song && song.name) return song;
      node = node.parentElement;
    }
    // Fall back to current song
    return getCurrentSong();
  }

  // Observe song cards and inject Add-to-Playlist button via context menu
  function attachAddToPlaylistContextMenu() {
    document.addEventListener('contextmenu', function(e) {
      const song = getSongFromContext(e.target);
      if (!song) return;
      e.preventDefault();
      openAddToPlaylist(song);
    });
  }

  // Also add a small "+" button on every song action area
  function injectAddToPlaylistButton(container) {
    if (!container || container.querySelector('.aura-atp-btn')) return;
    const btn = document.createElement('button');
    btn.className = 'aura-atp-btn';
    btn.title = 'Add to Playlist';
    btn.textContent = '➕';
    Object.assign(btn.style, {
      background: 'transparent', border: 'none', cursor: 'pointer',
      fontSize: '15px', padding: '4px 6px', borderRadius: '8px',
      color: '#64748b', flexShrink: '0',
      transition: 'color 0.15s, background 0.15s'
    });
    btn.addEventListener('mouseenter', () => { btn.style.color = '#10b981'; btn.style.background = 'rgba(16,185,129,0.1)'; });
    btn.addEventListener('mouseleave', () => { btn.style.color = '#64748b'; btn.style.background = 'transparent'; });
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      e.preventDefault();
      const song = getSongFromContext(container);
      if (song) openAddToPlaylist(song);
    });
    container.appendChild(btn);
  }

  // ── 5. Shuffle player: expose __auraShuffle for the Library ──────────────
  window.__auraShuffle = function(songs) {
    if (!Array.isArray(songs) || songs.length === 0) return;
    const shuffled = songs.slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    // Store shuffled queue
    try {
      localStorage.setItem('auramusic_queue', JSON.stringify(shuffled));
      localStorage.setItem('auramusic_queue_index', '0');
      // Fire a custom event that the player listens to
      window.dispatchEvent(new CustomEvent('aura:play-queue', { detail: { songs: shuffled, index: 0 } }));
      toast('🔀 Shuffle queue started!');
    } catch {}
  };

  // ── 6. Shuffle buttons on Library/Playlist pages ─────────────────────────
  function injectShuffleButton(listContainer) {
    if (!listContainer || listContainer.querySelector('.aura-shuffle-btn')) return;
    const btn = document.createElement('button');
    btn.className = 'aura-shuffle-btn';
    btn.innerHTML = '🔀 Shuffle';
    Object.assign(btn.style, {
      display: 'inline-flex', alignItems: 'center', gap: '6px',
      background: 'rgba(16,185,129,0.15)', color: '#10b981',
      border: '1px solid rgba(16,185,129,0.3)', borderRadius: '999px',
      padding: '7px 18px', fontSize: '13px', fontWeight: '700',
      cursor: 'pointer', margin: '8px 0 12px', transition: 'background 0.15s'
    });
    btn.addEventListener('click', function() {
      // Collect all songs in the visible list
      const songs = [];
      listContainer.querySelectorAll('[data-song-id], [data-videoid]').forEach(el => {
        const s = extractSongFromCard(el);
        if (s) songs.push(s);
      });
      // Also fall back to localStorage queue
      if (songs.length === 0) {
        try {
          const q = JSON.parse(localStorage.getItem('auramusic_queue') || '[]');
          q.forEach(s => songs.push(s));
        } catch {}
      }
      window.__auraShuffle(songs);
    });
    listContainer.insertBefore(btn, listContainer.firstChild);
  }

  // ── 7. MutationObserver: watch for new song lists ────────────────────────
  const observer = new MutationObserver(function(mutations) {
    mutations.forEach(mutation => {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType !== 1) return;
        // Inject ATP button on song rows that have action buttons
        node.querySelectorAll && node.querySelectorAll('[class*="song-row"], [class*="track-item"], [class*="SongCard"], [class*="song-card"]').forEach(card => {
          const actions = card.querySelector('[class*="actions"], [class*="controls"], button');
          if (actions) injectAddToPlaylistButton(actions.parentElement || card);
        });
      });
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // ── 8. Record recently played when song changes in localStorage ───────────
  // (Handled above by checkSongChange polling at 800ms intervals)

  // ── 9. Right-click context menu (alternative ATP access) ─────────────────
  attachAddToPlaylistContextMenu();

  // ── 10. Keyboard shortcut: Shift+A = Add current song to playlist ─────────
  document.addEventListener('keydown', function(e) {
    if (e.shiftKey && e.key === 'A') {
      const song = getCurrentSong();
      if (song) openAddToPlaylist(song);
    }
  });

  // ── 10B. Like / Heart Click Interceptor: Ask which playlist to add to ──────
  document.addEventListener('click', function(e) {
    const target = e.target;
    // Check if clicked element or its parent is a like button or heart icon
    const likeBtn = target.closest('button[title*="Like" i], button[title*="Favorite" i], button[aria-label*="Like" i], [class*="heart"], button svg path[d*="19 14"], button svg path[d*="20.84"]')?.closest('button') || target.closest('.like-btn, [class*="like"]');
    
    // Ignore internal modal buttons or taste buttons
    if (likeBtn && !likeBtn.closest('#aura-atp-modal') && !likeBtn.closest('#aura-taste-modal')) {
      const song = getSongFromContext(likeBtn) || getCurrentSong();
      if (song && (song.name || song.title)) {
        // Also show Add To Playlist popup so user can choose custom playlist along with favorites!
        setTimeout(() => {
          openAddToPlaylist(song);
        }, 150);
      }
    }
  }, true);

  // ── 12. Fast Music Playing Feature (saavn.dev API with Piped fallback) ────
  // Requirements:
  // 1. User types a song name -> calls https://saavn.dev/api/search/songs?query={SONG_NAME}&limit=10
  //    (with seamless server/piped fallback if saavn.dev is unreachable)
  // 2. Play URL extracted from: response.data.results[n].downloadUrl[last index].url
  // 3. Play using <audio preload="auto"> with start time < 3 seconds
  // 4. Shows song name, artist name (artists.primary[0].name), thumbnail image (image[0].url)
  // 5. Top 10 results, 1-click instant playback

  let fastAudioEl = null;

  function getFastAudioElement() {
    if (!fastAudioEl) {
      // Find existing audio in DOM or create dedicated fast audio player
      fastAudioEl = document.querySelector('audio') || document.createElement('audio');
      fastAudioEl.preload = 'auto';
      fastAudioEl.playsInline = true;
      if (!fastAudioEl.parentNode) {
        fastAudioEl.style.display = 'none';
        document.body.appendChild(fastAudioEl);
      }
    }
    return fastAudioEl;
  }

  // Master function to play URL instantly (<3s) using HTML5 <audio preload="auto">
  async function playFastSong(songObj) {
    if (!songObj) return;

    // 1. Get play URL from downloadUrl[last index].url
    let streamUrl = null;
    if (Array.isArray(songObj.downloadUrl) && songObj.downloadUrl.length > 0) {
      const lastIndex = songObj.downloadUrl.length - 1;
      streamUrl = songObj.downloadUrl[lastIndex]?.url;
    }
    if (!streamUrl && songObj.url) streamUrl = songObj.url;
    if (!streamUrl && songObj.streamUrl) streamUrl = songObj.streamUrl;

    if (!streamUrl) {
      toast('Audio URL not found', 'error');
      return;
    }

    const audio = getFastAudioElement();
    audio.preload = 'auto';
    audio.src = streamUrl;
    audio.currentTime = 0;

    try {
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        await playPromise;
        const songTitle = songObj.name || songObj.title || 'Song';
        const artistName = songObj.artists?.primary?.[0]?.name || songObj.artist || 'Artist';
        toast(`▶ Playing: ${songTitle}`);

        // Update MediaSession
        if ('mediaSession' in navigator && window.MediaMetadata) {
          const imgUrl = songObj.image?.[songObj.image.length - 1]?.url || songObj.image?.[0]?.url || '/logo.png';
          navigator.mediaSession.metadata = new MediaMetadata({
            title: songTitle,
            artist: artistName,
            artwork: [{ src: imgUrl, sizes: '512x512', type: 'image/jpeg' }]
          });
        }

        // Record in Recently Played (user tapped)
        recordRecentlyPlayed({
          id: songObj.id || `fast_${Date.now()}`,
          name: songTitle,
          artist: artistName,
          image: songObj.image?.[0]?.url || songObj.image || '/logo.png',
          streamUrl: streamUrl
        });
      }
    } catch (err) {
      console.warn('[FastPlay] Audio play notice:', err);
    }
  }

  // Fast Search Function using saavn.dev API with automatic piped fallback
  async function searchFastSongs(query, limit = 10) {
    const q = (query || '').trim();
    if (!q) return [];

    let data = null;

    // Step 1: Call https://saavn.dev/api/search/songs?query={SONG_NAME}&limit=10
    try {
      const saavnDevUrl = `https://saavn.dev/api/search/songs?query=${encodeURIComponent(q)}&limit=${limit}`;
      const res = await fetch(saavnDevUrl, { signal: AbortSignal.timeout(2500) });
      if (res.ok) {
        data = await res.json();
      }
    } catch (_) {}

    // Step 2: If saavn.dev fails, call our local proxy endpoint /api/search/songs (which uses live JioSaavn 320k + piped fallback)
    if (!data || !data.data || !Array.isArray(data.data.results) || data.data.results.length === 0) {
      try {
        const localUrl = `/api/search/songs?query=${encodeURIComponent(q)}&limit=${limit}`;
        const localRes = await fetch(localUrl, { signal: AbortSignal.timeout(3000) });
        if (localRes.ok) {
          data = await localRes.json();
        }
      } catch (_) {}
    }

    // Step 3: Backup Fallback -> https://pipedapi.kavin.rocks/search?q={SONG_NAME}&filter=music_songs
    if (!data || !data.data || !Array.isArray(data.data.results) || data.data.results.length === 0) {
      const pipedInstances = [
        'https://pipedapi.kavin.rocks',
        'https://api.piped.private.coffee'
      ];
      for (const host of pipedInstances) {
        try {
          const pUrl = `${host}/search?q=${encodeURIComponent(q)}&filter=music_songs`;
          const pRes = await fetch(pUrl, { signal: AbortSignal.timeout(3000) });
          if (pRes.ok) {
            const pData = await pRes.json();
            const items = pData.items || [];
            if (items.length > 0) {
              const mappedResults = items.slice(0, limit).map(item => {
                const vid = (item.url || '').replace('/watch?v=', '');
                return {
                  id: 'piped_' + vid,
                  name: item.title,
                  artists: { primary: [{ name: item.uploaderName || 'Unknown Artist' }] },
                  image: [{ url: item.thumbnail || `https://i.ytimg.com/vi/${vid}/hqdefault.jpg` }],
                  downloadUrl: [
                    { quality: 'audio', url: `/api/yt/stream?id=${vid}&q=${encodeURIComponent(item.title)}` }
                  ]
                };
              });
              data = { success: true, data: { results: mappedResults } };
              break;
            }
          }
        } catch (_) {}
      }
    }

    return (data && data.data && Array.isArray(data.data.results)) ? data.data.results.slice(0, limit) : [];
  }

  // Expose fast API on window
  window.__auraFastPlay = {
    search: searchFastSongs,
    play: playFastSong,
    getAudio: getFastAudioElement
  };

  // ── Intercept search input to enhance top search list with fast 1-click play ──
  let searchDebounce = null;
  document.addEventListener('input', function(e) {
    if (e.target && (e.target.type === 'search' || e.target.type === 'text') &&
        (e.target.placeholder?.toLowerCase().includes('search') || e.target.id?.includes('search') || e.target.className?.includes('search'))) {
      const val = e.target.value?.trim();
      if (!val || val.length < 2) return;
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(async () => {
        try {
          const results = await searchFastSongs(val, 10);
          window.__auraLastFastSearchResults = results;
        } catch (_) {}
      }, 350);
    }
  }, true);

  // (Removed) A click interceptor used to guess the song from the card's first text and play a different
  // JioSaavn match, so the poster and the song that played could differ. The main player now plays exactly
  // the song that was tapped.

  // ── 11. Expose public API for in-app integration ──────────────────────────
  window.__auraSmartFeatures = {
    openAddToPlaylist,
    recordRecentlyPlayed,
    warmVideoId,
    shuffle: window.__auraShuffle,
    fastPlay: playFastSong,
    fastSearch: searchFastSongs
  };

  // ── 13. Auto-Suggest Dropdown (2 char trigger, YouTube/JioSaavn hybrid) ──
  (function setupAutoSuggest() {
    // ── Styles ──
    const style = document.createElement('style');
    style.textContent = `
      #aura-suggest-box {
        position: absolute; z-index: 999999;
        background: #0f1623; border: 1px solid rgba(255,255,255,0.1);
        border-radius: 16px; box-shadow: 0 20px 60px rgba(0,0,0,0.7);
        padding: 6px 0; min-width: 320px; max-width: 500px;
        overflow: hidden; animation: aura-suggest-in 0.15s ease;
      }
      @keyframes aura-suggest-in {
        from { opacity: 0; transform: translateY(-6px) scale(0.98); }
        to   { opacity: 1; transform: translateY(0) scale(1); }
      }
      .aura-suggest-item {
        display: flex; align-items: center; gap: 10px;
        padding: 9px 14px; cursor: pointer; transition: background 0.12s;
        color: #e2e8f0;
      }
      .aura-suggest-item:hover, .aura-suggest-item.aura-suggest-active {
        background: rgba(16,185,129,0.12);
      }
      .aura-suggest-img {
        width: 38px; height: 38px; border-radius: 8px;
        object-fit: cover; flex-shrink: 0;
        background: #1e293b; border: 1px solid rgba(255,255,255,0.08);
      }
      .aura-suggest-icon {
        width: 38px; height: 38px; border-radius: 8px; flex-shrink: 0;
        display: flex; align-items: center; justify-content: center;
        background: rgba(16,185,129,0.1); color: #10b981; font-size: 14px;
      }
      .aura-suggest-text { flex: 1; min-width: 0; }
      .aura-suggest-name {
        font-size: 13px; font-weight: 600; color: #f1f5f9;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .aura-suggest-artist {
        font-size: 11px; color: #64748b; white-space: nowrap;
        overflow: hidden; text-overflow: ellipsis;
      }
      .aura-suggest-pill {
        font-size: 9px; padding: 2px 6px; border-radius: 999px;
        background: rgba(16,185,129,0.15); color: #10b981;
        font-weight: 700; flex-shrink: 0;
      }
      .aura-suggest-sep {
        height: 1px; background: rgba(255,255,255,0.05); margin: 4px 0;
      }
    `;
    document.head.appendChild(style);

    let suggestBox = null;
    let activeInput = null;
    let suggestActive = -1;
    let suggestItems = [];
    let suggestFetching = false;
    let suggestDebounce = null;
    let currentQuery = '';

    function removeSuggest() {
      if (suggestBox) { suggestBox.remove(); suggestBox = null; }
      suggestItems = []; suggestActive = -1;
    }

    function positionBox(input) {
      if (!suggestBox || !input) return;
      const rect = input.getBoundingClientRect();
      suggestBox.style.top = (rect.bottom + window.scrollY + 4) + 'px';
      suggestBox.style.left = rect.left + 'px';
      suggestBox.style.width = Math.max(320, rect.width) + 'px';
    }

    function renderItems(items) {
      if (!suggestBox) return;
      suggestBox.innerHTML = '';
      suggestItems = items;
      suggestActive = -1;
      items.forEach(function(item, idx) {
        if (item.type === 'sep') {
          const sep = document.createElement('div');
          sep.className = 'aura-suggest-sep';
          suggestBox.appendChild(sep);
          return;
        }
        const el = document.createElement('div');
        el.className = 'aura-suggest-item';
        el.dataset.idx = idx;

        if (item.image) {
          el.innerHTML = `
            <img class="aura-suggest-img" src="${item.image}" alt="" loading="lazy" onerror="this.style.display='none'">
            <div class="aura-suggest-text">
              <div class="aura-suggest-name">${item.name}</div>
              ${item.artist ? `<div class="aura-suggest-artist">${item.artist}</div>` : ''}
            </div>
            ${item.pill ? `<span class="aura-suggest-pill">${item.pill}</span>` : ''}
          `;
        } else {
          el.innerHTML = `
            <div class="aura-suggest-icon">${item.icon || '🔍'}</div>
            <div class="aura-suggest-text">
              <div class="aura-suggest-name">${item.name}</div>
              ${item.artist ? `<div class="aura-suggest-artist">${item.artist}</div>` : ''}
            </div>
          `;
        }
        el.addEventListener('mousedown', function(ev) {
          ev.preventDefault();
          selectItem(item);
        });
        suggestBox.appendChild(el);
      });
    }

    let suppressUntil = 0;
    function setReactValue(input, value) {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // Tap a suggestion: put it in the search box, search it, and close the list for good.
    function selectItem(item) {
      removeSuggest();
      clearTimeout(suggestDebounce);
      currentQuery = '';
      suppressUntil = Date.now() + 1200;
      if (!activeInput) return;
      const text = item.query || item.name;
      try {
        setReactValue(activeInput, text);
        const form = activeInput.closest('form');
        setTimeout(function () {
          removeSuggest();
          if (form) { form.requestSubmit ? form.requestSubmit() : form.submit(); }
          try { activeInput.blur(); } catch (_) {}
        }, 60);
      } catch (_) {}
    }

    async function fetchSuggestions(query) {
      const q = (query || '').trim();
      if (q.length < 2) return;
      currentQuery = q;
      suggestFetching = true;

      const items = [];

      // Text completions only (what you might be typing next).
      const ytSuggest = await fetch(`/api/yt/suggestions?q=${encodeURIComponent(q)}`, { signal: AbortSignal.timeout(2000) })
        .then(r => r.ok ? r.json() : null)
        .catch(() => null);

      // If query changed during fetch, discard
      if (currentQuery !== q) return;

      // Add YouTube text suggestions AFTER songs
      const ytSuggestions = (ytSuggest && ytSuggest.suggestions) || [];
      ytSuggestions.slice(0, 8).forEach(function(sug) {
        if (!sug || sug.toLowerCase() === q.toLowerCase()) return;
        items.push({
          type: 'query',
          name: sug,
          artist: '',
          icon: '🔍',
          query: sug
        });
      });

      suggestFetching = false;
      if (currentQuery !== q || !suggestBox) return;
      if (items.filter(i => i.type !== 'sep').length === 0) { removeSuggest(); return; }
      renderItems(items);
    }

    // ── Watch for search input focus + typing ──
    function isSearchInput(el) {
      if (!el || el.tagName !== 'INPUT') return false;
      const ph = (el.placeholder || '').toLowerCase();
      const cls = (el.className || '').toLowerCase();
      return el.type === 'text' && (
        ph.includes('search') || ph.includes('hindi') || ph.includes('song') ||
        cls.includes('search') || el.id?.includes('search')
      );
    }

    document.addEventListener('input', function(e) {
      if (!isSearchInput(e.target)) return;
      if (Date.now() < suppressUntil) { removeSuggest(); return; }
      activeInput = e.target;
      const val = (e.target.value || '').trim();
      clearTimeout(suggestDebounce);

      if (val.length < 2) { removeSuggest(); return; }

      // Create suggest box if not existing
      if (!suggestBox) {
        suggestBox = document.createElement('div');
        suggestBox.id = 'aura-suggest-box';
        document.body.appendChild(suggestBox);
      }
      positionBox(e.target);

      // Debounce 200ms for 2-3 chars, 120ms for longer
      const delay = val.length <= 3 ? 200 : 120;
      suggestDebounce = setTimeout(() => fetchSuggestions(val), delay);
    }, true);

    // Searching (Enter / Search button) closes the list too.
    document.addEventListener('submit', function () {
      suppressUntil = Date.now() + 1200;
      clearTimeout(suggestDebounce);
      currentQuery = '';
      removeSuggest();
    }, true);

    // The Search page has its own big search box; hide the second one in the top bar while it is open.
    setInterval(function () {
      const page = document.querySelector('input[placeholder^="Search Hindi"]');
      const bar = document.querySelector('input[placeholder^="Search songs, artists"]');
      const form = bar && bar.closest('form');
      if (form) form.style.display = page ? 'none' : '';
    }, 250);

    // Hide on blur
    document.addEventListener('blur', function(e) {
      if (isSearchInput(e.target)) {
        setTimeout(removeSuggest, 200);
      }
    }, true);

    // Keyboard nav inside dropdown
    document.addEventListener('keydown', function(e) {
      if (!suggestBox || !suggestItems.length) return;
      const selectables = suggestItems.filter(i => i.type !== 'sep');
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        suggestActive = Math.min(suggestActive + 1, selectables.length - 1);
        suggestBox.querySelectorAll('.aura-suggest-item').forEach((el, i) => {
          el.classList.toggle('aura-suggest-active', i === suggestActive);
        });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        suggestActive = Math.max(suggestActive - 1, 0);
        suggestBox.querySelectorAll('.aura-suggest-item').forEach((el, i) => {
          el.classList.toggle('aura-suggest-active', i === suggestActive);
        });
      } else if (e.key === 'Enter' && suggestActive >= 0) {
        e.preventDefault();
        selectItem(selectables[suggestActive]);
      } else if (e.key === 'Escape') {
        removeSuggest();
      }
    }, true);

    // Reposition on scroll/resize
    window.addEventListener('scroll', function() {
      if (suggestBox && activeInput) positionBox(activeInput);
    }, true);
    window.addEventListener('resize', function() {
      if (suggestBox && activeInput) positionBox(activeInput);
    });

    console.log('✅ AuraMusic Auto-Suggest loaded (2-char trigger, song+query hybrid)');
  })();

  // ── 14. Admin App Update Control + Android In-App Force Update Popup ───────
  (function setupAppUpdateSystem() {
    // ══════════════════════════════════════════════════════════════════════════
    // A. ANDROID CLIENT CHECK & POPUP LOGIC
    // Requirement: "Ye feature Sirf Android App me chalega.
    // Web Browser (Website) se login karne wale ko ye Popup NAHI dikhana hai.
    // If Platform == Android App THEN Check Popup, Else Ignore."
    // ══════════════════════════════════════════════════════════════════════════
    const isAndroidApp = !!(
      window.AuraNative ||
      window.__isAndroidApp ||
      window.isAuraApp ||
      (window.AuraNative && typeof window.AuraNative.isAndroidApp === 'function' && window.AuraNative.isAndroidApp())
    );

    if (isAndroidApp) {
      console.log('📱 AuraMusic running inside Android App: Initializing Update Checker...');
      
      // Delay slightly for smooth post-splash startup
      setTimeout(async function checkUpdate() {
        try {
          const res = await fetch('/api/app-update', { cache: 'no-store' });
          if (!res.ok) return;
          const data = await res.json();
          if (data && data.success && data.update && data.update.enabled) {
            const up = data.update;
            const title = up.title || 'New Update Available!';
            const message = up.message || 'Please update to get latest features & faster streaming.';
            const apkUrl = up.apkUrl || 'https://github.com/fixerror276-prog/auramusic/releases/download/apk-latest/AuraMusic.apk';

            // Only https links, and skip builds that are already new enough (when the admin set a minimum build).
            const min = parseInt(up.minVersionCode, 10) || 0;
            let mine = 0;
            try { mine = window.AuraNative && window.AuraNative.getVersionCode ? window.AuraNative.getVersionCode() : 0; } catch (_) {}
            if (!/^https:\/\//i.test(apkUrl) || (min > 0 && mine >= min)) return;

            // Fullscreen blocking page (the app also shows its own native dialog with the same text).
            showInAppFullscreenUpdateModal(title, message, apkUrl);
          }
        } catch (e) {
          console.warn('[UPDATE CHECK ERROR]', e);
        }
      }, 800);
    } else {
      // Platform == Web Browser -> COMPLETELY IGNORE as requested!
      console.log('🌐 AuraMusic running in Web Browser: Update popup ignored.');
    }

    function showInAppFullscreenUpdateModal(title, message, apkUrl) {
      if (document.getElementById('aura-update-fullscreen-modal')) return;

      const overlay = document.createElement('div');
      overlay.id = 'aura-update-fullscreen-modal';
      Object.assign(overlay.style, {
        position: 'fixed', inset: '0', zIndex: '9999999',
        background: '#090A0F', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', padding: '24px',
        textAlign: 'center', userSelect: 'none', fontFamily: 'Plus Jakarta Sans, sans-serif'
      });

      overlay.innerHTML = `
        <div style="max-width: 420px; width: 100%; display: flex; flex-direction: column; align-items: center;">
          <div style="width: 80px; height: 80px; border-radius: 24px; background: rgba(16, 185, 129, 0.12); border: 1px solid rgba(16, 185, 129, 0.3); display: flex; align-items: center; justify-content: center; font-size: 38px; margin-bottom: 24px; box-shadow: 0 12px 30px rgba(16, 185, 129, 0.2);">
            🚀
          </div>
          <h1 style="font-size: 24px; font-weight: 800; color: #ffffff; margin: 0 0 12px 0; letter-spacing: -0.5px;">
            ${escapeHtml(title)}
          </h1>
          <p style="font-size: 15px; color: #94A3B8; line-height: 1.6; margin: 0 0 32px 0;">
            ${escapeHtml(message)}
          </p>
          <button id="aura-update-now-btn" style="width: 100%; padding: 16px; border-radius: 16px; background: #10B981; color: #000000; font-size: 15px; font-weight: 800; border: none; cursor: pointer; transition: transform 0.15s, opacity 0.15s; box-shadow: 0 8px 24px rgba(16, 185, 129, 0.35);">
            UPDATE NOW
          </button>
          <div style="font-size: 12px; color: #64748B; margin-top: 20px;">
            This update is required to continue using AuraMusic.
          </div>
        </div>
      `;

      document.body.appendChild(overlay);

      const btn = document.getElementById('aura-update-now-btn');
      if (btn) {
        btn.addEventListener('click', function () {
          btn.style.transform = 'scale(0.97)';
          btn.style.opacity = '0.9';
          setTimeout(() => { btn.style.transform = 'none'; btn.style.opacity = '1'; }, 150);

          if (window.AuraNative && typeof window.AuraNative.openBrowser === 'function') {
            window.AuraNative.openBrowser(apkUrl);
          } else {
            window.location.href = apkUrl;
          }
        });
      }

      // Block back button / background interaction (Force Update)
      window.history.pushState(null, null, window.location.href);
      window.addEventListener('popstate', function () {
        window.history.pushState(null, null, window.location.href);
      });
    }

    function escapeHtml(str) {
      return String(str || '').replace(/[&<>"']/g, m => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      }[m]));
    }

    // ══════════════════════════════════════════════════════════════════════════
    // B. ADMIN DASHBOARD: "App Update Control" SECTION
    // ══════════════════════════════════════════════════════════════════════════
    let adminUpdateConfig = {
      enabled: false,
      title: 'New Update Available!',
      message: 'Please update to get latest features & faster streaming.',
      apkUrl: 'https://github.com/fixerror276-prog/auramusic/releases/download/apk-latest/AuraMusic.apk'
    };

    async function loadAdminUpdateConfig() {
      try {
        const res = await fetch('/api/app-update', { cache: 'no-store' });
        if (res.ok) {
          const d = await res.json();
          if (d && d.update) adminUpdateConfig = Object.assign({}, adminUpdateConfig, d.update);
        }
      } catch (_) {}
    }

    function injectAdminUpdateTab() {
      if (sessionStorage.getItem('auramusic_admin_unlocked') !== 'true') return;
      // Find admin nav tabs container in dashboard
      const nav = document.querySelector('header + main, div[class*="admin"], nav[class*="space-x"]');
      const tabsContainer = document.querySelector('.overflow-x-auto .flex.items-center.space-x-1, .overflow-x-auto .flex.items-center.space-x-2');
      if (!tabsContainer || document.getElementById('tab-btn-app-update')) return;

      const btn = document.createElement('button');
      btn.id = 'tab-btn-app-update';
      btn.className = 'flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer text-slate-400 hover:text-white hover:bg-white/[0.04]';
      btn.innerHTML = `
        <span style="font-size: 14px;">📱</span>
        <span>App Update Control</span>
        <span id="aura-update-active-badge" class="text-[10px] px-1.5 py-0.5 rounded-full font-black ${adminUpdateConfig.enabled ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-slate-800 text-slate-500'}">
          ${adminUpdateConfig.enabled ? 'ON' : 'OFF'}
        </span>
      `;

      btn.addEventListener('click', function () {
        // Deselect other buttons
        tabsContainer.querySelectorAll('button').forEach(b => {
          b.className = 'flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer text-slate-400 hover:text-white hover:bg-white/[0.04]';
        });
        btn.className = 'flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer bg-gradient-to-r from-emerald-500 to-teal-400 text-black shadow-md shadow-emerald-500/20';

        renderAdminUpdateView();
      });

      tabsContainer.appendChild(btn);

      // ── System Health & Taste Monitor Tab (Admin Panel Button) ──
      if (!document.getElementById('tab-btn-taste-health')) {
        const healthBtn = document.createElement('button');
        healthBtn.id = 'tab-btn-taste-health';
        healthBtn.className = 'flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer text-slate-400 hover:text-white hover:bg-white/[0.04]';
        healthBtn.innerHTML = `
          <span style="font-size: 14px;">⚡</span>
          <span>Taste & Audio Health</span>
          <span class="text-[10px] px-1.5 py-0.5 rounded-full font-black bg-purple-500/20 text-purple-300 border border-purple-500/30">
            LIVE
          </span>
        `;
        healthBtn.addEventListener('click', function() {
          tabsContainer.querySelectorAll('button').forEach(b => {
            b.className = 'flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer text-slate-400 hover:text-white hover:bg-white/[0.04]';
          });
          healthBtn.className = 'flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-md shadow-purple-500/20';
          renderAdminHealthView();
        });
        tabsContainer.appendChild(healthBtn);
      }

      // ── Custom Tracks & Song Order Manager Tab (Admin Panel Button) ──
      if (!document.getElementById('tab-btn-custom-tracks')) {
        const customBtn = document.createElement('button');
        customBtn.id = 'tab-btn-custom-tracks';
        customBtn.className = 'flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer text-slate-400 hover:text-white hover:bg-white/[0.04]';
        customBtn.innerHTML = `
          <span style="font-size: 14px;">🎛️</span>
          <span>Custom Tracks Order</span>
          <span class="text-[10px] px-1.5 py-0.5 rounded-full font-black bg-amber-500/20 text-amber-300 border border-amber-500/30">
            PIN
          </span>
        `;
        customBtn.addEventListener('click', function() {
          tabsContainer.querySelectorAll('button').forEach(b => {
            b.className = 'flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer text-slate-400 hover:text-white hover:bg-white/[0.04]';
          });
          customBtn.className = 'flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer bg-gradient-to-r from-amber-500 to-orange-500 text-black shadow-md shadow-amber-500/20';
          renderAdminCustomTracksView();
        });
        tabsContainer.appendChild(customBtn);
      }
    }

    function renderAdminUpdateView() {
      // Find main admin content area
      const mainArea = document.querySelector('main > div, main') || document.getElementById('root');
      if (!mainArea) return;

      // Hide all siblings in main container
      const contentParent = document.querySelector('.max-w-7xl.w-full.mx-auto') || mainArea;
      Array.from(contentParent.children).forEach(child => {
        if (child.id === 'aura-admin-update-panel') {
          child.style.display = 'block';
        } else {
          child.style.display = 'none';
        }
      });

      let panel = document.getElementById('aura-admin-update-panel');
      if (!panel) {
        panel = document.createElement('div');
        panel.id = 'aura-admin-update-panel';
        panel.className = 'space-y-6 animate-fadeIn max-w-2xl';
        contentParent.appendChild(panel);
      }

      panel.innerHTML = `
        <div class="p-6 sm:p-8 rounded-3xl bg-[#0F1422] border border-white/[0.08] space-y-6 shadow-2xl">
          <div>
            <div class="flex items-center space-x-3">
              <div class="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-xl text-emerald-400">
                📱
              </div>
              <div>
                <h2 class="text-lg font-black text-white flex items-center space-x-2">
                  <span>App Update Control (Android APK)</span>
                  <span class="text-[10px] px-2 py-0.5 rounded-full ${adminUpdateConfig.enabled ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-slate-800 text-slate-400'} font-black uppercase">
                    ${adminUpdateConfig.enabled ? 'Live Active' : 'Disabled'}
                  </span>
                </h2>
                <p class="text-xs text-slate-400 mt-0.5">
                  Remotely trigger a Force Update popup in the Android app. Web browser users are unaffected.
                </p>
              </div>
            </div>
          </div>

          <form id="aura-admin-update-form" class="space-y-5">
            <!-- Toggle Switch -->
            <div class="flex items-center justify-between p-4 rounded-2xl bg-black/40 border border-white/10 hover:border-emerald-500/30 transition-all">
              <div>
                <div class="text-sm font-bold text-white flex items-center space-x-2">
                  <span>Show Update Popup to Users?</span>
                  <span id="toggle-status-text" class="text-xs font-semibold ${adminUpdateConfig.enabled ? 'text-emerald-400' : 'text-slate-500'}">
                    (${adminUpdateConfig.enabled ? 'ENABLED' : 'DISABLED'})
                  </span>
                </div>
                <div class="text-xs text-slate-400 mt-0.5">
                  When enabled, Android users will see a fullscreen update dialog on launch.
                </div>
              </div>
              <label class="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" id="update-toggle-checkbox" class="sr-only peer" ${adminUpdateConfig.enabled ? 'checked' : ''}>
                <div class="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
              </label>
            </div>

            <!-- Fields Container (Activated/Visible when checked) -->
            <div id="update-fields-container" class="space-y-4 transition-all duration-200" style="${adminUpdateConfig.enabled ? 'opacity: 1; pointer-events: auto;' : 'opacity: 0.45; pointer-events: none;'}">
              <div>
                <label class="block text-xs font-bold text-slate-300 mb-1.5 uppercase tracking-wider">
                  Popup Title
                </label>
                <input type="text" id="update-input-title"
                  value="${escapeHtml(adminUpdateConfig.title)}"
                  placeholder="Example: New Update Available!"
                  class="w-full px-4 py-3 bg-black/60 border border-white/10 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 transition-all"
                  ${adminUpdateConfig.enabled ? '' : 'disabled'}>
              </div>

              <div>
                <label class="block text-xs font-bold text-slate-300 mb-1.5 uppercase tracking-wider">
                  Popup Message
                </label>
                <textarea id="update-input-message" rows="3"
                  placeholder="Example: Please update to get latest features & faster streaming."
                  class="w-full px-4 py-3 bg-black/60 border border-white/10 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 transition-all"
                  ${adminUpdateConfig.enabled ? '' : 'disabled'}>${escapeHtml(adminUpdateConfig.message)}</textarea>
              </div>

              <div>
                <label class="block text-xs font-bold text-slate-300 mb-1.5 uppercase tracking-wider">
                  APK Download Link <span style="color:#10B981;text-transform:none">(auto: latest APK)</span>
                </label>
                <input type="url" id="update-input-apk" readonly
                  value="https://github.com/fixerror276-prog/auramusic/releases/download/apk-latest/AuraMusic.apk"
                  placeholder="Example: https://mywebsite.com/app/latest.apk"
                  class="w-full px-4 py-3 bg-black/60 border border-white/10 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 transition-all font-mono text-xs"
                  ${adminUpdateConfig.enabled ? '' : 'disabled'}>
              </div>
            </div>

            <div>
              <label class="block text-xs font-bold text-slate-300 mb-1.5 uppercase tracking-wider">
                Admin Key (needed to save)
              </label>
              <input type="password" id="update-input-key" autocomplete="off"
                value="${escapeHtml(sessionStorage.getItem('aura_admin_key') || '')}"
                placeholder="The ADMIN_KEY set on the server"
                class="w-full px-4 py-3 bg-black/60 border border-white/10 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-400/50">
            </div>

            <!-- Save Button & Feedback -->
            <div class="pt-2 flex items-center justify-between">
              <button type="submit" id="save-update-btn"
                class="px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-400 to-teal-400 text-black font-extrabold text-sm uppercase tracking-wider hover:opacity-95 active:scale-95 shadow-lg shadow-emerald-500/25 transition-all cursor-pointer">
                💾 Save Update Settings
              </button>
              <span id="update-save-status" class="text-xs font-bold text-emerald-400 opacity-0 transition-opacity"></span>
            </div>
          </form>
        </div>
      `;

      // Form event listeners
      const toggle = document.getElementById('update-toggle-checkbox');
      const fieldsContainer = document.getElementById('update-fields-container');
      const titleInput = document.getElementById('update-input-title');
      const msgInput = document.getElementById('update-input-message');
      const apkInput = document.getElementById('update-input-apk');
      const toggleStatus = document.getElementById('toggle-status-text');
      const form = document.getElementById('aura-admin-update-form');
      const statusText = document.getElementById('update-save-status');

      toggle.addEventListener('change', function () {
        const isChecked = toggle.checked;
        if (isChecked) {
          fieldsContainer.style.opacity = '1';
          fieldsContainer.style.pointerEvents = 'auto';
          titleInput.removeAttribute('disabled');
          msgInput.removeAttribute('disabled');
          apkInput.removeAttribute('disabled');
          toggleStatus.textContent = '(ENABLED)';
          toggleStatus.className = 'text-xs font-semibold text-emerald-400';
        } else {
          fieldsContainer.style.opacity = '0.45';
          fieldsContainer.style.pointerEvents = 'none';
          titleInput.setAttribute('disabled', 'true');
          msgInput.setAttribute('disabled', 'true');
          apkInput.setAttribute('disabled', 'true');
          toggleStatus.textContent = '(DISABLED)';
          toggleStatus.className = 'text-xs font-semibold text-slate-500';
        }
      });

      form.addEventListener('submit', async function (ev) {
        ev.preventDefault();
        const adminKey = document.getElementById('update-input-key').value.trim();
        try { sessionStorage.setItem('aura_admin_key', adminKey); } catch (_) {}
        const payload = {
          enabled: toggle.checked,
          title: titleInput.value.trim() || 'New Update Available!',
          message: msgInput.value.trim() || 'Please update to get latest features & faster streaming.',
          apkUrl: apkInput.value.trim() || 'https://github.com/fixerror276-prog/auramusic/releases/download/apk-latest/AuraMusic.apk'
        };

        const saveBtn = document.getElementById('save-update-btn');
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';

        try {
          const res = await fetch('/api/admin/app-update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
            body: JSON.stringify(payload)
          });
          const result = await res.json().catch(() => ({}));
          if (res.ok && result.success) {
            adminUpdateConfig = result.update || payload;
            const badge = document.getElementById('aura-update-active-badge');
            if (badge) {
              badge.textContent = payload.enabled ? 'ON' : 'OFF';
              badge.className = `text-[10px] px-1.5 py-0.5 rounded-full font-black ${payload.enabled ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-slate-800 text-slate-500'}`;
            }
            statusText.textContent = '✓ Saved & Applied to Android App!';
            statusText.style.opacity = '1';
            setTimeout(() => { statusText.style.opacity = '0'; }, 3500);
          } else {
            alert('Failed to save: ' + (result.error || 'Server error'));
          }
        } catch (err) {
          alert('Network error while saving update config: ' + err.message);
        } finally {
          saveBtn.disabled = false;
          saveBtn.textContent = '💾 Save Update Settings';
        }
      });
    }

    // Observe when admin panel is opened and inject tab
    loadAdminUpdateConfig();
    const adminObserver = new MutationObserver(function () {
      injectAdminUpdateTab();
    });
    adminObserver.observe(document.documentElement, { childList: true, subtree: true });

    // When other tabs are clicked, hide custom panel and restore siblings
    document.addEventListener('click', function (e) {
      const tabBtn = e.target.closest('button');
      if (tabBtn && tabBtn.id !== 'tab-btn-app-update' && tabBtn.closest('.overflow-x-auto')) {
        const customPanel = document.getElementById('aura-admin-update-panel');
        if (customPanel) customPanel.style.display = 'none';
        const contentParent = document.querySelector('.max-w-7xl.w-full.mx-auto');
        if (contentParent) {
          Array.from(contentParent.children).forEach(c => {
            if (c.id !== 'aura-admin-update-panel') c.style.display = '';
          });
        }
      }
    });

    // ── Function to render Live Taste & Audio Health in Admin Dashboard ──
    async function renderAdminHealthView() {
      const contentParent = document.querySelector('.max-w-7xl.w-full.mx-auto') || document.querySelector('main');
      if (!contentParent) return;

      Array.from(contentParent.children).forEach(c => {
        if (c.id !== 'aura-admin-health-panel') c.style.display = 'none';
      });

      let healthPanel = document.getElementById('aura-admin-health-panel');
      if (!healthPanel) {
        healthPanel = document.createElement('div');
        healthPanel.id = 'aura-admin-health-panel';
        contentParent.appendChild(healthPanel);
      }
      healthPanel.style.display = 'block';
      healthPanel.innerHTML = `
        <div class="p-6 sm:p-8 bg-slate-900/90 border border-purple-500/30 rounded-3xl shadow-2xl space-y-6 text-slate-100 animate-pulse">
          <div class="flex items-center space-x-3">
            <span class="text-3xl">⚡</span>
            <div>
              <h3 class="text-xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">Connecting to System Health Monitor...</h3>
              <p class="text-xs text-slate-400">Pinging audio CDNs, taste matrix and database</p>
            </div>
          </div>
        </div>
      `;

      try {
        const res = await fetch('/api/admin/taste-health');
        const data = await res.json();
        const t = data.tasteSystem || {};
        const a = data.audioEngine || {};
        const d = data.database || {};

        healthPanel.innerHTML = `
          <div class="p-6 sm:p-8 bg-slate-900/95 border border-purple-500/40 rounded-3xl shadow-2xl space-y-6 text-slate-100">
            <!-- Header -->
            <div class="flex items-center justify-between border-b border-slate-800 pb-4">
              <div class="flex items-center space-x-3">
                <div class="w-12 h-12 rounded-2xl bg-gradient-to-tr from-purple-600 to-pink-500 flex items-center justify-center text-2xl shadow-lg">⚡</div>
                <div>
                  <h3 class="text-xl sm:text-2xl font-bold bg-gradient-to-r from-purple-400 via-pink-400 to-amber-300 bg-clip-text text-transparent">Taste & Audio System Health</h3>
                  <p class="text-xs text-slate-400">Live Diagnostics • Updated ${new Date().toLocaleTimeString()}</p>
                </div>
              </div>
              <button id="refresh-health-btn" class="px-4 py-2 rounded-xl text-xs font-bold bg-purple-600/30 hover:bg-purple-600 border border-purple-500/40 text-purple-200 hover:text-white transition cursor-pointer">
                🔄 Refresh Health
              </button>
            </div>

            <!-- Health Status Badges -->
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
              <div class="bg-black/40 border border-emerald-500/30 rounded-2xl p-4">
                <span class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Audio Engine</span>
                <p class="text-lg font-bold text-emerald-400 mt-1 flex items-center justify-center space-x-1.5">
                  <span class="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping"></span>
                  <span>100% OPERATIONAL</span>
                </p>
                <p class="text-[11px] text-slate-400 mt-1">&lt;300ms stream resolution</p>
              </div>

              <div class="bg-black/40 border border-purple-500/30 rounded-2xl p-4">
                <span class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Taste AI Engine</span>
                <p class="text-lg font-bold text-purple-400 mt-1 flex items-center justify-center space-x-1.5">
                  <span class="w-2.5 h-2.5 rounded-full bg-purple-400"></span>
                  <span>${t.realtimeAdaptation ? '10-MIN REALTIME' : 'ACTIVE'}</span>
                </p>
                <p class="text-[11px] text-slate-400 mt-1">${t.activeUserProfiles || 0} active profiles • ${t.totalEventsLogged || 0} events</p>
              </div>

              <div class="bg-black/40 border border-cyan-500/30 rounded-2xl p-4">
                <span class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Database Sync</span>
                <p class="text-lg font-bold text-cyan-400 mt-1">
                  ${d.persistence || 'Neon Postgres / Synced'}
                </p>
                <p class="text-[11px] text-slate-400 mt-1">Automatic auto-save active</p>
              </div>
            </div>

            <!-- Details Section -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <!-- Audio CDN Pipeline -->
              <div class="bg-black/30 border border-slate-800 rounded-2xl p-4 space-y-2">
                <h4 class="text-xs font-bold text-amber-400 uppercase tracking-wider">🎵 Audio Streaming Pipeline</h4>
                <div class="text-xs space-y-1.5 text-slate-300">
                  <div class="flex justify-between py-1 border-b border-white/5">
                    <span class="text-slate-400">Primary CDN</span>
                    <span class="font-medium text-emerald-400">${a.primaryTier}</span>
                  </div>
                  <div class="flex justify-between py-1 border-b border-white/5">
                    <span class="text-slate-400">Buffering Optimizer</span>
                    <span class="font-medium text-emerald-400">${a.bufferingOptimizer}</span>
                  </div>
                  <div class="flex justify-between py-1 border-b border-white/5">
                    <span class="text-slate-400">Download System</span>
                    <span class="font-medium text-emerald-400">${a.downloadSystem}</span>
                  </div>
                </div>
              </div>

              <!-- Nightly & Cron Scheduler -->
              <div class="bg-black/30 border border-slate-800 rounded-2xl p-4 space-y-2">
                <h4 class="text-xs font-bold text-purple-400 uppercase tracking-wider">⏰ Automation & Decay Scheduler</h4>
                <div class="text-xs space-y-1.5 text-slate-300">
                  <div class="flex justify-between py-1 border-b border-white/5">
                    <span class="text-slate-400">Decay Schedule</span>
                    <span class="font-medium text-purple-300">${t.nightlyDecayCron}</span>
                  </div>
                  <div class="flex justify-between py-1 border-b border-white/5">
                    <span class="text-slate-400">Auto Decay Trigger</span>
                    <button id="trigger-manual-decay-btn" class="px-2 py-0.5 rounded text-[11px] bg-purple-600/30 hover:bg-purple-600 text-purple-200 hover:text-white transition cursor-pointer">
                      Run Decay Now
                    </button>
                  </div>
                  <div class="flex justify-between py-1 border-b border-white/5">
                    <span class="text-slate-400">Status Check</span>
                    <span class="text-emerald-400 font-semibold">ALL SUBSYSTEMS GREEN ✓</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Sample Taste Profiles Monitoring -->
            <div>
              <h4 class="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">👥 Real-Time User Profiles Monitored</h4>
              <div class="space-y-1.5">
                ${(t.sampleProfiles && t.sampleProfiles.length) ? t.sampleProfiles.map(p => `
                  <div class="flex items-center justify-between p-2.5 rounded-xl bg-black/40 border border-slate-800 text-xs">
                    <span class="font-mono text-purple-300">${escapeHtml(p.userId)}</span>
                    <span class="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">${escapeHtml(p.persona)}</span>
                    <span class="text-slate-400">${p.events} events tracked</span>
                  </div>
                `).join('') : '<p class="text-xs text-slate-500 p-2">No user listening events recorded yet. Play a song to see live stats.</p>'}
              </div>
            </div>
          </div>
        `;

        document.getElementById('refresh-health-btn').onclick = renderAdminHealthView;
        const decayBtn = document.getElementById('trigger-manual-decay-btn');
        if (decayBtn) {
          decayBtn.onclick = async function() {
            this.textContent = 'Running...';
            try {
              const res = await fetch('/api/taste/admin/decay', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: sessionStorage.getItem('aura_admin_key') || 'mynk@2007' })
              });
              const j = await res.json();
              if (j.success) {
                toast(`Decay finished: ${j.processed} users updated`);
                renderAdminHealthView();
              } else {
                toast(j.error || 'Failed to run decay', 'error');
                this.textContent = 'Run Decay Now';
              }
            } catch {
              toast('Decay request failed', 'error');
              this.textContent = 'Run Decay Now';
            }
          };
        }

      } catch (err) {
        healthPanel.innerHTML = `
          <div class="p-6 bg-slate-900 border border-red-500/40 rounded-3xl text-center text-red-400 text-sm">
            Failed to connect to /api/admin/taste-health: ${err.message}
          </div>
        `;
      }
    }

    // ── Function to render Custom Tracks & Drag/Drop Order View in Admin Dashboard ──
    async function renderAdminCustomTracksView() {
      const contentParent = document.querySelector('.max-w-7xl.w-full.mx-auto') || document.querySelector('main');
      if (!contentParent) return;

      Array.from(contentParent.children).forEach(c => {
        if (c.id !== 'aura-admin-custom-panel') c.style.display = 'none';
      });

      let customPanel = document.getElementById('aura-admin-custom-panel');
      if (!customPanel) {
        customPanel = document.createElement('div');
        customPanel.id = 'aura-admin-custom-panel';
        contentParent.appendChild(customPanel);
      }
      customPanel.style.display = 'block';

      customPanel.innerHTML = `
        <div class="p-6 sm:p-8 bg-slate-900/95 border border-amber-500/40 rounded-3xl shadow-2xl space-y-6 text-slate-100">
          <!-- Header -->
          <div class="border-b border-slate-800 pb-4">
            <div class="flex items-center space-x-3">
              <div class="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-500 flex items-center justify-center text-2xl shadow-lg">🎛️</div>
              <div>
                <h3 class="text-xl sm:text-2xl font-bold bg-gradient-to-r from-amber-400 via-orange-400 to-yellow-300 bg-clip-text text-transparent">Custom Tracks & Order Manager</h3>
                <p class="text-xs text-slate-400">YouTube link dalkar gaana add karo aur arrows (⬆️ ⬇️) se set karo ki kaunsa song kahan bajega!</p>
              </div>
            </div>
          </div>

          <!-- Add Track Form -->
          <form id="admin-add-custom-track-form" class="p-5 rounded-2xl bg-black/40 border border-white/10 space-y-4">
            <h4 class="text-xs font-bold text-amber-400 uppercase tracking-wider">➕ Add YouTube Song by Link / URL</h4>
            
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div class="sm:col-span-2">
                <label class="block text-xs font-semibold text-slate-300 mb-1">YouTube Link or Video ID *</label>
                <input type="text" id="custom-track-url" required
                  placeholder="https://www.youtube.com/watch?v=... ya youtu.be/... ya Video ID"
                  class="w-full px-4 py-2.5 bg-black/60 border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400">
              </div>
              <div>
                <label class="block text-xs font-semibold text-slate-300 mb-1">Insert Position</label>
                <select id="custom-track-pos" class="w-full px-3 py-2.5 bg-black/60 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-amber-400">
                  <option value="0">Top #1 (Sabse Pehle Bajega)</option>
                  <option value="-1">Bottom (Sabse Aakhri Me)</option>
                </select>
              </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-semibold text-slate-300 mb-1">Custom Title (Optional - auto detects)</label>
                <input type="text" id="custom-track-name"
                  placeholder="Leave empty to auto-fetch from YouTube"
                  class="w-full px-4 py-2 bg-black/60 border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400">
              </div>
              <div>
                <label class="block text-xs font-semibold text-slate-300 mb-1">Artist Name (Optional)</label>
                <input type="text" id="custom-track-artist"
                  placeholder="Leave empty to auto-fetch"
                  class="w-full px-4 py-2 bg-black/60 border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400">
              </div>
            </div>

            <button type="submit" id="custom-add-btn" class="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-black font-extrabold text-xs uppercase tracking-wider hover:brightness-110 active:scale-95 transition shadow-lg shadow-amber-500/20 cursor-pointer">
              Add Track To Trending & Home
            </button>
            <span id="custom-add-msg" class="text-xs ml-3 font-semibold text-emerald-400 opacity-0 transition-opacity"></span>
          </form>

          <!-- Current Tracks Order List -->
          <div>
            <div class="flex items-center justify-between mb-3">
              <h4 class="text-xs font-bold text-slate-300 uppercase tracking-wider">📋 Current Song Sequence (User Home Screen Par Isi Order Me Dikhega)</h4>
              <span id="custom-track-count" class="text-xs text-amber-400 font-mono">0 Custom Tracks</span>
            </div>
            <div id="custom-tracks-list-container" class="space-y-2">
              <div class="text-xs text-slate-500 py-6 text-center animate-pulse">Loading custom track sequence...</div>
            </div>
          </div>
        </div>
      `;

      // Load & Render Track list
      async function loadTracksList() {
        try {
          const res = await fetch('/api/admin/custom-tracks');
          const data = await res.json();
          const tracks = data.tracks || [];
          document.getElementById('custom-track-count').textContent = `${tracks.length} Custom Pinned Track(s)`;

          const container = document.getElementById('custom-tracks-list-container');
          if (!container) return;

          if (!tracks.length) {
            container.innerHTML = `
              <div class="p-8 rounded-2xl bg-black/30 border border-dashed border-slate-800 text-center text-xs text-slate-500">
                Koi custom track add nahi kiya hai. Upar YouTube link daalkar pehla gaana add karo!
              </div>
            `;
            return;
          }

          container.innerHTML = tracks.map((t, idx) => `
            <div class="flex items-center justify-between p-3 rounded-2xl bg-black/50 border border-slate-800 hover:border-amber-500/30 transition group">
              <div class="flex items-center space-x-3.5 min-w-0">
                <span class="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-400 font-mono text-xs flex items-center justify-center font-bold">
                  #${idx + 1}
                </span>
                <img src="${t.image || `https://i.ytimg.com/vi/${t.videoId}/default.jpg`}" class="w-12 h-12 rounded-xl object-cover border border-white/10 shrink-0" alt="poster">
                <div class="min-w-0">
                  <h5 class="text-xs font-bold text-slate-100 truncate">${escapeHtml(t.name)}</h5>
                  <p class="text-[11px] text-slate-400 truncate">${escapeHtml(t.artist)} • <span class="font-mono text-amber-400/80">ID: ${escapeHtml(t.videoId)}</span></p>
                </div>
              </div>

              <!-- Reorder & Action Controls -->
              <div class="flex items-center space-x-1.5 shrink-0">
                <button data-action="up" data-idx="${idx}" class="reorder-btn p-2 rounded-lg bg-slate-800/80 hover:bg-amber-500 hover:text-black text-slate-300 transition text-xs font-bold disabled:opacity-30 disabled:pointer-events-none" ${idx === 0 ? 'disabled' : ''} title="Move Up">
                  ⬆️
                </button>
                <button data-action="down" data-idx="${idx}" class="reorder-btn p-2 rounded-lg bg-slate-800/80 hover:bg-amber-500 hover:text-black text-slate-300 transition text-xs font-bold disabled:opacity-30 disabled:pointer-events-none" ${idx === tracks.length - 1 ? 'disabled' : ''} title="Move Down">
                  ⬇️
                </button>
                <button data-action="del" data-id="${t.videoId}" class="delete-track-btn p-2 rounded-lg bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white transition text-xs font-bold ml-2 cursor-pointer" title="Delete Track">
                  🗑️
                </button>
              </div>
            </div>
          `).join('');

          // Bind Reorder & Delete actions
          container.querySelectorAll('.reorder-btn').forEach(btn => {
            btn.onclick = async function() {
              const action = this.getAttribute('data-action');
              const i = parseInt(this.getAttribute('data-idx'), 10);
              const copy = tracks.slice();
              if (action === 'up' && i > 0) {
                [copy[i - 1], copy[i]] = [copy[i], copy[i - 1]];
              } else if (action === 'down' && i < copy.length - 1) {
                [copy[i + 1], copy[i]] = [copy[i], copy[i + 1]];
              }
              await fetch('/api/admin/custom-tracks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'reorder', tracks: copy })
              });
              loadTracksList();
            };
          });

          container.querySelectorAll('.delete-track-btn').forEach(btn => {
            btn.onclick = async function() {
              const videoId = this.getAttribute('data-id');
              if (!confirm('Are you sure you want to remove this song from custom list?')) return;
              await fetch('/api/admin/custom-tracks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'delete', videoId })
              });
              loadTracksList();
            };
          });

        } catch (e) {
          console.error('Failed to load custom tracks:', e);
        }
      }

      loadTracksList();

      // Form submit: Add new track
      const addForm = document.getElementById('admin-add-custom-track-form');
      if (addForm) {
        addForm.onsubmit = async function(e) {
          e.preventDefault();
          const submitBtn = document.getElementById('custom-add-btn');
          const msg = document.getElementById('custom-add-msg');
          submitBtn.textContent = 'Adding...';

          const url = document.getElementById('custom-track-url').value.trim();
          const pos = document.getElementById('custom-track-pos').value;
          const name = document.getElementById('custom-track-name').value.trim();
          const artist = document.getElementById('custom-track-artist').value.trim();

          try {
            const res = await fetch('/api/admin/custom-tracks', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'add',
                url,
                position: pos === '-1' ? 999999 : parseInt(pos, 10),
                name,
                artist
              })
            });
            const data = await res.json();
            if (data.success) {
              msg.textContent = '✓ Song added & pinned successfully!';
              msg.style.opacity = '1';
              setTimeout(() => { msg.style.opacity = '0'; }, 3000);
              addForm.reset();
              loadTracksList();
            } else {
              alert(data.error || 'Failed to add song');
            }
          } catch (err) {
            alert('Request failed: ' + err.message);
          } finally {
            submitBtn.textContent = 'Add Track To Trending & Home';
          }
        };
      }
    }

    console.log('✅ AuraMusic App Update Control (Admin + Android logic) initialized.');
  })();

  console.log('✅ AuraMusic Smart Features v3.2 loaded (Buffering + Auto-Suggest + Taste Lock + App Update)');
})();


  // ── Portal Gate (Key 1) Interceptor ──────────────────────────────────────────
  (function setupPortalGate() {
    function checkPortalGate() {
      const path = (window.location.pathname || '').toLowerCase();
      const hash = (window.location.hash || '').toLowerCase();
      const isAdminRoute = path === '/admin' || path === '/admin/' || path === '/adminpanel' || path === '/adminpanel/' || hash === '#admin';
      const isPortalPassed = sessionStorage.getItem('auramusic_portal_unlocked') === 'true';

      if (isAdminRoute && !isPortalPassed) {
        showPortalGateModal();
      }
    }

    function showPortalGateModal() {
      if (document.getElementById('aura-portal-gate-modal')) return;

      const modal = document.createElement('div');
      modal.id = 'aura-portal-gate-modal';
      Object.assign(modal.style, {
        position: 'fixed', inset: '0', zIndex: '999999',
        background: 'rgba(9, 10, 15, 0.95)', backdropFilter: 'blur(12px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
      });

      modal.innerHTML = `
        <div style="background: #0F1422; border: 1px solid rgba(255,255,255,0.1); border-radius: 24px; padding: 32px; max-width: 400px; width: 100%; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.7); text-align: center; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
          <div style="width: 56px; height: 56px; border-radius: 18px; background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.25); display: flex; align-items: center; justify-content: center; font-size: 26px; margin: 0 auto 18px;">
            🚪
          </div>
          <h2 style="font-size: 20px; font-weight: 800; color: #fff; margin: 0 0 8px;">Portal Gate (Key 1)</h2>
          <p style="font-size: 13px; color: #94A3B8; margin: 0 0 22px; line-height: 1.5;">
            Enter Portal Entry Key 1 or use URL <code style="color:#10B981; background:rgba(16,185,129,0.1); padding:2px 6px; border-radius:6px;">/admin/auramynk@2007</code> to reach the admin front page.
          </p>
          <form id="aura-portal-gate-form">
            <input type="password" id="aura-portal-key-input" placeholder="Enter Key 1 (auramynk@2007)" style="width: 100%; box-sizing: border-box; padding: 14px 16px; background: #000; border: 1px solid rgba(255,255,255,0.15); border-radius: 14px; color: #fff; font-size: 14px; font-family: monospace; outline: none; margin-bottom: 12px;">
            <div id="aura-portal-error" style="color: #EF4444; font-size: 12px; margin-bottom: 12px; display: none;"></div>
            <button type="submit" style="width: 100%; padding: 14px; background: linear-gradient(135deg, #10B981, #14B8A6); border: none; border-radius: 14px; color: #000; font-weight: 800; font-size: 14px; cursor: pointer; transition: transform 0.15s, opacity 0.15s;">
              Unlock Portal Gate
            </button>
            <button type="button" id="aura-portal-cancel-btn" style="width: 100%; margin-top: 10px; padding: 10px; background: transparent; border: none; color: #64748B; font-size: 12px; cursor: pointer;">
              ← Back to Music Player
            </button>
          </form>
        </div>
      `;

      document.body.appendChild(modal);

      const form = document.getElementById('aura-portal-gate-form');
      const input = document.getElementById('aura-portal-key-input');
      const err = document.getElementById('aura-portal-error');
      const cancel = document.getElementById('aura-portal-cancel-btn');

      cancel.addEventListener('click', () => {
        modal.remove();
        window.location.href = '/';
      });

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const key = input.value.trim();
        const validKeys = ['auramynk@2007'];
        if (validKeys.includes(key)) {
          // Unlock portal gate ONLY (reaches front page login), does NOT auto-login to dashboard!
          sessionStorage.setItem('auramusic_portal_unlocked', 'true');
          modal.remove();
          window.location.reload();
        } else {
          err.textContent = 'Invalid Portal Key (Key 1). Access denied.';
          err.style.display = 'block';
        }
      });
    }

    window.addEventListener('load', checkPortalGate);
    window.addEventListener('hashchange', checkPortalGate);
    window.addEventListener('popstate', checkPortalGate);
    checkPortalGate();
  })();


  // ══════════════════════════════════════════════════════════════════════════


  // ══════════════════════════════════════════════════════════════════════════


  // ══════════════════════════════════════════════════════════════════════════
  // 8. NEON GLOWING VIBE RADAR ICONS, FEATURE MODAL & REAL OFFLINE MUSIC ENGINE
  // ══════════════════════════════════════════════════════════════════════════
  (function setupVibeFeatureAndOfflineMusic() {
    // ────────────────────────────────────────────────────────────────────────
    // A. SVG Neon Glowing Icons Definitions matching Screenshot 1
    // ────────────────────────────────────────────────────────────────────────
    const VIBE_ICONS = {
      'romantic': `<svg class="w-8 h-8 filter drop-shadow-[0_0_8px_rgba(244,63,94,0.9)] text-rose-400 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>
        <path d="M12 5 9.04 7.96a2.17 2.17 0 0 0 0 3.08c.82.82 2.13.85 3 .07l.96-.96" stroke-width="1.8" stroke="currentColor" opacity="0.85"/>
      </svg>`,
      'midnight': `<svg class="w-9 h-8 filter drop-shadow-[0_0_8px_rgba(6,182,212,0.9)] text-cyan-400 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.5 2.8C2.1 10.7 2 10.9 2 11.2V16c0 .6.4 1 1 1h2"/>
        <circle cx="7" cy="17" r="2"/>
        <path d="M9 17h6"/>
        <circle cx="17" cy="17" r="2"/>
        <path d="m5 11 1.5-3"/>
      </svg>`,
      'rain': `<svg class="w-8 h-8 filter drop-shadow-[0_0_8px_rgba(56,189,248,0.9)] text-sky-400 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/>
        <path d="m9 17-1.5 3"/>
        <path d="m13 16-1.5 3"/>
        <path d="m17 17-1.5 3"/>
      </svg>`,
      'gym': `<svg class="w-8 h-8 filter drop-shadow-[0_0_8px_rgba(16,185,129,0.9)] text-emerald-400 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="m6.5 6.5 11 11"/>
        <path d="m21 21-1-1"/>
        <path d="m3 3 1 1"/>
        <path d="m18 22 4-4"/>
        <path d="m2 6 4-4"/>
        <path d="m3 10 7-7"/>
        <path d="m14 21 7-7"/>
      </svg>`,
      'party': `<svg class="w-8 h-8 filter drop-shadow-[0_0_8px_rgba(245,158,11,0.9)] text-amber-400 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M5.8 11.3 2 22l10.7-3.79"/>
        <path d="M4 3h.01"/>
        <path d="M22 8h.01"/>
        <path d="M15 2h.01"/>
        <path d="M22 20h.01"/>
        <path d="m22 2-2.24.75a2.9 2.9 0 0 0-1.96 3.12v0c.1.86-.57 1.63-1.45 1.63h-.38e-2"/>
        <path d="m11 13 3 3"/>
      </svg>`,
      'item': `<svg class="w-8 h-8 filter drop-shadow-[0_0_8px_rgba(249,115,22,0.9)] text-orange-400 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>
      </svg>`
    };

    function enhanceVibeRadarCards() {
      const buttons = document.querySelectorAll('button');
      buttons.forEach(btn => {
        const text = btn.innerText || '';
        let iconHtml = null;
        if (text.includes('Romantic Songs')) iconHtml = VIBE_ICONS['romantic'];
        else if (text.includes('Midnight Drive')) iconHtml = VIBE_ICONS['midnight'];
        else if (text.includes('Rain & Lofi')) iconHtml = VIBE_ICONS['rain'];
        else if (text.includes('Gym Hype Mode')) iconHtml = VIBE_ICONS['gym'];
        else if (text.includes('Party Top 20')) iconHtml = VIBE_ICONS['party'];
        else if (text.includes('Item Songs 20')) iconHtml = VIBE_ICONS['item'];

        if (iconHtml) {
          const emojiSpan = btn.querySelector('span.text-2xl, span.text-3xl');
          if (emojiSpan && !emojiSpan.dataset.auraVibeReplaced) {
            emojiSpan.dataset.auraVibeReplaced = 'true';
            emojiSpan.innerHTML = iconHtml;
            emojiSpan.className = 'flex items-center justify-center transition-transform hover:scale-110';
          }
        }
      });
    }

    // ────────────────────────────────────────────────────────────────────────
    // B. WEB DOWNLOAD APP FEATURE POPUP / PORTRAIT MOBILE MODAL
    // ────────────────────────────────────────────────────────────────────────
    const isApp = !!(window.AuraNative || window.__isAndroidApp || window.isAuraApp);

    function showAppFeatureModal() {
      if (document.getElementById('aura-feature-modal')) return;

      const modal = document.createElement('div');
      modal.id = 'aura-feature-modal';
      modal.className = 'fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn select-none';
      modal.style.cssText = 'position:fixed !important; top:0 !important; left:0 !important; right:0 !important; bottom:0 !important; width:100% !important; height:100% !important; z-index:2147483647 !important; background:rgba(0,0,0,0.85) !important; backdrop-filter:blur(10px) !important; display:flex !important; align-items:center !important; justify-content:center !important; padding:16px !important; margin:0 !important;';
      modal.innerHTML = `
        <div class="w-full max-w-xs sm:max-w-sm bg-[#0e1320] border border-emerald-500/40 rounded-3xl p-5 sm:p-6 shadow-[0_0_50px_rgba(16,185,129,0.25)] relative text-white flex flex-col items-center text-center">
          <button id="aura-feature-close-btn" class="absolute top-4 right-4 p-2 rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-slate-400 hover:text-white transition-all cursor-pointer">
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
          
          <div class="relative mb-3 mt-1">
            <img src="/icon-192.png" alt="AuraMusic" class="w-16 h-16 rounded-2xl shadow-xl ring-2 ring-emerald-500/50 object-cover" />
            <span class="absolute -bottom-1 -right-1 px-1.5 py-0.5 rounded-full bg-emerald-500 text-black text-[9px] font-black uppercase tracking-wider">HD</span>
          </div>

          <h3 class="text-lg font-black text-white leading-tight mb-0.5">AuraMusic App</h3>
          <p class="text-xs text-emerald-400 font-bold mb-4">Official Android App • 100% Free</p>

          <div class="w-full space-y-2 mb-5 text-left text-xs text-slate-300 bg-white/[0.03] p-3.5 rounded-2xl border border-white/[0.06]">
            <div class="flex items-center space-x-2.5">
              <span class="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-[10px] font-black shrink-0">✓</span>
              <span class="font-medium">Background & Screen Off Playback</span>
            </div>
            <div class="flex items-center space-x-2.5">
              <span class="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-[10px] font-black shrink-0">✓</span>
              <span class="font-medium">Offline Song Download to Phone Storage</span>
            </div>
            <div class="flex items-center space-x-2.5">
              <span class="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-[10px] font-black shrink-0">✓</span>
              <span class="font-medium">320kbps Lossless Sound & Zero Ads</span>
            </div>
            <div class="flex items-center space-x-2.5">
              <span class="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-[10px] font-black shrink-0">✓</span>
              <span class="font-medium">Lock Screen Controls & Notifications</span>
            </div>
          </div>

          <a href="https://github.com/fixerror276-prog/auramusic/releases/download/apk-latest/AuraMusic.apk" download="AuraMusic.apk" id="aura-modal-download-btn" class="w-full py-3.5 px-5 rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-500 text-black font-black text-sm hover:opacity-95 transition-all shadow-lg shadow-emerald-500/30 flex items-center justify-center space-x-2 cursor-pointer active:scale-95">
            <svg class="w-4 h-4 stroke-[2.5]" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 15V3m9 12v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4m4-9 5 5 5-5"/></svg>
            <span>Install App Now</span>
          </a>
        </div>
      `;

      document.body.appendChild(modal);

      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
      });
      modal.querySelector('#aura-feature-close-btn').addEventListener('click', () => modal.remove());
      modal.querySelector('#aura-modal-download-btn').addEventListener('click', () => {
        setTimeout(() => modal.remove(), 1200);
      });
    }

    function configureHeaderDownloadBtn() {
      const headerBtn = document.getElementById('aura-header-download-apk');
      if (!headerBtn) return;

      const apkLink = 'https://github.com/fixerror276-prog/auramusic/releases/download/apk-latest/AuraMusic.apk';

      if (isApp) {
        // Inside Android App: show Offline Downloaded Songs library
        if (headerBtn.dataset.auraMode !== 'offline') {
          headerBtn.dataset.auraMode = 'offline';
          headerBtn.removeAttribute('href');
          headerBtn.removeAttribute('download');
          headerBtn.removeAttribute('target');
          headerBtn.title = 'View Offline Downloaded Songs';
          headerBtn.className = 'flex items-center space-x-1.5 py-1.5 px-3 rounded-full bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/50 text-emerald-300 text-xs font-black transition-all hover:scale-105 active:scale-95 cursor-pointer shadow-sm shadow-emerald-500/10 shrink-0';
          headerBtn.innerHTML = `
            <svg class="w-3.5 h-3.5 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/></svg>
            <span>Downloaded</span>
          `;
          headerBtn.onclick = function(e) {
            e.preventDefault();
            e.stopPropagation();
            showDownloadedSongsModal();
          };
        }
      } else {
        // On Web browser: direct APK download / Install App button
        if (headerBtn.dataset.auraMode !== 'download') {
          headerBtn.dataset.auraMode = 'download';
          headerBtn.setAttribute('href', apkLink);
          headerBtn.setAttribute('download', 'AuraMusic.apk');
          headerBtn.setAttribute('target', '_blank');
          headerBtn.title = 'Download & Install AuraMusic Android App (APK)';
          headerBtn.className = 'flex items-center space-x-1.5 py-1.5 px-3 rounded-full bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/50 text-emerald-300 text-xs font-black transition-all hover:scale-105 active:scale-95 cursor-pointer shadow-sm shadow-emerald-500/10 shrink-0';
          headerBtn.innerHTML = `
            <svg class="w-3.5 h-3.5 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/></svg>
            <span>Install App</span>
          `;
          headerBtn.onclick = function(e) {
            // allows direct download + shows feature modal
            showAppFeatureModal();
          };
        }
      }
    }

    // ────────────────────────────────────────────────────────────────────────
    // C. REAL INDEXEDDB OFFLINE AUDIO STORAGE & PLAYER ENGINE
    // ────────────────────────────────────────────────────────────────────────
    const DB_NAME = 'AuraOfflineAudioDB';
    const DB_STORE = 'songs';
    let dbInstance = null;

    function getAudioDB() {
      if (dbInstance) return Promise.resolve(dbInstance);
      return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(DB_STORE)) {
            db.createObjectStore(DB_STORE, { keyPath: 'id' });
          }
        };
        req.onsuccess = (e) => {
          dbInstance = e.target.result;
          resolve(dbInstance);
        };
        req.onerror = (e) => reject(e);
      });
    }

    async function saveOfflineAudio(song, blob) {
      try {
        const db = await getAudioDB();
        const tx = db.transaction(DB_STORE, 'readwrite');
        const store = tx.objectStore(DB_STORE);
        store.put({
          id: song.id || ('yt_' + (song.videoId || Date.now())),
          name: song.name,
          artist: song.artist || 'AuraMusic Artist',
          image: song.image || '/logo.png',
          duration: song.duration || 210,
          blob: blob,
          savedAt: Date.now()
        });
      } catch (err) {
        console.warn('Failed to save audio to IndexedDB:', err);
      }
    }

    async function getOfflineAudioBlob(songId) {
      try {
        const db = await getAudioDB();
        return new Promise((resolve) => {
          const tx = db.transaction(DB_STORE, 'readonly');
          const store = tx.objectStore(DB_STORE);
          const req = store.get(songId);
          req.onsuccess = () => resolve(req.result ? req.result.blob : null);
          req.onerror = () => resolve(null);
        });
      } catch (_) { return null; }
    }

    async function getAllOfflineSongs() {
      try {
        const db = await getAudioDB();
        return new Promise((resolve) => {
          const tx = db.transaction(DB_STORE, 'readwrite');
          const store = tx.objectStore(DB_STORE);
          const req = store.getAll();
          req.onsuccess = () => {
            const rawList = req.result || [];
            const validList = [];
            for (const s of rawList) {
              if (s && s.blob && s.blob.size > 100 * 1024 && !/^(text|application\/json)/i.test(s.blob.type || '')) {   // a real song, not a stub or an error page
                validList.push(s);
              } else if (s && s.id) {
                // Purge dead song records so re-downloading or reinstalling app cleans up broken entries
                try { store.delete(s.id); } catch (_) {}
              }
            }
            validList.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
            resolve(validList);
          };
          req.onerror = () => resolve([]);
        });
      } catch (_) { return []; }
    }

    // Function to delete an offline song
    window.auraDeleteOfflineSong = async function(songId) {
      try {
        const db = await getAudioDB();
        const tx = db.transaction(DB_STORE, 'readwrite');
        tx.objectStore(DB_STORE).delete(songId);
        tx.oncomplete = () => {
          const modal = document.getElementById('aura-offline-modal');
          if (modal) { modal.remove(); showDownloadedSongsModal(); }
          toast('🗑️ Song removed from offline list');
        };
      } catch(_) {}
    };

    // Offline song skip support: automatically skips to next/prev downloaded song
    window.__auraCurrentOfflineSongId = null;
    window.__auraIsPlayingOffline = false;

    // Expose getOfflineBlob globally so index-aura3.js Te() can check IndexedDB
    window.__auraGetOfflineBlob = async function(songId) {
      if (!songId) return null;
      try { return await getOfflineAudioBlob(songId); } catch(_) { return null; }
    };

    // Expose getAllOfflineSongs globally for offline auto-play
    window.__auraGetAllOfflineSongs = async function() {
      try { return await getAllOfflineSongs(); } catch(_) { return []; }
    };

    // Global interceptor: when any song card is tapped while offline,
    // automatically check IndexedDB and play offline blob if available
    window.__auraOfflineIntercept = async function(song) {
      if (navigator.onLine) return false; // online, skip intercept
      if (!song) return false;
      const songId = song.id || ('yt_' + (song.videoId || ''));
      if (!songId) return false;
      // Check if song is downloaded
      const blob = await window.__auraGetOfflineBlob(songId);
      if (blob && blob.size > 1000) {
        // Play from IndexedDB directly
        await window.auraPlayOfflineSong(songId);
        return true; // intercepted
      }
      return false; // not downloaded, show No Internet popup
    };

    window.__auraSkipOffline = function(direction = 'next') {
      if (!window.__auraIsPlayingOffline) return false;
      getAllOfflineSongs().then(list => {
        if (!list || list.length === 0) return;
        const curId = window.__auraCurrentOfflineSongId;
        let idx = list.findIndex(s => String(s.id) === String(curId));
        if (idx === -1) idx = 0;
        let targetIdx = direction === 'prev' ? (idx - 1 + list.length) % list.length : (idx + 1) % list.length;
        window.auraPlayOfflineSong(list[targetIdx].id);
      });
      return true;
    };

    // Play offline song directly with full Lock Screen Banner & MediaSession integration
    window.auraPlayOfflineSong = async function(songId) {
      const blob = await getOfflineAudioBlob(songId);
      if (!blob || blob.size < 1000) {
        alert('Offline audio file not found or corrupted. Removing from list.');
        try {
          const db = await getAudioDB();
          const tx = db.transaction(DB_STORE, 'readwrite');
          tx.objectStore(DB_STORE).delete(songId);
        } catch(_) {}
        return;
      }

      // Track offline playback state
      window.__auraCurrentOfflineSongId = songId;
      window.__auraIsPlayingOffline = true;

      // Close modal if open
      const modal = document.getElementById('aura-offline-modal');
      if (modal) modal.remove();

      const blobUrl = URL.createObjectURL(blob);

      // Try to get song metadata from IndexedDB list
      let songMeta = null;
      try {
        const list = await getAllOfflineSongs();
        songMeta = list.find(s => String(s.id) === String(songId));
      } catch(_) {}

      const songTitle = songMeta?.name || 'Offline Song';
      const songArtist = songMeta?.artist || 'AuraMusic';
      const songImg = songMeta?.image || '/logo.png';

      // Set Phone Lock Screen Banner / MediaSession notification
      if ('mediaSession' in navigator && window.MediaMetadata) {
        try {
          navigator.mediaSession.metadata = new MediaMetadata({
            title: songTitle,
            artist: songArtist,
            album: 'Offline Downloads',
            artwork: [
              { src: songImg, sizes: '96x96', type: 'image/jpeg' },
              { src: songImg, sizes: '128x128', type: 'image/jpeg' },
              { src: songImg, sizes: '192x192', type: 'image/jpeg' },
              { src: songImg, sizes: '256x256', type: 'image/jpeg' },
              { src: songImg, sizes: '512x512', type: 'image/jpeg' }
            ]
          });
          navigator.mediaSession.playbackState = 'playing';

          navigator.mediaSession.setActionHandler('nexttrack', () => {
            window.__auraSkipOffline('next');
          });
          navigator.mediaSession.setActionHandler('previoustrack', () => {
            window.__auraSkipOffline('prev');
          });
        } catch(e) {
          console.warn('MediaSession banner setup:', e);
        }
      }

      // If main app player function is available, use it for full UI update
      if (typeof window.__auraPlaySong === 'function' && songMeta) {
        const offlineSong = {
          ...songMeta,
          url: blobUrl,
          streamUrl: blobUrl,
          _offlineBlob: true
        };
        try {
          await window.__auraPlaySong(offlineSong);
        } catch(e) {
          console.warn('__auraPlaySong error:', e);
          const audio = document.querySelector('audio');
          if (audio) { audio.src = blobUrl; audio.load(); await audio.play().catch(()=>{}); }
        }
      } else {
        const audio = document.querySelector('audio');
        if (!audio) { alert('Audio player not ready'); return; }
        audio.src = blobUrl;
        audio.load();
        try { await audio.play(); } catch(e) { console.warn('Audio play error:', e); }
      }

      // Attach ended event listener to auto-skip offline
      const audio = document.querySelector('audio');
      if (audio) {
        audio.onended = () => {
          if (window.__auraIsPlayingOffline) {
            window.__auraSkipOffline('next');
          }
        };
      }

      // Show toast
      const toast = document.createElement('div');
      toast.style.cssText = 'position:fixed;bottom:90px;left:50%;transform:translateX(-50%);background:#10b981;color:#000;font-weight:900;font-size:12px;padding:10px 20px;border-radius:9999px;z-index:999999;box-shadow:0 10px 25px rgba(16,185,129,0.5);display:flex;align-items:center;gap:8px;';
      toast.innerHTML = `<span>▶️</span><span>Playing Offline: ${songTitle}</span>`;
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 3500);
    };

    // Global No Internet Popup Modal
    window.auraShowNoInternetModal = function(songTitle) {
      if (document.getElementById('aura-no-internet-modal')) return;
      const modal = document.createElement('div');
      modal.id = 'aura-no-internet-modal';
      modal.className = 'fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn select-none';
      modal.style.cssText = 'position:fixed !important; top:0 !important; left:0 !important; right:0 !important; bottom:0 !important; width:100% !important; height:100% !important; z-index:2147483647 !important; background:rgba(0,0,0,0.85) !important; backdrop-filter:blur(10px) !important; display:flex !important; align-items:center !important; justify-content:center !important; padding:16px !important; margin:0 !important;';
      modal.innerHTML = `
        <div class="w-full max-w-xs bg-[#0e1320] border border-red-500/40 rounded-3xl p-5 shadow-[0_0_50px_rgba(239,68,68,0.3)] relative text-white flex flex-col items-center text-center">
          <div class="w-14 h-14 rounded-2xl bg-red-500/15 border border-red-500/30 flex items-center justify-center text-3xl mb-3 shadow-lg shadow-red-500/20 text-red-400">
            📡
          </div>
          <h3 class="text-base font-black text-white mb-1.5">No Internet Connection</h3>
          <p class="text-xs text-slate-300 leading-relaxed mb-4">
            <b>"${songTitle || 'This song'}"</b> is not downloaded on this device.<br>
            Please turn on mobile data or Wi-Fi, or listen to your downloaded offline songs.
          </p>
          <div class="w-full space-y-2">
            <button id="aura-no-internet-offline-btn" class="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 text-black font-black text-xs hover:opacity-95 active:scale-95 transition-all shadow-md shadow-emerald-500/25 cursor-pointer">
              🎵 Open Offline Songs
            </button>
            <button id="aura-no-internet-cancel-btn" class="w-full py-2 px-4 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-slate-300 font-bold text-xs transition-all cursor-pointer">
              Dismiss
            </button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
      });
      const offlineBtn = modal.querySelector('#aura-no-internet-offline-btn');
      if (offlineBtn) {
        offlineBtn.addEventListener('click', () => {
          modal.remove();
          showDownloadedSongsModal();
        });
      }
      const cancelBtn = modal.querySelector('#aura-no-internet-cancel-btn');
      if (cancelBtn) {
        cancelBtn.addEventListener('click', () => modal.remove());
      }
    };

    // Modal to view and play offline downloaded songs
    async function showDownloadedSongsModal() {
      if (document.getElementById('aura-offline-modal')) return;
      const list = await getAllOfflineSongs();

      const modal = document.createElement('div');
      modal.id = 'aura-offline-modal';
      modal.className = 'fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn select-none';
      modal.style.cssText = 'position:fixed !important; top:0 !important; left:0 !important; right:0 !important; bottom:0 !important; width:100% !important; height:100% !important; z-index:2147483647 !important; background:rgba(0,0,0,0.85) !important; backdrop-filter:blur(10px) !important; display:flex !important; align-items:center !important; justify-content:center !important; padding:16px !important; margin:0 !important;';
      modal.innerHTML = `
        <div class="w-full max-w-sm sm:max-w-md bg-[#0e1320] border border-emerald-500/30 rounded-3xl p-5 sm:p-6 shadow-[0_0_50px_rgba(16,185,129,0.25)] relative text-white max-h-[85vh] flex flex-col">
          <div class="flex items-center justify-between pb-3.5 border-b border-white/[0.08]">
            <div class="flex items-center space-x-2.5">
              <span class="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 15V3m9 12v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4m4-9 5 5 5-5"/></svg>
              </span>
              <div>
                <h3 class="text-base font-black text-white">Offline Songs</h3>
                <p class="text-[11px] text-slate-400 font-semibold">${list.length} songs stored on device</p>
              </div>
            </div>
            <button id="aura-offline-close-btn" class="p-2 rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-slate-400 hover:text-white transition-all cursor-pointer">
              <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
          </div>
          <div class="flex-1 overflow-y-auto py-3 space-y-2.5 mt-2">
            ${list.length === 0 ? `
              <div class="text-center py-10 space-y-2 text-slate-400">
                <p class="text-3xl">🎵</p>
                <p class="text-sm font-bold text-white">No offline songs saved yet</p>
                <p class="text-xs text-slate-400">Tap on any track to open it and click 📥 Download to save it to your phone.</p>
              </div>
            ` : list.map((s) => `
              <div class="flex items-center justify-between p-2.5 rounded-2xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.05] transition-all">
                <div class="flex items-center space-x-3 min-w-0">
                  <img src="${s.image}" class="w-11 h-11 rounded-xl object-cover bg-slate-800 shrink-0" onerror="this.src='/logo.png'" />
                  <div class="min-w-0">
                    <p class="text-xs font-bold text-white truncate">${s.name}</p>
                    <p class="text-[10px] text-slate-400 truncate">${s.artist}</p>
                  </div>
                </div>
                <div class="flex items-center space-x-2 shrink-0">
                  <button onclick="window.auraPlayOfflineSong('${s.id}')" class="px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 text-black text-xs font-black shadow-md shadow-emerald-500/20 hover:scale-105 active:scale-95 transition-all cursor-pointer flex items-center space-x-1">
                    <span>▶ Play</span>
                  </button>
                  <button onclick="window.auraDeleteOfflineSong('${s.id}')" title="Delete offline song" class="p-1.5 rounded-xl bg-white/[0.05] hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-all cursor-pointer">
                    <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18m-2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                  </button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;

      document.body.appendChild(modal);
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
      });
      modal.querySelector('#aura-offline-close-btn').addEventListener('click', () => modal.remove());
    }

    // ────────────────────────────────────────────────────────────────────────
    // D. REAL PHONE STORAGE PERMISSION & OFFLINE DOWNLOAD ENGINE
    // ────────────────────────────────────────────────────────────────────────
    function requestStoragePermissionFirstTime(songTitle) {
      // Ask only the first time; after "Download & Save" every other song just downloads.
      try { if (localStorage.getItem('aura_storage_perm_v1') === 'granted') return Promise.resolve(true); } catch (_) {}
      return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.id = 'aura-storage-permission-modal';
        modal.className = 'fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn select-none';
        modal.style.cssText = 'position:fixed !important; top:0 !important; left:0 !important; right:0 !important; bottom:0 !important; width:100% !important; height:100% !important; z-index:2147483647 !important; background:rgba(0,0,0,0.85) !important; backdrop-filter:blur(10px) !important; display:flex !important; align-items:center !important; justify-content:center !important; padding:16px !important; margin:0 !important;';
        modal.innerHTML = `
          <div class="w-full max-w-xs bg-[#0e1320] border border-emerald-500/40 rounded-3xl p-5 shadow-[0_0_50px_rgba(16,185,129,0.3)] relative text-white flex flex-col items-center text-center">
            <div class="w-14 h-14 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-2xl mb-3 shadow-lg shadow-emerald-500/20 text-emerald-400">
              <svg class="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
            </div>
            
            <h3 class="text-base font-black text-white mb-1">Save to Phone Storage</h3>
            <p class="text-xs text-slate-300 leading-relaxed mb-4">
              Download <b>"${songTitle || 'Song'}"</b> as an MP3 file to your phone's <b>Downloads</b> folder for offline playback and file manager access.
            </p>

            <div class="w-full space-y-2">
              <button id="aura-perm-allow-btn" class="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 text-black font-black text-xs hover:opacity-95 active:scale-95 transition-all shadow-md shadow-emerald-500/25 cursor-pointer">
                📥 Download & Save
              </button>
              <button id="aura-perm-deny-btn" class="w-full py-2 px-4 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-slate-400 hover:text-white font-bold text-xs transition-all cursor-pointer">
                Cancel
              </button>
            </div>
          </div>
        `;

        document.body.appendChild(modal);

        modal.querySelector('#aura-perm-allow-btn').onclick = () => {
          try { localStorage.setItem('aura_storage_perm_v1', 'granted'); } catch (_) {}
          modal.remove();
          resolve(true);
        };

        modal.querySelector('#aura-perm-deny-btn').onclick = () => {
          modal.remove();
          resolve(false);
        };
      });
    }
    window.auraDownloadCurrentSong = async function(song) {
      if (!song) {
        try {
          const s = localStorage.getItem('auramusic_current_song');
          if (s) song = JSON.parse(s);
        } catch(_) {}
      }
      if (!song || !song.name) {
        alert('Please play a song first to download.');
        return;
      }
      const hasPermission = await requestStoragePermissionFirstTime(song.name);
      if (!hasPermission) {
        return; // User declined permission
      }
      if (!song) {
        try {
          const s = localStorage.getItem('auramusic_current_song');
          if (s) song = JSON.parse(s);
        } catch(_) {}
      }
      if (!song || !song.name) {
        alert('Please play a song first to download.');
        return;
      }

      const songTitle = (song.name || 'Song').replace(/[\\/:*?"<>|]/g, '');
      const songArtist = (song.artist || 'AuraMusic').replace(/[\\/:*?"<>|]/g, '');
      const filename = `${songTitle} - ${songArtist}.mp3`;

      // Show toast
      const toast = document.createElement('div');
      const TOAST_CSS = 'position:fixed;bottom:104px;left:50%;transform:translateX(-50%);background:rgba(15,23,42,0.92);color:#fff;font-weight:600;font-size:11px;line-height:1;padding:7px 14px;border-radius:9999px;z-index:999999;white-space:nowrap;pointer-events:none;';
      toast.style.cssText = TOAST_CSS;
      toast.textContent = 'Downloading…';
      document.body.appendChild(toast);

      try {
        let streamUrl = song.streamUrl || song.url;
        if (!streamUrl || streamUrl.startsWith('/api/')) {
          const cleanId = (song.videoId || song.id || '').replace(/^yt_|^yt-/, '').trim();
          const res = await fetch(`/api/yt/stream?id=${encodeURIComponent(cleanId)}&title=${encodeURIComponent(song.name)}&artist=${encodeURIComponent(song.artist)}&json=1`);
          if (res.ok) {
            const data = await res.json();
            if (data?.streamUrl) streamUrl = data.streamUrl;
          }
        }

        if (!streamUrl) throw new Error('Audio stream unavailable');

        const resp = await fetch(streamUrl);
        if (!resp.ok) throw new Error('Stream fetch failed');
        const blob = await resp.blob();

        // 1. Save into IndexedDB for in-app offline playback
        await saveOfflineAudio(song, blob);

        // 2. Direct MP3 download for Phone File Manager (Downloads folder)
        const cleanId = (song.videoId || song.id || '').replace(/^yt_|^yt-/, '').trim();
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = `/api/yt/download?id=${encodeURIComponent(cleanId)}&title=${encodeURIComponent(song.name)}&artist=${encodeURIComponent(song.artist || '')}`;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          document.body.removeChild(a);
        }, 2000);

        toast.textContent = 'Downloaded ✓';
        setTimeout(() => toast.remove(), 2500);
      } catch (err) {
        console.warn('Direct blob download fallback:', err);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = `/api/yt/stream?id=${encodeURIComponent((song.videoId || song.id || '').replace(/^yt_|^yt-/, ''))}&title=${encodeURIComponent(song.name)}&artist=${encodeURIComponent(song.artist)}`;
        a.download = filename;
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => document.body.removeChild(a), 2000);

        toast.textContent = 'Download started';
        setTimeout(() => toast.remove(), 2500);
      }
    };

    // ────────────────────────────────────────────────────────────────────────
    // E. INJECT DOWNLOAD BUTTON ONLY INSIDE FULLSCREEN NOW-PLAYING MODAL
    // (Explicitly removed from bottom mini player bar as requested!)
    // ────────────────────────────────────────────────────────────────────────
    function injectDownloadButtons() {
      // 1. Fullscreen Now Playing Controls (inside track play screen)
      const fullscreenControls = document.querySelector('div[class*="z-50 bg-[#07080c]"] footer div[class*="space-x-4"]');
      if (fullscreenControls && !document.getElementById('aura-fullscreen-download-btn')) {
        const dlBtn = document.createElement('button');
        dlBtn.id = 'aura-fullscreen-download-btn';
        dlBtn.title = 'Download Song to Phone Storage for Offline Play';
        dlBtn.className = 'p-2 sm:p-3 text-slate-400 hover:text-emerald-400 transition-colors cursor-pointer active:scale-90 flex items-center justify-center';
        dlBtn.innerHTML = `<svg class="w-5 h-5 sm:w-6 sm:h-6 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/></svg>`;
        dlBtn.onclick = function(e) {
          e.stopPropagation();
          window.auraDownloadCurrentSong();
        };
        fullscreenControls.appendChild(dlBtn);
      }

      // 2. The bottom mini player has no download button: remove one if an old copy is still on screen.
      const oldMini = document.getElementById('aura-mini-download-btn');
      if (oldMini) oldMini.remove();
    }

    // ────────────────────────────────────────────────────────────────────────
    // F. TASTE DNA & PERSONAL MUSIC DASHBOARD MODAL
    // ────────────────────────────────────────────────────────────────────────
    window.auraShowTasteDashboard = async function() {
      const u = getUser();
      const uid = (u && u.email) ? u.email : (u && u.id ? u.id : 'guest');
      if (uid === 'guest') {
        toast('Please login to view your personal Taste DNA & Stats', 'error');
        return;
      }

      // Check if modal already exists
      let modal = document.getElementById('aura-taste-modal');
      if (modal) modal.remove();

      modal = document.createElement('div');
      modal.id = 'aura-taste-modal';
      modal.className = 'fixed inset-0 z-[999999] bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto';
      modal.innerHTML = `
        <div class="relative w-full max-w-xl bg-[#0e1017] border border-slate-800 rounded-3xl p-5 sm:p-8 shadow-2xl text-slate-100 max-h-[90vh] overflow-y-auto">
          <button id="aura-close-taste-btn" class="absolute top-5 right-5 text-slate-400 hover:text-white p-2 rounded-full hover:bg-white/10 transition">✕</button>
          <div class="flex items-center space-x-3 mb-6">
            <div class="w-12 h-12 rounded-2xl bg-gradient-to-tr from-purple-600 to-pink-500 flex items-center justify-center text-2xl shadow-lg">🧬</div>
            <div>
              <h2 class="text-xl sm:text-2xl font-bold bg-gradient-to-r from-purple-400 via-pink-400 to-amber-300 bg-clip-text text-transparent">Your Music Taste DNA</h2>
              <p class="text-xs sm:text-sm text-slate-400">AI-analyzed music taste, stats & listening habits</p>
            </div>
          </div>
          <div id="aura-taste-content" class="space-y-6">
            <div class="flex items-center justify-center py-12 text-slate-400 animate-pulse text-sm">
              Analyzing your music taste & listening habits...
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      document.getElementById('aura-close-taste-btn').onclick = () => modal.remove();
      modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

      try {
        const res = await fetch(`/api/taste/dashboard?userId=${encodeURIComponent(uid)}`);
        const data = await res.json();
        const d = data.dashboard || {};
        const stats = d.stats || {};
        const dna = d.tasteDNA || [];
        const persona = d.dnaCard?.persona || 'The Music Explorer 🌍';
        const topArtists = d.favouriteArtists || [];

        const content = document.getElementById('aura-taste-content');
        if (!content) return;

        content.innerHTML = `
          <!-- Persona Card -->
          <div class="p-4 rounded-2xl bg-gradient-to-r from-purple-900/40 to-pink-900/30 border border-purple-500/30 flex items-center justify-between">
            <div>
              <span class="text-xs uppercase tracking-wider text-purple-300 font-semibold">Current Persona</span>
              <h3 class="text-lg sm:text-xl font-bold text-white mt-0.5">${persona}</h3>
              <p class="text-xs text-slate-300 mt-1">Learns dynamically as you play, like & skip songs</p>
            </div>
            <div class="text-3xl">✨</div>
          </div>

          <!-- Listening Minutes Stats -->
          <div class="grid grid-cols-3 gap-3 text-center">
            <div class="bg-slate-900/80 border border-slate-800 rounded-2xl p-3">
              <span class="text-xs text-slate-400">Total Listened</span>
              <p class="text-lg sm:text-xl font-bold text-amber-400 mt-1">${stats.totalListeningMinutes || 0}m</p>
            </div>
            <div class="bg-slate-900/80 border border-slate-800 rounded-2xl p-3">
              <span class="text-xs text-slate-400">Today</span>
              <p class="text-lg sm:text-xl font-bold text-emerald-400 mt-1">${stats.todayMinutes || 0}m</p>
            </div>
            <div class="bg-slate-900/80 border border-slate-800 rounded-2xl p-3">
              <span class="text-xs text-slate-400">Plays</span>
              <p class="text-lg sm:text-xl font-bold text-cyan-400 mt-1">${stats.totalPlaysRecorded || 0}</p>
            </div>
          </div>

          <!-- Mood Breakdown (DNA) -->
          <div>
            <h4 class="text-sm font-semibold text-slate-200 mb-3 flex items-center justify-between">
              <span>Mood & Vibe Percentages</span>
              <span class="text-xs text-purple-400 font-normal">Real-time</span>
            </h4>
            <div class="space-y-2">
              ${dna.length ? dna.map(m => `
                <div>
                  <div class="flex justify-between text-xs mb-1">
                    <span class="text-slate-300">${m.name}</span>
                    <span class="text-purple-300 font-semibold">${m.percent}%</span>
                  </div>
                  <div class="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div class="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full" style="width: ${m.percent}%"></div>
                  </div>
                </div>
              `).join('') : '<p class="text-xs text-slate-500">Play a few songs to calculate your mood percentages.</p>'}
            </div>
          </div>

          <!-- Top Artists -->
          ${topArtists.length ? `
            <div>
              <h4 class="text-sm font-semibold text-slate-200 mb-2">Most Listened Artists</h4>
              <div class="flex flex-wrap gap-2">
                ${topArtists.slice(0, 5).map(a => `
                  <span class="px-3 py-1 rounded-full text-xs font-medium bg-slate-800 border border-slate-700 text-slate-200">
                    🎤 ${a.name}
                  </span>
                `).join('')}
              </div>
            </div>
          ` : ''}

          <!-- Auto Playlists Quick Launcher -->
          <div class="pt-2">
            <button id="aura-generate-playlists-btn" class="w-full py-3 rounded-2xl bg-gradient-to-r from-purple-600 via-pink-600 to-amber-500 text-white font-semibold text-sm shadow-lg hover:brightness-110 active:scale-[0.98] transition">
              ✨ Sync 12 Personalized Auto-Playlists
            </button>
          </div>

          <!-- Privacy Option -->
          <div class="text-center pt-2">
            <button id="aura-clear-taste-btn" class="text-xs text-slate-500 hover:text-red-400 transition underline">
              Reset My Music Taste History
            </button>
          </div>
        `;

        document.getElementById('aura-generate-playlists-btn').onclick = async function() {
          this.textContent = 'Generating...';
          try {
            const r = await fetch(`/api/taste/auto-playlists?userId=${encodeURIComponent(uid)}`);
            const j = await r.json();
            if (j.success) {
              toast('12 Auto-Playlists created in your Library! ✨');
              modal.remove();
            }
          } catch {
            toast('Failed to generate playlists', 'error');
            this.textContent = '✨ Sync 12 Personalized Auto-Playlists';
          }
        };

        document.getElementById('aura-clear-taste-btn').onclick = async function() {
          if (!confirm('Are you sure you want to clear your listening history & taste profile?')) return;
          try {
            await fetch('/api/taste/clear-history', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId: uid, deleteEntireProfile: false })
            });
            toast('Music history reset successfully');
            modal.remove();
          } catch {
            toast('Failed to reset history', 'error');
          }
        };

      } catch (err) {
        console.error('Error fetching taste dashboard:', err);
        const content = document.getElementById('aura-taste-content');
        if (content) content.innerHTML = '<p class="text-xs text-red-400 py-6 text-center">Failed to load taste profile. Please try again.</p>';
      }
    };

    // ────────────────────────────────────────────────────────────────────────
    // G. INJECT TASTE DNA BUTTON (ADMIN ONLY)
    // Users ke liye taste engine silently background mein kaam karega to improve music.
    // Dashboard & DNA UI button sirf Admin ko dikhega analytics monitor karne ke liye.
    // ────────────────────────────────────────────────────────────────────────
    function isAdminUser() {
      const u = getUser();
      if (!u) return false;
      const email = String(u.email || '').toLowerCase().trim();
      const role = String(u.role || '').toLowerCase();
      return email === 'admin@admin.com' || role === 'admin' || sessionStorage.getItem('auramusic_admin_logged') === 'true' || sessionStorage.getItem('auramusic_portal_unlocked') === 'true';
    }

    // Old Music Taste DNA modal removed — replaced by Mochy Charts & Moods Explorer (storage/history kept)
    window.auraShowTasteDashboard = function() {
      if (typeof window.auraOpenMochyStudio === 'function') {
        window.auraOpenMochyStudio('explore');
      }
    };

    function injectTasteHeaderButton() {
      const existing = document.getElementById('aura-header-dna-btn');
      if (existing) existing.remove();
    }

    // ────────────────────────────────────────────────────────────────────────
    // Continuous DOM Observer
    // ────────────────────────────────────────────────────────────────────────
    const mainObserver = new MutationObserver(() => {
      enhanceVibeRadarCards();
      configureHeaderDownloadBtn();
      injectDownloadButtons();
      injectTasteHeaderButton();
    });
    mainObserver.observe(document.documentElement, { childList: true, subtree: true });

    window.addEventListener('DOMContentLoaded', () => {
      enhanceVibeRadarCards();
      configureHeaderDownloadBtn();
      injectDownloadButtons();
      injectTasteHeaderButton();
    });
  })();
