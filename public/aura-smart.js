
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
  function getUserId() { const u = getUser(); return (u && u.email) ? u.email : 'guest'; }
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

  // ── 1. Stream Pre-Warm (fast playback ≤ 1.5s) ───────────────────────────
  const warmedIds = new Set();
  function warmVideoId(videoId) {
    if (!videoId || warmedIds.has(videoId)) return;
    warmedIds.add(videoId);
    // Fire warm request to server so audio URL is pre-resolved & cached
    fetch('/api/yt/warm?id=' + encodeURIComponent(videoId)).catch(() => {});
  }

  // Pre-warm next songs from the queue whenever audio plays
  window.addEventListener('play', function(e) {
    if (e.target && e.target.tagName === 'AUDIO') {
      // Warm next 3 songs in queue
      try {
        const queue = JSON.parse(localStorage.getItem('auramusic_queue') || '[]');
        const idx = parseInt(localStorage.getItem('auramusic_queue_index') || '0', 10);
        queue.slice(idx + 1, idx + 4).forEach(s => {
          const v = s.videoId || (s.id && s.id.replace(/^yt[-_]/, ''));
          if (v) warmVideoId(v);
        });
      } catch {}
    }
  }, true);

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
        ${userPlaylists.length === 0
          ? '<div class="aura-atp-playlist-item" style="color:#64748b">No playlists yet. Create one first.</div>'
          : userPlaylists.map(pl => `
            <div class="aura-atp-playlist-item" data-plid="${escHtml(String(pl.id || pl._id))}" data-plname="${escHtml(pl.name || '')}">
              <span class="aura-atp-playlist-icon">${pl._system === 'favorites' ? '❤️' : pl.isSystem ? '🕐' : '🎵'}</span>
              <span>${escHtml(pl.name || 'Playlist')}</span>
              <span class="aura-atp-playlist-count">${(pl.songs || []).length} songs</span>
            </div>`).join('')
        }
        <button id="aura-atp-close">Cancel</button>
      </div>
    `;
    document.body.appendChild(backdrop);
    atpModal = backdrop;

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
              localStorage.setItem('auramusic_cached_playlists', JSON.stringify(cached));
            }
          } catch {}
        }
      } else {
        toast('Failed to add song', 'error');
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

  // ── Intercept clicks on song rows: play instantly (<3s) using downloadUrl[last] ──
  document.addEventListener('click', function(e) {
    const card = e.target.closest('[class*="song"], [class*="track"], [class*="Card"], [class*="card"], [class*="item"]');
    if (!card) return;

    // Check if we have cached fast results matching this song
    const titleEl = card.querySelector('.song-title, [class*="title"], h3, h4, span');
    const songTitle = (titleEl?.textContent || '').trim().toLowerCase();

    if (window.__auraLastFastSearchResults && songTitle) {
      const matched = window.__auraLastFastSearchResults.find(s => {
        const n = (s.name || '').toLowerCase();
        return n.includes(songTitle) || songTitle.includes(n);
      });
      if (matched && Array.isArray(matched.downloadUrl) && matched.downloadUrl.length > 0) {
        // Play directly via last index downloadUrl (<1.5s start time!)
        playFastSong(matched);
      }
    }
  }, true);

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
