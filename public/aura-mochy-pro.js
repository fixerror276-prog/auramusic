// ═══════════════════════════════════════════════════════════════════════════
// AuraMusic × Mochy Pro Suite v2.0
// Complete Mochy-Music feature & provider integration:
// - Tabbed Search (Songs / Albums / Artists / Playlists) + Browse + Artist Bio
// - External Importer (Spotify, Apple Music, Tidal, CSV/Text)
// - Local Device Music Scanner
// - Custom Accent Themes, Custom Fonts, Gestures, Module System & Stats
// ═══════════════════════════════════════════════════════════════════════════
(function AuraMochyPro() {
  'use strict';

  const PRO_KEY = 'auramusic_mochy_pro_v1';
  const DEFAULT_PRO = {
    themeAccent: '#10b981',
    amoledBg: false,
    fontFamily: 'Plus Jakarta Sans',
    gesturesEnabled: true,
    modules: {
      youlyplus: true,
      simpmusic: true,
      lrclib: true,
      netease: true,
      importer: true,
      localScanner: true
    }
  };

  let pro = loadPro();
  function loadPro() {
    try {
      const r = JSON.parse(localStorage.getItem(PRO_KEY) || 'null');
      return {
        ...DEFAULT_PRO,
        ...(r || {}),
        modules: { ...DEFAULT_PRO.modules, ...(r?.modules || {}) }
      };
    } catch { return { ...DEFAULT_PRO }; }
  }
  function savePro() {
    try { localStorage.setItem(PRO_KEY, JSON.stringify(pro)); } catch {}
    applyThemeAndFont();
  }

  function toast(msg, type = 'success') {
    if (window.__auraToast) return window.__auraToast(msg, type);
    const el = document.createElement('div');
    el.textContent = msg;
    Object.assign(el.style, {
      position: 'fixed', bottom: '92px', left: '50%', transform: 'translateX(-50%)',
      background: type === 'error' ? '#ef4444' : pro.themeAccent, color: '#000',
      padding: '9px 18px', borderRadius: '999px', fontSize: '12px', fontWeight: '800',
      zIndex: '9999999', boxShadow: '0 8px 28px rgba(0,0,0,0.6)', pointerEvents: 'none'
    });
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2600);
  }

  function getMainAudio() {
    return window.__auraMainAudio || document.querySelector('audio:not(#aura-shadow-preloader)') || null;
  }

  function getUserId() {
    try {
      const u = JSON.parse(localStorage.getItem('auramusic_user') || 'null');
      return u ? (u.id || u._id || u.email || 'guest') : 'guest';
    } catch { return 'guest'; }
  }

  // ── 1. Theme Accent, AMOLED & Custom Font Engine ──────────────────────────
  const FONTS = ['Plus Jakarta Sans', 'Inter', 'Outfit', 'Space Grotesk', 'JetBrains Mono'];
  const ACCENTS = [
    { name: 'Emerald', hex: '#10b981' },
    { name: 'Violet', hex: '#8b5cf6' },
    { name: 'Rose', hex: '#f43f5e' },
    { name: 'Cyan', hex: '#06b6d4' },
    { name: 'Amber', hex: '#f59e0b' }
  ];

  function applyThemeAndFont() {
    let st = document.getElementById('aura-mochy-pro-theme');
    if (!st) {
      st = document.createElement('style');
      st.id = 'aura-mochy-pro-theme';
      document.head.appendChild(st);
    }
    const fontName = pro.fontFamily || 'Plus Jakarta Sans';
    if (fontName !== 'Plus Jakarta Sans') {
      const linkId = 'aura-mochy-font-link';
      let lk = document.getElementById(linkId);
      if (!lk) {
        lk = document.createElement('link');
        lk.id = linkId;
        lk.rel = 'stylesheet';
        document.head.appendChild(lk);
      }
      lk.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontName)}:wght@400;600;700;800&display=swap`;
    }
    st.textContent = `
      :root { --aura-accent: ${pro.themeAccent}; }
      body, .font-sans { font-family: '${fontName}', 'Plus Jakarta Sans', sans-serif !important; }
      ${pro.amoledBg ? 'body, #root, .bg-background { background-color: #000000 !important; }' : ''}
    `;
  }
  applyThemeAndFont();

  window.auraGetEnabledLyricsProviders = function() {
    return Object.entries(pro.modules)
      .filter(([k, v]) => v && ['youlyplus', 'simpmusic', 'lrclib', 'netease'].includes(k))
      .map(([k]) => k);
  };

  // ── 2. Gesture Customization on Fullscreen Player & Video Overlay ─────────
  let _touchStartX = 0, _touchStartY = 0, _lastTap = 0;
  document.addEventListener('touchstart', (e) => {
    if (!pro.gesturesEnabled) return;
    const player = e.target.closest('#aura-mochy-video-overlay, div[class*="z-50 bg-[#07080c]"]');
    if (!player || e.target.closest('input, button')) return;
    _touchStartX = e.touches[0].clientX;
    _touchStartY = e.touches[0].clientY;
  }, { passive: true });

  document.addEventListener('touchend', (e) => {
    if (!pro.gesturesEnabled || !_touchStartX) return;
    const player = e.target.closest('#aura-mochy-video-overlay, div[class*="z-50 bg-[#07080c]"]');
    if (!player || e.target.closest('input, button')) { _touchStartX = 0; return; }
    const dx = e.changedTouches[0].clientX - _touchStartX;
    const dy = e.changedTouches[0].clientY - _touchStartY;
    _touchStartX = 0;

    if (Math.abs(dx) > 75 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      if (dx < 0) document.querySelector('button[title*=Next i], button[aria-label*=Next i]')?.click();
      else document.querySelector('button[title*=Previous i], button[aria-label*=Previous i]')?.click();
    } else if (dy > 95 && Math.abs(dy) > Math.abs(dx) * 1.5) {
      if (player.id === 'aura-mochy-video-overlay' && window.auraCloseVideoPlayer) window.auraCloseVideoPlayer();
      else player.querySelector('button svg path[d*="19 9"], button[title*=Minimize i]')?.closest('button')?.click();
    } else if (Math.abs(dx) < 12 && Math.abs(dy) < 12) {
      const now = Date.now();
      if (now - _lastTap < 280) {
        const a = getMainAudio();
        if (a) a.paused ? a.play().catch(() => {}) : a.pause();
      }
      _lastTap = now;
    }
  }, { passive: true });

  // ── 3. Shared Pro Modal Helper ────────────────────────────────────────────
  function openProModal(title, subtitle, bodyHtml) {
    let m = document.getElementById('aura-mochy-pro-modal');
    if (!m) {
      m = document.createElement('div');
      m.id = 'aura-mochy-pro-modal';
      m.style.background = '#07080c';
      m.className = 'fixed inset-x-0 top-0 bottom-16 md:bottom-0 z-[12200] text-slate-100 flex flex-col overflow-hidden font-sans';
      document.body.appendChild(m);
    }
    m.style.display = 'flex';
    m.innerHTML = `
      <div class="p-4 sm:p-5 border-b border-white/[0.08] flex items-center justify-between bg-[#0B0E17] shrink-0">
        <div class="min-w-0">
          <h2 class="text-base sm:text-lg font-black text-white truncate">${title}</h2>
          <p class="text-[11px] text-slate-400 truncate">${subtitle}</p>
        </div>
        <button onclick="document.getElementById('aura-mochy-pro-modal').style.display='none'" class="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/[0.08] cursor-pointer">
          <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      </div>
      <div id="aura-mochy-pro-body" class="flex-1 overflow-y-auto p-4 sm:p-6 pb-28 max-w-4xl mx-auto w-full space-y-4">
        ${bodyHtml}
      </div>
    `;
  }

  // ── 4. Tabbed Search Explorer (Songs / Albums / Artists / Playlists) ──────
  let _searchTab = 'songs';
  let _lastQuery = '';
  window.auraOpenSearchExplorer = function(initialQuery = '') {
    _lastQuery = initialQuery || _lastQuery;
    openProModal('🔍 Mochy Search Explorer', 'Songs, Albums, Artists & Playlists from YouTube Music', `
      <div class="flex gap-2">
        <input id="pro-search-input" type="text" value="${_lastQuery.replace(/"/g, '&quot;')}" placeholder="Search songs, albums, artists, playlists..."
          onkeydown="if(event.key==='Enter') window.auraRunTypedSearch()"
          class="flex-1 px-4 py-3 rounded-2xl bg-[#111520] border border-white/[0.1] text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/60" />
        <button onclick="window.auraRunTypedSearch()" class="px-5 py-3 rounded-2xl bg-emerald-500 text-black text-xs font-black cursor-pointer">Search</button>
      </div>
      <div class="flex gap-1.5 flex-wrap" id="pro-search-tabs">
        ${['songs', 'albums', 'artists', 'playlists'].map(t => `
          <button onclick="window.auraSwitchSearchTab('${t}')" class="px-3.5 py-2 rounded-xl text-xs font-extrabold capitalize cursor-pointer ${_searchTab === t ? 'bg-emerald-500 text-black' : 'bg-white/[0.05] text-slate-400 hover:text-white'}">${t}</button>
        `).join('')}
      </div>
      <div id="pro-search-results" class="space-y-2.5 text-xs text-slate-400">Type a query above and press Search.</div>
    `);
    if (_lastQuery) window.auraRunTypedSearch();
  };

  window.auraSwitchSearchTab = function(t) {
    _searchTab = t;
    const inp = document.getElementById('pro-search-input');
    if (inp) _lastQuery = inp.value.trim();
    window.auraOpenSearchExplorer(_lastQuery);
  };

  window.auraRunTypedSearch = async function() {
    const inp = document.getElementById('pro-search-input');
    const q = (inp ? inp.value : _lastQuery).trim();
    if (!q) return;
    _lastQuery = q;
    const box = document.getElementById('pro-search-results');
    if (!box) return;
    box.innerHTML = '<div class="py-8 text-center text-slate-400">Searching YouTube Music...</div>';
    try {
      const res = await fetch(`/api/yt/search?q=${encodeURIComponent(q)}&type=${encodeURIComponent(_searchTab)}`);
      const items = await res.json();
      if (!Array.isArray(items) || items.length === 0) {
        box.innerHTML = '<div class="py-8 text-center text-slate-500">No results found.</div>';
        return;
      }
      window.__mochySearchItems = items;
      box.innerHTML = items.map((it, idx) => {
        if (_searchTab === 'songs') {
          return `
            <div onclick="window.auraPlayProItem(${idx})" class="flex items-center gap-3 p-3 rounded-2xl bg-[#111520] hover:bg-[#171d2b] border border-white/[0.06] cursor-pointer">
              <img src="${it.image || '/logo.png'}" class="w-12 h-12 rounded-xl object-cover shrink-0 bg-slate-900" />
              <div class="min-w-0 flex-1">
                <div class="text-sm font-bold text-white truncate">${(it.name || '').replace(/</g, '&lt;')}</div>
                <div class="text-[11px] text-slate-400 truncate">${(it.artist || '').replace(/</g, '&lt;')} • ${(it.album || '').replace(/</g, '&lt;')}</div>
              </div>
              <button onclick="event.stopPropagation(); window.auraOpenArtistBio('${(it.artist || '').replace(/'/g, "\\'")}')" class="px-2.5 py-1.5 rounded-lg bg-white/[0.06] text-[10px] font-bold text-slate-300 hover:text-white cursor-pointer">Artist</button>
            </div>
          `;
        }
        return `
          <div onclick="${_searchTab === 'artists' ? `window.auraOpenArtistBio('${(it.name || '').replace(/'/g, "\\'")}')` : `window.auraBrowseCollection('${it.browseId}')`}"
            class="flex items-center gap-3 p-3 rounded-2xl bg-[#111520] hover:bg-[#171d2b] border border-white/[0.06] cursor-pointer">
            <img src="${it.image || '/logo.png'}" class="w-14 h-14 ${_searchTab === 'artists' ? 'rounded-full' : 'rounded-xl'} object-cover shrink-0 bg-slate-900" />
            <div class="min-w-0 flex-1">
              <div class="text-sm font-bold text-white truncate">${(it.name || '').replace(/</g, '&lt;')}</div>
              <div class="text-[11px] text-slate-400 truncate">${(it.subtitle || it.type || '').replace(/</g, '&lt;')}</div>
            </div>
            <span class="text-xs text-emerald-400 font-bold">Open →</span>
          </div>
        `;
      }).join('');
    } catch {
      box.innerHTML = '<div class="py-8 text-center text-red-400">Search failed.</div>';
    }
  };

  window.auraPlayProItem = function(idx) {
    const items = window.__mochySearchItems || [];
    const song = items[idx];
    if (!song) return;
    if (typeof window.__auraPlaySong === 'function') {
      window.__auraPlaySong(song, items);
    } else {
      const a = getMainAudio();
      if (a) { a.src = song.url; a.play().catch(() => {}); }
    }
    toast(`▶ ${song.name}`);
  };

  window.auraBrowseCollection = async function(browseId) {
    openProModal('💿 Collection', 'Loading tracks...', '<div class="py-10 text-center text-slate-400">Fetching from YouTube Music...</div>');
    try {
      const res = await fetch(`/api/yt/browse?id=${encodeURIComponent(browseId)}`);
      const d = await res.json();
      if (!d.success) return toast('Could not load collection', 'error');
      window.__mochyBrowseTracks = d.tracks || [];
      openProModal(d.title || 'Collection', `${d.subtitle || ''} • ${window.__mochyBrowseTracks.length} tracks`, `
        <div class="flex items-center gap-4 p-4 rounded-3xl bg-[#111520] border border-white/[0.08]">
          <img src="${d.image || '/logo.png'}" class="w-20 h-20 rounded-2xl object-cover shrink-0" />
          <div class="min-w-0 flex-1">
            <h3 class="text-base font-black text-white truncate">${(d.title || '').replace(/</g, '&lt;')}</h3>
            <p class="text-xs text-slate-400 mt-1">${window.__mochyBrowseTracks.length} tracks</p>
            <button onclick="window.auraPlayBrowseTrack(0)" class="mt-3 px-4 py-2 rounded-xl bg-emerald-500 text-black text-xs font-black cursor-pointer">▶ Play All</button>
          </div>
        </div>
        <div class="space-y-2">
          ${window.__mochyBrowseTracks.map((t, i) => `
            <div onclick="window.auraPlayBrowseTrack(${i})" class="flex items-center gap-3 p-3 rounded-2xl bg-[#111520] hover:bg-[#171d2b] border border-white/[0.06] cursor-pointer">
              <span class="w-5 text-center text-xs text-slate-500 font-bold">${i + 1}</span>
              <img src="${t.image || '/logo.png'}" class="w-10 h-10 rounded-lg object-cover shrink-0" />
              <div class="min-w-0 flex-1">
                <div class="text-sm font-bold text-white truncate">${(t.name || '').replace(/</g, '&lt;')}</div>
                <div class="text-[11px] text-slate-400 truncate">${(t.artist || '').replace(/</g, '&lt;')}</div>
              </div>
            </div>
          `).join('')}
        </div>
      `);
    } catch { toast('Browse failed', 'error'); }
  };

  window.auraPlayBrowseTrack = function(idx) {
    const list = window.__mochyBrowseTracks || [];
    if (!list[idx]) return;
    if (typeof window.__auraPlaySong === 'function') window.__auraPlaySong(list[idx], list);
    toast(`▶ ${list[idx].name}`);
  };

  // ── 5. Artist Info (Wikipedia Bio + Top Songs) ────────────────────────────
  window.auraOpenArtistBio = async function(name) {
    if (!name) return toast('No artist selected', 'error');
    openProModal(`🎤 ${name}`, 'Loading artist profile & biography...', '<div class="py-10 text-center text-slate-400">Fetching Wikipedia & YouTube Music...</div>');
    try {
      const res = await fetch(`/api/artist/info?name=${encodeURIComponent(name)}`);
      const d = await res.json();
      const a = d.artist;
      if (!a) return toast('Artist info unavailable', 'error');
      window.__mochyBrowseTracks = a.topSongs || [];
      openProModal(a.name, 'Artist Biography & Top Tracks', `
        <div class="p-4 rounded-3xl bg-[#111520] border border-white/[0.08] space-y-3">
          <div class="flex items-center gap-4">
            <img src="${a.image || '/logo.png'}" class="w-20 h-20 rounded-full object-cover shrink-0" />
            <div>
              <h3 class="text-lg font-black text-white">${(a.name || '').replace(/</g, '&lt;')}</h3>
              <p class="text-xs text-emerald-400 font-bold">Verified Artist Info (Wikipedia + YT Music)</p>
            </div>
          </div>
          <p class="text-xs text-slate-300 leading-relaxed">${(a.bio || '').replace(/</g, '&lt;')}</p>
        </div>
        <h4 class="text-sm font-black text-white pt-1">🔥 Top Songs</h4>
        <div class="space-y-2">
          ${window.__mochyBrowseTracks.map((t, i) => `
            <div onclick="window.auraPlayBrowseTrack(${i})" class="flex items-center gap-3 p-3 rounded-2xl bg-[#111520] hover:bg-[#171d2b] border border-white/[0.06] cursor-pointer">
              <img src="${t.image || '/logo.png'}" class="w-10 h-10 rounded-lg object-cover shrink-0" />
              <div class="min-w-0 flex-1">
                <div class="text-sm font-bold text-white truncate">${(t.name || '').replace(/</g, '&lt;')}</div>
                <div class="text-[11px] text-slate-400 truncate">${(t.album || '').replace(/</g, '&lt;')}</div>
              </div>
              <span class="text-xs text-emerald-400 font-bold">▶</span>
            </div>
          `).join('')}
        </div>
      `);
    } catch { toast('Could not load artist info', 'error'); }
  };

  // ── 6. Spotify / Apple Music / Tidal / CSV Playlist Importer ──────────────
  let _importedTracks = [];
  let _importedTitle = 'Imported Playlist';
  window.auraOpenPlaylistImporter = function() {
    openProModal('📥 Playlist Importer', 'Import from Spotify, Apple Music, Tidal or CSV / Text', `
      <div class="p-4 rounded-3xl bg-[#111520] border border-white/[0.08] space-y-3">
        <p class="text-xs text-slate-300">Paste a public <b>Spotify</b>, <b>Apple Music</b>, or <b>Tidal</b> playlist/album URL — or paste <code>Song - Artist</code> lines:</p>
        <textarea id="pro-import-input" rows="4" placeholder="https://open.spotify.com/playlist/...&#10;OR:&#10;Tu Chahiye - Atif Aslam&#10;Kesariya - Arijit Singh"
          class="w-full p-3 rounded-2xl bg-black/40 border border-white/[0.1] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"></textarea>
        <button onclick="window.auraRunPlaylistImport()" class="w-full py-3 rounded-2xl bg-emerald-500 text-black text-xs font-black cursor-pointer">Fetch & Match Tracks on YouTube Music</button>
      </div>
      <div id="pro-import-results" class="space-y-2.5"></div>
    `);
  };

  window.auraRunPlaylistImport = async function() {
    const raw = document.getElementById('pro-import-input')?.value?.trim();
    const box = document.getElementById('pro-import-results');
    if (!raw || !box) return toast('Paste a URL or tracklist first', 'error');
    box.innerHTML = '<div class="py-6 text-center text-xs text-slate-400">Extracting & matching tracks via Mochy InnerTube...</div>';
    try {
      const res = await fetch('/api/import/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: raw })
      });
      const d = await res.json();
      if (!d.success || !d.tracks?.length) {
        box.innerHTML = `<div class="p-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-xs text-red-300">${d.error || 'No tracks matched'}</div>`;
        return;
      }
      _importedTracks = d.tracks;
      _importedTitle = d.playlistTitle || 'Imported Playlist';
      window.__mochyBrowseTracks = _importedTracks;
      box.innerHTML = `
        <div class="flex items-center justify-between flex-wrap gap-2 p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30">
          <div class="text-xs font-bold text-emerald-300">Matched ${_importedTracks.length} tracks for "${_importedTitle}"</div>
          <div class="flex gap-2">
            <button onclick="window.auraPlayBrowseTrack(0)" class="px-3 py-1.5 rounded-xl bg-emerald-500 text-black text-xs font-black cursor-pointer">▶ Play All</button>
            <button onclick="window.auraSaveImportedPlaylist()" class="px-3 py-1.5 rounded-xl bg-white/10 text-white text-xs font-bold cursor-pointer">💾 Save Playlist</button>
          </div>
        </div>
        ${_importedTracks.map((t, i) => `
          <div onclick="window.auraPlayBrowseTrack(${i})" class="flex items-center gap-3 p-2.5 rounded-2xl bg-[#111520] border border-white/[0.06] cursor-pointer">
            <img src="${t.image || '/logo.png'}" class="w-10 h-10 rounded-lg object-cover shrink-0" />
            <div class="min-w-0 flex-1">
              <div class="text-xs font-bold text-white truncate">${(t.name || '').replace(/</g, '&lt;')}</div>
              <div class="text-[11px] text-slate-400 truncate">${(t.artist || '').replace(/</g, '&lt;')}</div>
            </div>
          </div>
        `).join('')}
      `;
    } catch {
      box.innerHTML = '<div class="py-6 text-center text-xs text-red-400">Import failed.</div>';
    }
  };

  window.auraSaveImportedPlaylist = async function() {
    if (!_importedTracks.length) return;
    const uid = getUserId();
    if (uid === 'guest') return toast('Login first to save playlists to your library', 'error');
    try {
      const createRes = await fetch('/api/playlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: uid, name: _importedTitle, isPublic: false })
      });
      const created = await createRes.json();
      const pid = created?.playlist?.id || created?.id;
      if (!pid) return toast('Could not create playlist', 'error');
      for (const song of _importedTracks) {
        await fetch('/api/playlists/add-song', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: uid, playlistId: pid, song })
        });
      }
      toast(`Saved "${_importedTitle}" (${_importedTracks.length} songs) ✓`);
      if (typeof window.__auraRefreshPlaylists === 'function') window.__auraRefreshPlaylists();
    } catch { toast('Save failed', 'error'); }
  };

  // ── 7. Local Device Music Scanner ─────────────────────────────────────────
  let _localFiles = [];
  window.auraOpenLocalScanner = function() {
    openProModal('📁 Local Music Scanner', 'Scan MP3, M4A, FLAC & WAV files from your device', `
      <div class="p-4 rounded-3xl bg-[#111520] border border-white/[0.08] space-y-3">
        <div class="flex flex-wrap gap-2">
          <label class="px-4 py-2.5 rounded-xl bg-emerald-500 text-black text-xs font-black cursor-pointer">
            📂 Scan Music Folder
            <input type="file" webkitdirectory multiple accept="audio/*" style="display:none" onchange="window.auraHandleLocalFiles(this.files)" />
          </label>
          <label class="px-4 py-2.5 rounded-xl bg-white/10 text-white text-xs font-bold cursor-pointer">
            🎵 Pick Audio Files
            <input type="file" multiple accept="audio/*" style="display:none" onchange="window.auraHandleLocalFiles(this.files)" />
          </label>
        </div>
      </div>
      <div id="pro-local-list" class="space-y-2">
        ${_localFiles.length ? renderLocalListHtml() : '<div class="py-8 text-center text-xs text-slate-500">No local tracks scanned yet.</div>'}
      </div>
    `);
  };

  function renderLocalListHtml() {
    return _localFiles.map((t, i) => `
      <div onclick="window.auraPlayLocalFile(${i})" class="flex items-center gap-3 p-3 rounded-2xl bg-[#111520] hover:bg-[#171d2b] border border-white/[0.06] cursor-pointer">
        <div class="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center font-bold">♪</div>
        <div class="min-w-0 flex-1">
          <div class="text-sm font-bold text-white truncate">${t.name.replace(/</g, '&lt;')}</div>
          <div class="text-[11px] text-slate-400 truncate">${t.artist.replace(/</g, '&lt;')} • ${t.sizeMb} MB</div>
        </div>
        <span class="text-xs text-emerald-400 font-bold">▶</span>
      </div>
    `).join('');
  }

  window.auraHandleLocalFiles = function(fileList) {
    const files = Array.from(fileList || []).filter(f => /\.(mp3|m4a|aac|flac|wav|ogg|opus|webm)$/i.test(f.name) || f.type.startsWith('audio/'));
    if (!files.length) return toast('No audio files found', 'error');
    _localFiles = files.map((f, idx) => {
      const base = f.name.replace(/\.[^.]+$/, '');
      const parts = base.split(' - ');
      return {
        id: 'local_' + idx + '_' + f.size,
        name: (parts.length > 1 ? parts.slice(1).join(' - ') : base).trim(),
        artist: (parts.length > 1 ? parts[0] : 'Local Audio').trim(),
        image: '/logo.png',
        url: URL.createObjectURL(f),
        sizeMb: (f.size / (1024 * 1024)).toFixed(1)
      };
    });
    const box = document.getElementById('pro-local-list');
    if (box) box.innerHTML = renderLocalListHtml();
    toast(`Scanned ${_localFiles.length} local tracks ✓`);
  };

  window.auraPlayLocalFile = function(idx) {
    const t = _localFiles[idx];
    if (!t) return;
    if (typeof window.__auraPlaySong === 'function') {
      window.__auraPlaySong(t, _localFiles);
    } else {
      const a = getMainAudio();
      if (a) { a.src = t.url; a.play().catch(() => {}); }
    }
    toast(`▶ ${t.name}`);
  };

  // ── 8. Custom Themes, Fonts, Gestures, Modules & Listening Stats ──────────
  window.auraOpenProCustomize = function() {
    openProModal('🎨 Themes, Fonts, Gestures & Modules', 'Customize AuraMusic × Mochy Engine', `
      <div class="p-4 rounded-3xl bg-[#111520] border border-white/[0.08] space-y-3">
        <h3 class="text-sm font-black text-white">🎨 Accent Color & AMOLED</h3>
        <div class="flex flex-wrap gap-2">
          ${ACCENTS.map(a => `
            <button onclick="window.auraSetProAccent('${a.hex}')" class="px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer border ${pro.themeAccent === a.hex ? 'border-white text-white' : 'border-white/10 text-slate-300'}" style="background:${a.hex}22">
              <span class="inline-block w-2.5 h-2.5 rounded-full mr-1.5" style="background:${a.hex}"></span>${a.name}
            </button>
          `).join('')}
        </div>
        <label class="flex items-center justify-between pt-2 text-xs text-slate-300 cursor-pointer">
          <span>Pure AMOLED Black Background</span>
          <input type="checkbox" ${pro.amoledBg ? 'checked' : ''} onchange="window.auraToggleProFlag('amoledBg', this.checked)" class="accent-emerald-500 w-4 h-4" />
        </label>
      </div>

      <div class="p-4 rounded-3xl bg-[#111520] border border-white/[0.08] space-y-3">
        <h3 class="text-sm font-black text-white">🔤 Custom Font</h3>
        <div class="flex flex-wrap gap-2">
          ${FONTS.map(f => `
            <button onclick="window.auraSetProFont('${f}')" class="px-3 py-2 rounded-xl text-xs font-bold cursor-pointer ${pro.fontFamily === f ? 'bg-emerald-500 text-black' : 'bg-white/[0.05] text-slate-300'}">${f}</button>
          `).join('')}
        </div>
      </div>

      <div class="p-4 rounded-3xl bg-[#111520] border border-white/[0.08] space-y-3">
        <h3 class="text-sm font-black text-white">👆 Gestures & Modules</h3>
        <label class="flex items-center justify-between text-xs text-slate-300 cursor-pointer">
          <span>Player Gestures (Swipe Left/Right = Skip, Down = Close, 2x Tap = Pause)</span>
          <input type="checkbox" ${pro.gesturesEnabled ? 'checked' : ''} onchange="window.auraToggleProFlag('gesturesEnabled', this.checked)" class="accent-emerald-500 w-4 h-4" />
        </label>
        <div class="grid grid-cols-2 gap-2 pt-2">
          ${[
            ['youlyplus', 'YouLy+ Word-Sync'],
            ['simpmusic', 'SimpMusic Lyrics'],
            ['lrclib', 'LRCLib Lyrics'],
            ['netease', 'NetEase Lyrics'],
            ['importer', 'Playlist Importer'],
            ['localScanner', 'Local Scanner']
          ].map(([k, label]) => `
            <label class="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] text-xs text-slate-300 cursor-pointer">
              <span>${label}</span>
              <input type="checkbox" ${pro.modules[k] ? 'checked' : ''} onchange="window.auraToggleProModule('${k}', this.checked)" class="accent-emerald-500" />
            </label>
          `).join('')}
        </div>
      </div>
    `);
  };

  window.auraSetProAccent = (hex) => { pro.themeAccent = hex; savePro(); window.auraOpenProCustomize(); toast('Accent updated ✓'); };
  window.auraSetProFont = (f) => { pro.fontFamily = f; savePro(); window.auraOpenProCustomize(); toast(`Font: ${f}`); };
  window.auraToggleProFlag = (k, v) => { pro[k] = v; savePro(); toast('Saved ✓'); };
  window.auraToggleProModule = (k, v) => { pro.modules[k] = v; savePro(); toast(`${k}: ${v ? 'Enabled' : 'Disabled'}`); };

  window.auraOpenListeningStats = async function() {
    let recent = [];
    try { recent = JSON.parse(localStorage.getItem('auramusic_recently_played') || '[]'); } catch {}
    const artistCounts = {};
    recent.forEach(s => {
      const a = (s.artist || 'Unknown').split(',')[0].trim();
      artistCounts[a] = (artistCounts[a] || 0) + 1;
    });
    const topArtists = Object.entries(artistCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const estMins = Math.round(recent.length * 3.5);
    openProModal('📊 Listening History & Stats', 'Your real listening activity stored locally & synced', `
      <div class="grid grid-cols-3 gap-3">
        <div class="p-4 rounded-2xl bg-[#111520] border border-white/[0.08]">
          <div class="text-[11px] text-slate-400">Tracks Played</div>
          <div class="text-2xl font-black text-emerald-400 mt-1">${recent.length}</div>
        </div>
        <div class="p-4 rounded-2xl bg-[#111520] border border-white/[0.08]">
          <div class="text-[11px] text-slate-400">Est. Minutes</div>
          <div class="text-2xl font-black text-white mt-1">${estMins}m</div>
        </div>
        <div class="p-4 rounded-2xl bg-[#111520] border border-white/[0.08]">
          <div class="text-[11px] text-slate-400">Top Artists</div>
          <div class="text-2xl font-black text-white mt-1">${topArtists.length}</div>
        </div>
      </div>
      ${topArtists.length ? `
        <div class="p-4 rounded-3xl bg-[#111520] border border-white/[0.08] space-y-2">
          <h3 class="text-sm font-black text-white">🏆 Top Artists</h3>
          ${topArtists.map(([n, c]) => `<div class="flex justify-between text-xs text-slate-300"><span>${n.replace(/</g, '&lt;')}</span><span class="text-emerald-400 font-bold">${c} plays</span></div>`).join('')}
        </div>
      ` : ''}
      <div class="p-4 rounded-3xl bg-[#111520] border border-white/[0.08] space-y-2">
        <h3 class="text-sm font-black text-white">🕒 Recent History</h3>
        ${recent.slice(0, 15).map(s => `<div class="flex items-center gap-3 py-1.5 border-b border-white/[0.04]"><img src="${s.image || '/logo.png'}" class="w-8 h-8 rounded object-cover" /><div class="min-w-0 flex-1"><div class="text-xs font-bold text-white truncate">${(s.name || '').replace(/</g, '&lt;')}</div><div class="text-[10px] text-slate-400 truncate">${(s.artist || '').replace(/</g, '&lt;')}</div></div></div>`).join('') || '<div class="text-xs text-slate-500">Play songs to build listening stats.</div>'}
      </div>
    `);
  };

  console.log('🚀 AuraMusic × Mochy Pro Suite v2.0 Loaded.');
})();
