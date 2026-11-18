
// ═══════════════════════════════════════════════════════════════════════════
// AuraMusic Smart Features v2.0
// • Add to Playlist button on every song card
// • Like → auto-syncs to ❤️ Favorites system playlist
// • Recently Played auto-playlist (per user account)
// • Shuffle from Library/Playlists
// • Fast playback: pre-warm stream URLs ≤ 1.5s
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
    fetch('/api/yt/warm?id=' + encodeURIComponent(videoId)).catch(() => {});
  }

  // Intercept play events to warm up the NEXT songs in the queue
  window.addEventListener('play', function(e) {
    if (e.target && e.target.tagName === 'AUDIO') {
      const song = getCurrentSong();
      if (song) {
        // Warm current
        const vid = song.videoId || (song.id && song.id.replace(/^yt[-_]/, ''));
        if (vid) warmVideoId(vid);
      }
      // Warm next songs from queue
      try {
        const queue = JSON.parse(localStorage.getItem('auramusic_queue') || '[]');
        const idx = parseInt(localStorage.getItem('auramusic_queue_index') || '0', 10);
        const next = queue.slice(idx + 1, idx + 4);
        next.forEach(s => {
          const v = s.videoId || (s.id && s.id.replace(/^yt[-_]/, ''));
          if (v) warmVideoId(v);
        });
      } catch {}
    }
  }, true);

  // ── 2. Recently Played: record every song to server + local ──────────────
  const RP_KEY = 'aura_recently_played_local';
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
  }

  // Hook into audio play to record recently played
  window.addEventListener('play', function(e) {
    if (e.target && e.target.tagName === 'AUDIO') {
      const song = getCurrentSong();
      if (song) recordRecentlyPlayed(song);
    }
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
  let _lastSongId = null;
  setInterval(function() {
    try {
      const song = getCurrentSong();
      if (!song) return;
      const sid = song.id || song.videoId;
      if (sid && sid !== _lastSongId) {
        _lastSongId = sid;
        recordRecentlyPlayed(song);
        // Pre-warm the audio stream
        const vid = song.videoId || (song.id && song.id.replace(/^yt[-_]/, ''));
        if (vid) warmVideoId(vid);
      }
    } catch {}
  }, 1500);

  // ── 9. Right-click context menu (alternative ATP access) ─────────────────
  attachAddToPlaylistContextMenu();

  // ── 10. Keyboard shortcut: Shift+A = Add current song to playlist ─────────
  document.addEventListener('keydown', function(e) {
    if (e.shiftKey && e.key === 'A') {
      const song = getCurrentSong();
      if (song) openAddToPlaylist(song);
    }
  });

  // ── 11. Expose public API for in-app integration ──────────────────────────
  window.__auraSmartFeatures = {
    openAddToPlaylist,
    recordRecentlyPlayed,
    warmVideoId,
    shuffle: window.__auraShuffle
  };

  console.log('✅ AuraMusic Smart Features v2.0 loaded');
})();
