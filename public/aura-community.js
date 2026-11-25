// ═══════════════════════════════════════════════════════════════════════════
// AuraMusic Social Music Community & Profile System v1.0
// • Complete Community Hub (Trending, Recent, Popular Creators, Recommended)
// • Public vs Private Playlists (Default: Private, Toggle anytime)
// • Real Creator Public Profiles & Follow System
// • Playlist Likes, Saved Library Bookmarks & Deep-Link Sharing
// • Exact Avatar Styling & Canvas-based Image Cropping with Zoom/Pan
// ═══════════════════════════════════════════════════════════════════════════
(function AuraCommunityModule() {
  'use strict';

  // ── Helpers & State ────────────────────────────────────────────────────────
  function getUser() {
    try {
      return JSON.parse(localStorage.getItem('auramusic_current_user') || 'null');
    } catch {
      return null;
    }
  }

  function getUserId() {
    const u = getUser();
    return u && (u.id || u._id || u.email) ? (u.id || u._id || u.email) : 'guest';
  }

  function toast(msg, type = 'success') {
    if (window.__auraToast) {
      window.__auraToast(msg);
      return;
    }
    const el = document.createElement('div');
    el.className = 'aura-toast-msg';
    el.textContent = msg;
    Object.assign(el.style, {
      position: 'fixed',
      bottom: '95px',
      left: '50%',
      transform: 'translateX(-50%)',
      background: type === 'error' ? '#ef4444' : '#10b981',
      color: '#ffffff',
      padding: '10px 22px',
      borderRadius: '999px',
      fontSize: '13px',
      fontWeight: '700',
      zIndex: '9999999',
      boxShadow: '0 8px 30px rgba(0,0,0,0.6)',
      pointerEvents: 'none',
      opacity: '0',
      transition: 'opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
    });
    document.body.appendChild(el);
    requestAnimationFrame(() => { el.style.opacity = '1'; });
    setTimeout(() => {
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 250);
    }, 2800);
  }

  // ── Crop Editor State ──────────────────────────────────────────────────────
  let _cropImage = null;
  let _cropScale = 1;
  let _cropMinScale = 1;
  let _cropMaxScale = 3.5;
  let _cropOffset = { x: 0, y: 0 };
  let _isDraggingCrop = false;
  let _cropDragStart = { x: 0, y: 0 };

  // ── Inject Base Styles ─────────────────────────────────────────────────────
  const styleEl = document.createElement('style');
  styleEl.id = 'aura-community-styles';
  styleEl.textContent = `
    .aura-community-badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: 11px;
      font-weight: 700;
      padding: 3px 8px;
      border-radius: 9999px;
      letter-spacing: 0.03em;
    }
    .aura-badge-public {
      background: rgba(16, 185, 129, 0.15);
      border: 1px solid rgba(16, 185, 129, 0.3);
      color: #34d399;
    }
    .aura-badge-private {
      background: rgba(148, 163, 184, 0.12);
      border: 1px solid rgba(148, 163, 184, 0.25);
      color: #94a3b8;
    }
    .aura-community-card {
      background: rgba(22, 27, 38, 0.7);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid rgba(255, 255, 255, 0.07);
      border-radius: 20px;
      padding: 16px;
      transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      display: flex;
      flex-direction: column;
      position: relative;
    }
    .aura-community-card:hover {
      background: rgba(28, 35, 48, 0.9);
      border-color: rgba(16, 185, 129, 0.35);
      transform: translateY(-3px);
      box-shadow: 0 12px 30px rgba(0, 0, 0, 0.5);
    }
    .aura-crop-canvas-box {
      width: 280px;
      height: 280px;
      position: relative;
      overflow: hidden;
      border-radius: 24px; /* Matches exact rounded-3xl styling */
      border: 3px solid rgba(16, 185, 129, 0.4);
      box-shadow: 0 10px 40px rgba(0,0,0,0.8);
      cursor: grab;
      touch-action: none;
      user-select: none;
      background: #090a0f;
    }
    .aura-crop-canvas-box:active {
      cursor: grabbing;
    }
    /* Solid opaque dark background for Community & Detail overlays so nothing bleeds through */
    #aura-community-modal, #aura-creator-profile-modal, #aura-pl-detail-modal {
      background: #07080c !important;
      z-index: 25 !important;
      top: 0;
      bottom: 64px; /* Keep bottom navigation bar always visible & clickable! */
    }
    @media (min-width: 768px) {
      #aura-community-modal, #aura-creator-profile-modal, #aura-pl-detail-modal {
        bottom: 0;
        z-index: 45 !important;
      }
    }
    /* Force 2-column pair grid on mobile in Your Library */
    @media (max-width: 639px) {
      main .grid.grid-cols-1.sm\\:grid-cols-2 {
        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        gap: 0.75rem !important;
      }
      main .grid.grid-cols-1.sm\\:grid-cols-2 > div {
        padding: 0.85rem !important;
        border-radius: 1.25rem !important;
      }
      main .grid.grid-cols-1.sm\\:grid-cols-2 h2 {
        font-size: 1rem !important;
        line-height: 1.25rem !important;
      }
    }
    /* Prevent profile photo zooming anywhere in the application */
    img[src*="/avatars/"], .aura-profile-avatar-img {
      pointer-events: auto;
      user-select: none;
      -webkit-user-drag: none;
    }
  `;
  document.head.appendChild(styleEl);

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. 3-LINE MENU DRAWER & SIDEBAR COMMUNITY BUTTON INJECTION
  // (Removed from top header as requested; placed inside 3-line menu drawer!)
  // ═══════════════════════════════════════════════════════════════════════════
  function injectCommunityNavButtons() {
    // Ensure top header button is removed if previously present
    const oldHeaderBtn = document.getElementById('aura-community-header-btn');
    if (oldHeaderBtn) oldHeaderBtn.remove();

    // Inject into ALL sidebars (desktop sidebar + mobile 3-line hamburger drawer)
    const sidebarNavs = document.querySelectorAll('aside [class*="space-y-1.5"], aside nav');
    sidebarNavs.forEach(sidebarNav => {
      if (sidebarNav.querySelector('.aura-community-sidebar-btn')) return;
      const sBtn = document.createElement('button');
      sBtn.className = 'aura-community-sidebar-btn w-full flex items-center justify-between px-3.5 py-3 rounded-2xl font-bold text-sm transition-all duration-200 text-slate-400 hover:text-white hover:bg-white/[0.05] cursor-pointer';
      sBtn.innerHTML = `
        <div class="flex items-center space-x-3.5">
          <svg class="w-5 h-5 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>
          </svg>
          <span>Community</span>
        </div>
        <span class="text-[10px] uppercase font-black px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">Social</span>
      `;
      sBtn.onclick = () => {
        // Close mobile 3-line drawer if open
        const mobileOverlay = sBtn.closest('.fixed.inset-0');
        if (mobileOverlay) mobileOverlay.click();
        window.auraOpenCommunity();
      };
      sidebarNav.appendChild(sBtn);
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. MAIN COMMUNITY HUB VIEW (Trending, Recent, Creators, Search)
  // ═══════════════════════════════════════════════════════════════════════════
  let _communityFilter = 'all'; // all, trending, recent, creators
  let _communitySearchQuery = '';

  window.auraOpenCommunity = async function() {
    let modal = document.getElementById('aura-community-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'aura-community-modal';
      modal.style.background = '#07080c';
      modal.className = 'fixed inset-x-0 top-0 bottom-16 md:bottom-0 z-[25] md:z-[45] text-slate-100 flex flex-col overflow-hidden animate-fadeIn select-none font-sans';
      document.body.appendChild(modal);
    }
    modal.style.display = 'flex';
    renderCommunityContent();
    loadCommunityFeed();
  };

  window.auraCloseCommunity = function() {
    const modal = document.getElementById('aura-community-modal');
    if (modal) modal.style.display = 'none';
  };

  function renderCommunityContent() {
    const modal = document.getElementById('aura-community-modal');
    if (!modal) return;

    modal.innerHTML = `
      <!-- Community Header -->
      <div class="p-4 sm:p-6 border-b border-white/[0.08] flex items-center justify-between shrink-0 bg-[#0B0E17]/80">
        <div class="flex items-center space-x-3">
          <div class="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-lg shadow-emerald-500/20">
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>
            </svg>
          </div>
          <div>
            <div class="flex items-center space-x-2">
              <h1 class="text-xl sm:text-2xl font-black text-white tracking-tight">Social Music Community</h1>
              <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-black border border-emerald-500/30">
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> LIVE
              </span>
            </div>
            <p class="text-xs text-slate-400">Discover playlists, follow popular creators, and share music taste</p>
          </div>
        </div>
        <div class="flex items-center space-x-2">
          <button onclick="window.auraOpenCreatePlaylistModal()" class="hidden sm:inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-xs transition-all cursor-pointer shadow-lg shadow-emerald-500/20 active:scale-95">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
            <span>Create Playlist</span>
          </button>
          <button onclick="window.auraCloseCommunity()" class="p-2.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer" title="Close Community">
            <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>
      </div>

      <!-- Search & Filters Bar -->
      <div class="p-4 sm:px-6 border-b border-white/[0.06] bg-[#090b12] flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
        <div class="relative w-full sm:w-96">
          <svg class="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          <input
            id="aura-comm-search-input"
            type="text"
            placeholder="Search public playlists, creators, songs..."
            class="w-full pl-10 pr-4 py-2 rounded-xl bg-white/[0.05] border border-white/[0.1] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/60 transition-all"
            value="${_communitySearchQuery}"
          />
        </div>
        <div class="flex items-center space-x-1.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          <button onclick="window.auraSetCommunityFilter('all')" class="px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${_communityFilter === 'all' ? 'bg-emerald-500 text-black shadow-md shadow-emerald-500/20' : 'text-slate-400 hover:text-white bg-white/[0.04]'}">Explore All</button>
          <button onclick="window.auraSetCommunityFilter('trending')" class="px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${_communityFilter === 'trending' ? 'bg-emerald-500 text-black shadow-md shadow-emerald-500/20' : 'text-slate-400 hover:text-white bg-white/[0.04]'}">🔥 Trending</button>
          <button onclick="window.auraSetCommunityFilter('recent')" class="px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${_communityFilter === 'recent' ? 'bg-emerald-500 text-black shadow-md shadow-emerald-500/20' : 'text-slate-400 hover:text-white bg-white/[0.04]'}">✨ Recently Added</button>
          <button onclick="window.auraSetCommunityFilter('creators')" class="px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${_communityFilter === 'creators' ? 'bg-emerald-500 text-black shadow-md shadow-emerald-500/20' : 'text-slate-400 hover:text-white bg-white/[0.04]'}">👑 Popular Creators</button>
        </div>
      </div>

      <!-- Main Feed Content (Scrollable) -->
      <div id="aura-community-body" class="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 space-y-10 pb-36">
        <div class="text-center py-20 text-slate-500 text-sm animate-pulse">
          Loading Community Vibes & Playlists...
        </div>
      </div>
    `;

    // Search input listener
    const searchInput = document.getElementById('aura-comm-search-input');
    if (searchInput) {
      let debounceTimer = null;
      searchInput.oninput = function(e) {
        clearTimeout(debounceTimer);
        _communitySearchQuery = e.target.value.trim();
        debounceTimer = setTimeout(() => {
          loadCommunityFeed();
        }, 300);
      };
    }
  }

  window.auraSetCommunityFilter = function(filter) {
    _communityFilter = filter;
    renderCommunityContent();
    loadCommunityFeed();
  };

  async function loadCommunityFeed() {
    const bodyEl = document.getElementById('aura-community-body');
    if (!bodyEl) return;

    const currentUserId = getUserId();
    let url = `/api/community/feed?userId=${encodeURIComponent(currentUserId)}`;
    if (_communitySearchQuery || _communityFilter !== 'all') {
      url = `/api/community/search?q=${encodeURIComponent(_communitySearchQuery)}&filter=${encodeURIComponent(_communityFilter)}&userId=${encodeURIComponent(currentUserId)}`;
    }

    try {
      const res = await fetch(url);
      const data = await res.json();
      if (!data || !data.success) {
        bodyEl.innerHTML = `<div class="p-12 text-center text-slate-500 text-sm">Failed to load community feed.</div>`;
        return;
      }

      if (_communitySearchQuery || _communityFilter !== 'all') {
        renderSearchResults(bodyEl, data);
      } else {
        renderStandardFeed(bodyEl, data);
      }
    } catch (err) {
      bodyEl.innerHTML = `<div class="p-12 text-center text-red-400 text-sm">Error connecting to community: ${err.message}</div>`;
    }
  }

  function renderStandardFeed(container, data) {
    const { trending, recentlyAdded, popularCreators, discoverUsers, recommended } = data;

    let html = '';

    // 1. Popular Creators Carousel
    if (Array.isArray(popularCreators) && popularCreators.length > 0) {
      html += `
        <section class="space-y-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-2">
              <h2 class="text-lg sm:text-xl font-black text-white">👑 Popular Creators</h2>
              <span class="text-xs text-slate-500">Top community curators</span>
            </div>
          </div>
          <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3.5">
            ${popularCreators.map(c => renderCreatorCard(c)).join('')}
          </div>
        </section>
      `;
    }

    // 2. Trending Playlists Grid
    if (Array.isArray(trending) && trending.length > 0) {
      html += `
        <section class="space-y-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-2">
              <h2 class="text-lg sm:text-xl font-black text-white">🔥 Trending Playlists</h2>
              <span class="text-xs text-slate-500">Most loved by community</span>
            </div>
          </div>
          <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            ${trending.map(pl => renderPlaylistCard(pl)).join('')}
          </div>
        </section>
      `;
    }

    // 3. Recently Added Playlists Grid
    if (Array.isArray(recentlyAdded) && recentlyAdded.length > 0) {
      html += `
        <section class="space-y-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-2">
              <h2 class="text-lg sm:text-xl font-black text-white">✨ Recently Published</h2>
              <span class="text-xs text-slate-500">Fresh public drops</span>
            </div>
          </div>
          <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            ${recentlyAdded.map(pl => renderPlaylistCard(pl)).join('')}
          </div>
        </section>
      `;
    }

    // 4. Discover More Users
    if (Array.isArray(discoverUsers) && discoverUsers.length > 0) {
      html += `
        <section class="space-y-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-2">
              <h2 class="text-lg sm:text-xl font-black text-white">🌟 Discover Listeners</h2>
              <span class="text-xs text-slate-500">Connect with real music fans</span>
            </div>
          </div>
          <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3.5">
            ${discoverUsers.map(c => renderCreatorCard(c)).join('')}
          </div>
        </section>
      `;
    }

    // Empty State Check
    if (!trending?.length && !recentlyAdded?.length && !popularCreators?.length) {
      html = `
        <div class="p-16 text-center max-w-md mx-auto space-y-4">
          <div class="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mx-auto text-2xl">
            🌐
          </div>
          <h3 class="text-xl font-black text-white">Be The First Creator!</h3>
          <p class="text-xs text-slate-400 leading-relaxed">No public playlists published yet. Create your playlist, set visibility to <strong class="text-emerald-400">PUBLIC</strong>, and share your favorite tracks with the world.</p>
          <button onclick="window.auraOpenCreatePlaylistModal()" class="py-2.5 px-6 rounded-xl bg-emerald-500 text-black font-extrabold text-xs uppercase tracking-wider cursor-pointer shadow-lg shadow-emerald-500/30">Create Public Playlist</button>
        </div>
      `;
    }

    container.innerHTML = html;
  }

  function renderSearchResults(container, data) {
    const { playlists, creators } = data;
    let html = '';

    if (creators && creators.length > 0) {
      html += `
        <section class="space-y-4">
          <h2 class="text-lg font-black text-white">Creators (${creators.length})</h2>
          <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3.5">
            ${creators.map(c => renderCreatorCard(c)).join('')}
          </div>
        </section>
      `;
    }

    if (playlists && playlists.length > 0) {
      html += `
        <section class="space-y-4">
          <h2 class="text-lg font-black text-white">Playlists (${playlists.length})</h2>
          <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            ${playlists.map(pl => renderPlaylistCard(pl)).join('')}
          </div>
        </section>
      `;
    }

    if ((!creators || !creators.length) && (!playlists || !playlists.length)) {
      html = `
        <div class="p-16 text-center text-slate-400 text-sm">
          No public playlists or creators matched "<span class="text-white font-bold">${_communitySearchQuery}</span>".
        </div>
      `;
    }

    container.innerHTML = html;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. PLAYLIST CARD COMPONENT
  // ═══════════════════════════════════════════════════════════════════════════
  function renderPlaylistCard(pl) {
    const creator = pl.creator || {};
    const coverUrl = (pl.coverUrl && pl.coverUrl !== '/logo.png' ? pl.coverUrl : '') || (pl.cover && pl.cover !== '/logo.png' ? pl.cover : '') || pl.songs?.[0]?.image || '/logo.png';
    const isLiked = Boolean(pl.isLiked);
    const isSaved = Boolean(pl.isSaved);
    const songsCount = pl.songs?.length || 0;
    const likesCount = pl.likesCount || 0;

    return `
      <div class="aura-community-card group !p-2.5 sm:!p-4" data-playlist-id="${pl.id}">
        <!-- Cover Art (First Song Thumbnail or Gallery Cover) & Quick Play Button -->
        <div onclick="window.auraOpenCommunityPlaylist('${pl.id}')" class="relative w-full aspect-square sm:aspect-video rounded-xl overflow-hidden bg-slate-900 mb-2.5 cursor-pointer">
          <img src="${coverUrl}" alt="${pl.name}" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" loading="eager" />
          <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-80"></div>
          
          <!-- Visibility Badge -->
          <div class="absolute top-1.5 left-1.5 sm:top-2.5 sm:left-2.5">
            <span class="aura-community-badge aura-badge-public !text-[9px] !px-1.5 !py-0.5">
              🌐 PUBLIC
            </span>
          </div>

          <!-- Play Button Overlay -->
          <button onclick="event.stopPropagation(); window.auraPlayCommunityPlaylist('${pl.id}')" class="absolute bottom-2 right-2 w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-emerald-500 hover:bg-emerald-400 text-black flex items-center justify-center shadow-xl shadow-emerald-500/30 transition-transform hover:scale-110 active:scale-95 cursor-pointer" title="Play Playlist">
            <svg class="w-4 h-4 sm:w-5 sm:h-5 ml-0.5 fill-current" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          </button>
        </div>

        <!-- Playlist Title & Song Count (Tap to view songs & creator profile) -->
        <div onclick="window.auraOpenCommunityPlaylist('${pl.id}')" class="flex-1 space-y-0.5 mb-2 cursor-pointer">
          <h3 class="font-bold text-white text-xs sm:text-base leading-snug line-clamp-1 group-hover:text-emerald-400 transition-colors" title="${pl.name}">
            ${pl.name}
          </h3>
          <p class="text-[10px] sm:text-xs text-slate-400 line-clamp-1">${songsCount} tracks</p>
        </div>

        <!-- Creator Profile Row (Clickable to open profile!) -->
        <div class="flex items-center justify-between py-1.5 border-t border-white/[0.06] mb-2">
          <div onclick="event.stopPropagation(); window.auraOpenCreatorProfile('${creator.userId}')" class="flex items-center space-x-1.5 cursor-pointer hover:opacity-85 transition-opacity min-w-0" title="View ${creator.displayName}'s profile">
            <img src="${creator.avatar || '/avatars/p1.jpg'}" alt="${creator.displayName}" class="w-5 h-5 sm:w-6 sm:h-6 rounded-full object-cover ring-1 ring-emerald-500/30 bg-slate-900 shrink-0" />
            <div class="text-[10px] sm:text-xs leading-none truncate">
              <div class="font-bold text-slate-200 truncate">${creator.displayName}</div>
              <div class="text-[9px] sm:text-[10px] text-slate-500 truncate">@${creator.username}</div>
            </div>
          </div>
        </div>

        <!-- Action Buttons: Like, Save, Share -->
        <div class="flex items-center justify-between gap-1 pt-0.5">
          <!-- Like Button -->
          <button onclick="event.stopPropagation(); window.auraToggleLikePlaylist('${pl.id}')" class="flex items-center space-x-1 px-2 py-1 rounded-lg text-[10px] sm:text-xs font-bold transition-all cursor-pointer ${isLiked ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-white/[0.04] text-slate-400 hover:text-white border border-white/[0.05]'}" title="Like Playlist">
            <svg class="w-3.5 h-3.5 ${isLiked ? 'fill-current' : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
            <span id="aura-pl-likes-${pl.id}">${likesCount}</span>
          </button>

          <!-- Save to Library Button -->
          <button onclick="event.stopPropagation(); window.auraToggleSavePlaylist('${pl.id}')" class="flex items-center space-x-1 px-2 py-1 rounded-lg text-[10px] sm:text-xs font-bold transition-all cursor-pointer ${isSaved ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-white/[0.04] text-slate-400 hover:text-white border border-white/[0.05]'}" title="Save to Personal Library">
            <svg class="w-3.5 h-3.5 ${isSaved ? 'fill-current' : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/></svg>
            <span class="hidden sm:inline">${isSaved ? 'Saved' : 'Save'}</span>
          </button>

          <!-- Share Button -->
          <button onclick="event.stopPropagation(); window.auraSharePlaylist('${pl.id}', '${encodeURIComponent(pl.name)}')" class="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-white border border-white/[0.05] transition-colors cursor-pointer" title="Share Playlist Link">
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
          </button>
        </div>
      </div>
    `;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. CREATOR CARD COMPONENT
  // ═══════════════════════════════════════════════════════════════════════════
  function renderCreatorCard(creator) {
    const isFollowing = Boolean(creator.isFollowing);
    const isMe = getUserId() === creator.userId;

    return `
      <div class="p-4 rounded-2xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] flex flex-col items-center text-center space-y-3 transition-all">
        <!-- Avatar using exact styling -->
        <div onclick="window.auraOpenCreatorProfile('${creator.userId}')" class="relative cursor-pointer group">
          <img src="${creator.avatar || '/avatars/p1.jpg'}" alt="${creator.displayName}" class="w-16 h-16 rounded-2xl object-cover ring-2 ring-emerald-500/30 group-hover:ring-emerald-400 shadow-lg bg-slate-900 transition-all" />
        </div>
        <div onclick="window.auraOpenCreatorProfile('${creator.userId}')" class="space-y-0.5 cursor-pointer">
          <div class="font-extrabold text-white text-xs line-clamp-1 hover:text-emerald-400 transition-colors">${creator.displayName}</div>
          <div class="text-[10px] text-slate-500">@${creator.username}</div>
          <div class="text-[10px] text-emerald-400/80 font-bold pt-0.5">${creator.followersCount || 0} followers</div>
        </div>
        ${!isMe ? `
          <button onclick="window.auraToggleFollowUser('${creator.userId}', this)" class="w-full py-1.5 px-3 rounded-xl text-[11px] font-extrabold transition-all cursor-pointer ${isFollowing ? 'bg-white/[0.08] text-slate-300 border border-white/10' : 'bg-emerald-500 text-black shadow-md shadow-emerald-500/20 hover:bg-emerald-400'}">
            ${isFollowing ? 'Following' : 'Follow'}
          </button>
        ` : `
          <span class="text-[10px] text-slate-500 font-bold py-1">You</span>
        `}
      </div>
    `;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. PUBLIC CREATOR PROFILE MODAL
  // ═══════════════════════════════════════════════════════════════════════════
  window.auraOpenCreatorProfile = async function(userId) {
    if (!userId) return;
    const currentUserId = getUserId();

    let modal = document.getElementById('aura-creator-profile-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'aura-creator-profile-modal';
      modal.className = 'fixed inset-0 z-[10000] bg-[#07080c]/98 backdrop-blur-2xl text-slate-100 flex flex-col overflow-y-auto animate-fadeIn select-none font-sans p-4 sm:p-8';
      document.body.appendChild(modal);
    }
    modal.style.display = 'flex';
    modal.innerHTML = `
      <div class="max-w-4xl mx-auto w-full py-6 space-y-6">
        <div class="flex justify-end">
          <button onclick="document.getElementById('aura-creator-profile-modal').style.display='none'" class="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-white/[0.08] cursor-pointer">
            <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="text-center py-20 text-slate-500 text-sm animate-pulse">Loading creator profile...</div>
      </div>
    `;

    try {
      const res = await fetch(`/api/community/profile?userId=${encodeURIComponent(userId)}&authUserId=${encodeURIComponent(currentUserId)}`);
      const data = await res.json();
      if (!data || !data.success || !data.profile) {
        modal.innerHTML = `
          <div class="max-w-md mx-auto text-center py-20 space-y-4">
            <h2 class="text-xl font-bold text-white">Profile Not Found</h2>
            <button onclick="document.getElementById('aura-creator-profile-modal').style.display='none'" class="px-5 py-2 rounded-xl bg-white/10 text-white text-xs font-bold">Close</button>
          </div>
        `;
        return;
      }

      const p = data.profile;
      const isMe = currentUserId === p.userId;
      const playlists = p.playlists || [];

      modal.innerHTML = `
        <div class="max-w-4xl mx-auto w-full py-4 space-y-8 pb-32">
          <!-- Top Bar -->
          <div class="flex items-center justify-between">
            <button onclick="document.getElementById('aura-creator-profile-modal').style.display='none'" class="inline-flex items-center space-x-1.5 text-xs font-bold text-slate-400 hover:text-white cursor-pointer py-1">
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg>
              <span>Back to Community</span>
            </button>
            <button onclick="document.getElementById('aura-creator-profile-modal').style.display='none'" class="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-white/[0.08] cursor-pointer">
              <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
          </div>

          <!-- Hero Profile Card: REUSING EXACT PROFILE AVATAR DIMENSIONS AND CLASSES -->
          <div class="relative rounded-3xl bg-[#0e1320] border border-white/[0.08] p-6 sm:p-8 flex flex-col sm:flex-row items-center sm:items-start gap-6 shadow-2xl">
            <!-- Exact profile avatar classes: w-28 h-28 md:w-32 md:h-32 rounded-3xl object-cover ring-4 ring-emerald-500/30 shadow-2xl bg-slate-900 -->
            <div class="relative shrink-0">
              <img src="${p.avatar || '/avatars/p1.jpg'}" alt="${p.displayName}" class="w-28 h-28 md:w-32 md:h-32 rounded-3xl object-cover ring-4 ring-emerald-500/30 shadow-2xl bg-slate-900 pointer-events-none" />
            </div>

            <div class="space-y-3 text-center sm:text-left flex-1">
              <div class="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                <span class="inline-flex items-center space-x-1 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold">
                  <span>Aura Creator</span>
                </span>
                <span class="text-xs text-slate-400 font-mono">@${p.username}</span>
              </div>
              <h1 class="text-2xl sm:text-3xl font-black text-white tracking-tight">${p.displayName}</h1>
              ${p.bio ? `<p class="text-xs sm:text-sm text-slate-300 max-w-xl leading-relaxed">${p.bio}</p>` : `<p class="text-xs text-slate-500 italic">No bio provided yet.</p>`}
              
              <!-- Stats Row: Followers, Following, Playlists -->
              <div class="flex items-center justify-center sm:justify-start gap-6 pt-2">
                <div class="cursor-pointer" onclick="window.auraOpenFollowersList('${p.userId}', 'followers')">
                  <div class="text-base font-black text-white">${p.followersCount || 0}</div>
                  <div class="text-[11px] text-slate-400">Followers</div>
                </div>
                <div class="cursor-pointer" onclick="window.auraOpenFollowersList('${p.userId}', 'following')">
                  <div class="text-base font-black text-white">${p.followingCount || 0}</div>
                  <div class="text-[11px] text-slate-400">Following</div>
                </div>
                <div>
                  <div class="text-base font-black text-emerald-400">${p.publicPlaylistsCount || 0}</div>
                  <div class="text-[11px] text-slate-400">Public Playlists</div>
                </div>
              </div>
            </div>

            <!-- Follow / Edit Profile Action Button -->
            <div class="self-center sm:self-start">
              ${isMe ? `
                <button onclick="window.auraOpenEditProfileModal()" class="py-2 px-5 rounded-xl bg-white/[0.08] hover:bg-white/[0.15] text-white text-xs font-bold border border-white/10 transition-all cursor-pointer">Edit Profile</button>
              ` : `
                <button onclick="window.auraToggleFollowUser('${p.userId}', this)" class="py-2.5 px-6 rounded-xl text-xs font-extrabold transition-all cursor-pointer shadow-lg ${p.isFollowing ? 'bg-white/[0.08] text-slate-300 border border-white/10' : 'bg-emerald-500 text-black hover:bg-emerald-400 shadow-emerald-500/20'}">
                  ${p.isFollowing ? 'Following' : 'Follow Creator'}
                </button>
              `}
            </div>
          </div>

          <!-- Creator's Public Playlists Grid (Strictly ONLY Public Playlists) -->
          <div class="space-y-4">
            <div class="flex items-center justify-between border-b border-white/[0.06] pb-3">
              <h2 class="text-lg font-black text-white">Public Playlists by ${p.displayName}</h2>
              <span class="text-xs text-slate-500">${playlists.length} playlists</span>
            </div>
            ${playlists.length > 0 ? `
              <div class="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
                ${playlists.map(pl => renderPlaylistCard(pl)).join('')}
              </div>
            ` : `
              <div class="p-12 text-center text-slate-500 text-xs">This creator has not published any public playlists yet.</div>
            `}
          </div>
        </div>
      `;
    } catch (e) {
      modal.innerHTML = `<div class="p-12 text-center text-red-400 text-sm">Failed to load profile: ${e.message}</div>`;
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. FOLLOW / UNFOLLOW SYSTEM
  // ═══════════════════════════════════════════════════════════════════════════
  window.auraToggleFollowUser = async function(followingId, btnEl) {
    const currentUserId = getUserId();
    if (currentUserId === 'guest') {
      toast('Please sign in to follow creators.', 'error');
      return;
    }

    try {
      const res = await fetch('/api/community/users/follow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ followerId: currentUserId, followingId: followingId })
      });
      const data = await res.json();
      if (!data || !data.success) {
        toast(data.error || 'Follow action failed', 'error');
        return;
      }

      if (btnEl) {
        if (data.isFollowing) {
          btnEl.textContent = 'Following';
          btnEl.className = btnEl.className.replace('bg-emerald-500 text-black', 'bg-white/[0.08] text-slate-300 border border-white/10');
          toast('Following creator ✓');
        } else {
          btnEl.textContent = 'Follow';
          btnEl.className = btnEl.className.replace('bg-white/[0.08] text-slate-300 border border-white/10', 'bg-emerald-500 text-black');
          toast('Unfollowed creator');
        }
      }
    } catch (e) {
      toast('Network error while following: ' + e.message, 'error');
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 7. PLAYLIST LIKES & SAVING
  // ═══════════════════════════════════════════════════════════════════════════
  window.auraToggleLikePlaylist = async function(playlistId) {
    const currentUserId = getUserId();
    if (currentUserId === 'guest') {
      toast('Please sign in to like playlists.', 'error');
      return;
    }

    try {
      const res = await fetch('/api/community/playlists/like', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playlistId, userId: currentUserId })
      });
      const data = await res.json();
      if (!data || !data.success) {
        toast(data.error || 'Failed to like playlist', 'error');
        return;
      }

      const counter = document.getElementById(`aura-pl-likes-${playlistId}`);
      if (counter) counter.textContent = data.likesCount;
      toast(data.isLiked ? 'Added to Liked Playlists ❤️' : 'Removed from Liked Playlists');
      loadCommunityFeed();
    } catch (e) {
      toast('Error liking playlist: ' + e.message, 'error');
    }
  };

  window.auraToggleSavePlaylist = async function(playlistId) {
    const currentUserId = getUserId();
    if (currentUserId === 'guest') {
      toast('Please sign in to save playlists to your library.', 'error');
      return;
    }

    try {
      const res = await fetch('/api/community/playlists/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playlistId, userId: currentUserId })
      });
      const data = await res.json();
      if (!data || !data.success) {
        toast(data.error || 'Failed to save playlist', 'error');
        return;
      }

      toast(data.message || (data.isSaved ? 'Saved to your library ✓' : 'Removed from your library'));
      loadCommunityFeed();
    } catch (e) {
      toast('Error saving playlist: ' + e.message, 'error');
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 8. PLAY COMMUNITY PLAYLIST IN MAIN PLAYER
  // ═══════════════════════════════════════════════════════════════════════════
  window.auraPlayCommunityPlaylist = async function(playlistId) {
    try {
      const currentUserId = getUserId();
      const res = await fetch(`/api/playlists/details?id=${encodeURIComponent(playlistId)}&userId=${encodeURIComponent(currentUserId)}`);
      const data = await res.json();
      if (!data || !data.success || !data.playlist) {
        toast(data.error || 'Unable to open playlist', 'error');
        return;
      }

      const pl = data.playlist;
      const songs = pl.songs || [];
      if (songs.length === 0) {
        toast(`"${pl.name}" is currently empty.`, 'error');
        return;
      }

      // Play through main AuraMusic player
      if (window.__auraPlaySong) {
        window.__auraPlaySong(songs[0], songs);
        toast(`▶ Playing "${pl.name}" (${songs.length} tracks)`);
        window.auraCloseCommunity();
      } else {
        localStorage.setItem('auramusic_queue', JSON.stringify(songs));
        localStorage.setItem('auramusic_queue_index', '0');
        localStorage.setItem('auramusic_current_song', JSON.stringify(songs[0]));
        toast(`▶ Loaded "${pl.name}" into queue`);
      }
    } catch (e) {
      toast('Failed to play playlist: ' + e.message, 'error');
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 9. SHARE PLAYLIST (Link Generation & Native Web Share)
  // ═══════════════════════════════════════════════════════════════════════════
  window.auraSharePlaylist = function(playlistId, plNameEnc) {
    const name = decodeURIComponent(plNameEnc || 'Playlist');
    const shareUrl = `${window.location.origin}/#playlist=${playlistId}`;

    // Native Web Share API if available on mobile
    if (navigator.share) {
      navigator.share({
        title: `${name} on AuraMusic`,
        text: `Listen to "${name}" on AuraMusic Social Community!`,
        url: shareUrl
      }).catch(() => {});
      return;
    }

    // Modal Copy Dialog
    let modal = document.getElementById('aura-share-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'aura-share-modal';
      modal.className = 'fixed inset-0 z-[11000] bg-black/80 backdrop-blur-md flex items-center justify-center p-4';
      document.body.appendChild(modal);
    }
    modal.style.display = 'flex';
    modal.innerHTML = `
      <div class="w-full max-w-md bg-[#121622] border border-white/[0.08] rounded-2xl p-6 space-y-5 shadow-2xl">
        <div class="flex items-center justify-between">
          <div class="flex items-center space-x-2">
            <svg class="w-5 h-5 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
            <h3 class="text-base font-bold text-white">Share Playlist</h3>
          </div>
          <button onclick="document.getElementById('aura-share-modal').style.display='none'" class="text-slate-400 hover:text-white p-1">
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <p class="text-xs text-slate-400">Share <strong class="text-white">"${name}"</strong> with your friends on WhatsApp, Instagram, or Twitter:</p>
        <div class="flex items-center space-x-2">
          <input type="text" readonly value="${shareUrl}" id="aura-share-link-input" class="flex-1 py-2 px-3 rounded-xl bg-white/[0.04] border border-white/10 text-xs text-slate-300 font-mono select-all focus:outline-none" />
          <button onclick="window.auraCopyShareLink()" class="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-xs transition-colors cursor-pointer">Copy</button>
        </div>
        <div class="flex items-center justify-center space-x-3 pt-2">
          <a href="https://api.whatsapp.com/send?text=${encodeURIComponent(`Listen to "${name}" on AuraMusic: ${shareUrl}`)}" target="_blank" class="px-3.5 py-2 rounded-xl bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 text-xs font-bold hover:bg-emerald-600/30">WhatsApp</a>
          <a href="https://twitter.com/intent/tweet?text=${encodeURIComponent(`Listening to "${name}" on @AuraMusic: ${shareUrl}`)}" target="_blank" class="px-3.5 py-2 rounded-xl bg-sky-500/20 text-sky-400 border border-sky-500/30 text-xs font-bold hover:bg-sky-500/30">Twitter / X</a>
          <a href="https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(`Listen to "${name}" on AuraMusic`)}" target="_blank" class="px-3.5 py-2 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30 text-xs font-bold hover:bg-blue-500/30">Telegram</a>
        </div>
      </div>
    `;
  };

  window.auraCopyShareLink = function() {
    const input = document.getElementById('aura-share-link-input');
    if (input) {
      input.select();
      navigator.clipboard.writeText(input.value).then(() => {
        toast('Link copied to clipboard ✓');
        const modal = document.getElementById('aura-share-modal');
        if (modal) modal.style.display = 'none';
      }).catch(() => {
        document.execCommand('copy');
        toast('Link copied ✓');
      });
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 10. CREATE PLAYLIST WITH VISIBILITY (DEFAULT: PRIVATE)
  // ═══════════════════════════════════════════════════════════════════════════
  window.auraOpenCreatePlaylistModal = function() {
    const u = getUser();
    if (!u) {
      toast('Please sign in to create playlists.', 'error');
      return;
    }

    let modal = document.getElementById('aura-create-pl-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'aura-create-pl-modal';
      modal.className = 'fixed inset-0 z-[12000] bg-black/85 backdrop-blur-lg flex items-center justify-center p-4 animate-fadeIn font-sans';
      document.body.appendChild(modal);
    }
    modal.style.display = 'flex';

    modal.innerHTML = `
      <div class="w-full max-w-md bg-[#111522] border border-white/[0.08] rounded-3xl p-6 sm:p-7 space-y-5 shadow-2xl">
        <div class="flex items-center justify-between">
          <div class="flex items-center space-x-2.5">
            <div class="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
            </div>
            <h3 class="text-lg font-black text-white">Create New Playlist</h3>
          </div>
          <button onclick="document.getElementById('aura-create-pl-modal').style.display='none'" class="text-slate-400 hover:text-white p-1">
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <div class="space-y-4 text-xs">
          <div>
            <label class="block text-slate-300 font-bold mb-1.5">Playlist Name *</label>
            <input id="aura-new-pl-name" type="text" placeholder="e.g. Late Night Lo-Fi Vibes" class="w-full py-2.5 px-3.5 rounded-xl bg-white/[0.04] border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500" />
          </div>

          <div>
            <label class="block text-slate-300 font-bold mb-1.5">Description (Optional)</label>
            <textarea id="aura-new-pl-desc" rows="2" placeholder="Tell listeners what makes this playlist special..." class="w-full py-2 px-3.5 rounded-xl bg-white/[0.04] border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 resize-none"></textarea>
          </div>

          <!-- Visibility Selector: Strict Requirement: DEFAULT MUST BE PRIVATE -->
          <div>
            <label class="block text-slate-300 font-bold mb-2">Playlist Visibility *</label>
            <div class="grid grid-cols-2 gap-3">
              <!-- Private Option (Default) -->
              <label class="flex flex-col p-3 rounded-2xl border cursor-pointer transition-all border-emerald-500/60 bg-emerald-500/10" id="aura-vis-private-label">
                <div class="flex items-center space-x-2 mb-1">
                  <input type="radio" name="aura_pl_vis" value="private" checked onchange="window.auraUpdateVisSelection('private')" class="text-emerald-500 accent-emerald-500" />
                  <span class="font-extrabold text-white text-xs">🔒 Private</span>
                </div>
                <span class="text-[10px] text-slate-400 leading-tight">Default. Visible only to you. Never shown in Community.</span>
              </label>

              <!-- Public Option -->
              <label class="flex flex-col p-3 rounded-2xl border cursor-pointer transition-all border-white/[0.08] bg-white/[0.02]" id="aura-vis-public-label">
                <div class="flex items-center space-x-2 mb-1">
                  <input type="radio" name="aura_pl_vis" value="public" onchange="window.auraUpdateVisSelection('public')" class="text-emerald-500 accent-emerald-500" />
                  <span class="font-extrabold text-white text-xs">🌐 Public</span>
                </div>
                <span class="text-[10px] text-slate-400 leading-tight">Visible in Community & on your profile. Others can discover & like.</span>
              </label>
            </div>
          </div>
        </div>

        <div class="flex items-center justify-end space-x-2.5 pt-2 border-t border-white/[0.06]">
          <button onclick="document.getElementById('aura-create-pl-modal').style.display='none'" class="px-4 py-2.5 rounded-xl text-slate-400 hover:text-white text-xs font-bold cursor-pointer">Cancel</button>
          <button onclick="window.auraSubmitCreatePlaylist()" class="px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-xs transition-all shadow-lg shadow-emerald-500/20 cursor-pointer active:scale-95">Create Playlist</button>
        </div>
      </div>
    `;
  };

  window.auraUpdateVisSelection = function(val) {
    const privL = document.getElementById('aura-vis-private-label');
    const pubL = document.getElementById('aura-vis-public-label');
    if (val === 'private') {
      privL.className = 'flex flex-col p-3 rounded-2xl border cursor-pointer transition-all border-emerald-500/60 bg-emerald-500/10';
      pubL.className = 'flex flex-col p-3 rounded-2xl border cursor-pointer transition-all border-white/[0.08] bg-white/[0.02]';
    } else {
      pubL.className = 'flex flex-col p-3 rounded-2xl border cursor-pointer transition-all border-emerald-500/60 bg-emerald-500/10';
      privL.className = 'flex flex-col p-3 rounded-2xl border cursor-pointer transition-all border-white/[0.08] bg-white/[0.02]';
    }
  };

  window.auraSubmitCreatePlaylist = async function() {
    const nameInput = document.getElementById('aura-new-pl-name');
    const descInput = document.getElementById('aura-new-pl-desc');
    const visInput = document.querySelector('input[name="aura_pl_vis"]:checked');

    const name = nameInput ? nameInput.value.trim() : '';
    const desc = descInput ? descInput.value.trim() : '';
    const visibility = visInput ? visInput.value : 'private';

    if (!name) {
      toast('Please enter a playlist name.', 'error');
      return;
    }

    const currentUserId = getUserId();
    try {
      const res = await fetch('/api/playlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUserId,
          name: name,
          description: desc,
          visibility: visibility
        })
      });
      const data = await res.json();
      if (!data || !data.success) {
        toast(data.error || 'Failed to create playlist.', 'error');
        return;
      }

      toast(`Playlist "${name}" created (${visibility}) ✓`);
      document.getElementById('aura-create-pl-modal').style.display = 'none';
      loadCommunityFeed();
    } catch (e) {
      toast('Error creating playlist: ' + e.message, 'error');
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 11. PROFILE EDIT MODAL (Name, Username, Bio, Photo Trigger)
  // ═══════════════════════════════════════════════════════════════════════════
  window.auraOpenEditProfileModal = function() {
    const u = getUser();
    if (!u) {
      toast('Please sign in to edit your profile.', 'error');
      return;
    }

    let modal = document.getElementById('aura-edit-profile-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'aura-edit-profile-modal';
      modal.className = 'fixed inset-0 z-[12000] bg-black/85 backdrop-blur-lg flex items-center justify-center p-4 animate-fadeIn font-sans';
      document.body.appendChild(modal);
    }
    modal.style.display = 'flex';

    const currentName = u.name || '';
    const currentUsername = (u.email ? u.email.split('@')[0] : 'user').replace(/[^a-zA-Z0-9_]/g, '');
    const currentAvatar = u.avatar || '/avatars/p1.jpg';

    modal.innerHTML = `
      <div class="w-full max-w-lg bg-[#111522] border border-white/[0.08] rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl">
        <div class="flex items-center justify-between">
          <h3 class="text-xl font-black text-white">Edit Your Profile</h3>
          <button onclick="document.getElementById('aura-edit-profile-modal').style.display='none'" class="text-slate-400 hover:text-white p-1">
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <!-- Profile Photo / Avatar with exact styling -->
        <div class="flex items-center space-x-4">
          <div class="relative group">
            <img id="aura-edit-avatar-preview" src="${currentAvatar}" alt="Profile Avatar" class="w-20 h-20 rounded-2xl object-cover ring-2 ring-emerald-500/40 bg-slate-900 pointer-events-none" />
            <button onclick="document.getElementById('aura-avatar-file-input').click()" class="absolute inset-0 bg-black/60 rounded-2xl flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-[10px] font-bold text-white">
              <svg class="w-4 h-4 mb-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
              <span>Change</span>
            </button>
          </div>
          <div class="space-y-1.5">
            <div class="text-xs font-bold text-white">Profile Photo</div>
            <p class="text-[11px] text-slate-400">Upload any JPG, PNG, or WEBP. You can crop and reposition it.</p>
            <div class="flex items-center space-x-2 pt-1">
              <button onclick="document.getElementById('aura-avatar-file-input').click()" class="py-1 px-3 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-bold cursor-pointer">Upload Photo</button>
              <button onclick="window.auraResetProfilePhoto()" class="py-1 px-3 rounded-lg bg-white/[0.04] hover:bg-red-500/10 text-slate-400 hover:text-red-400 border border-white/10 text-xs font-bold cursor-pointer">Remove</button>
            </div>
            <input type="file" id="aura-avatar-file-input" accept="image/jpeg,image/png,image/webp" style="display:none;" onchange="window.auraHandleAvatarFileSelect(this)" />
          </div>
        </div>

        <div class="space-y-4 text-xs">
          <div>
            <label class="block text-slate-300 font-bold mb-1.5">Display Name *</label>
            <input id="aura-edit-name" type="text" value="${currentName}" class="w-full py-2.5 px-3.5 rounded-xl bg-white/[0.04] border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500" />
          </div>

          <div>
            <label class="block text-slate-300 font-bold mb-1.5">Username * (Unique Community Tag)</label>
            <div class="relative">
              <span class="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 font-mono">@</span>
              <input id="aura-edit-username" type="text" value="${currentUsername}" placeholder="your_name" class="w-full pl-8 pr-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono" />
            </div>
          </div>

          <div>
            <div class="flex items-center justify-between mb-1.5">
              <label class="block text-slate-300 font-bold">Bio</label>
              <span id="aura-bio-counter" class="text-[10px] text-slate-500">0 / 300</span>
            </div>
            <textarea id="aura-edit-bio" rows="3" maxlength="300" placeholder="A few words about your music tastes, favorite artists, or vibe..." class="w-full py-2 px-3.5 rounded-xl bg-white/[0.04] border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 resize-none"></textarea>
          </div>
        </div>

        <div class="flex items-center justify-end space-x-2.5 pt-2 border-t border-white/[0.06]">
          <button onclick="document.getElementById('aura-edit-profile-modal').style.display='none'" class="px-4 py-2.5 rounded-xl text-slate-400 hover:text-white text-xs font-bold cursor-pointer">Cancel</button>
          <button onclick="window.auraSubmitProfileEdit()" class="px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-xs transition-all shadow-lg shadow-emerald-500/20 cursor-pointer active:scale-95">Save Changes</button>
        </div>
      </div>
    `;

    // Fetch existing bio from server
    fetch(`/api/community/profile?userId=${encodeURIComponent(getUserId())}`)
      .then(r => r.json())
      .then(d => {
        if (d && d.profile) {
          const bioInput = document.getElementById('aura-edit-bio');
          const counter = document.getElementById('aura-bio-counter');
          if (bioInput && d.profile.bio) {
            bioInput.value = d.profile.bio;
            if (counter) counter.textContent = `${d.profile.bio.length} / 300`;
          }
          if (bioInput) {
            bioInput.oninput = () => {
              if (counter) counter.textContent = `${bioInput.value.length} / 300`;
            };
          }
        }
      }).catch(() => {});
  };

  window.auraSubmitProfileEdit = async function() {
    const nameInput = document.getElementById('aura-edit-name');
    const usernameInput = document.getElementById('aura-edit-username');
    const bioInput = document.getElementById('aura-edit-bio');

    const displayName = nameInput ? nameInput.value.trim() : '';
    const username = usernameInput ? usernameInput.value.trim().replace(/^@/, '') : '';
    const bio = bioInput ? bioInput.value.trim().slice(0, 300) : '';

    if (!displayName) {
      toast('Display name cannot be empty.', 'error');
      return;
    }

    const currentUserId = getUserId();
    try {
      const res = await fetch('/api/community/profile/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUserId,
          displayName,
          username,
          bio
        })
      });
      const data = await res.json();
      if (!data || !data.success) {
        toast(data.error || 'Failed to update profile.', 'error');
        return;
      }

      // Update local storage user
      const u = getUser();
      if (u) {
        u.name = displayName;
        localStorage.setItem('auramusic_current_user', JSON.stringify(u));
      }

      toast('Profile updated successfully ✓');
      document.getElementById('aura-edit-profile-modal').style.display = 'none';
      loadCommunityFeed();
    } catch (e) {
      toast('Error saving profile: ' + e.message, 'error');
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 12. INTERACTIVE CANVAS CROP EDITOR (1:1 Aspect Ratio matching Avatar)
  // ═══════════════════════════════════════════════════════════════════════════
  window.auraHandleAvatarFileSelect = function(input) {
    if (!input.files || !input.files[0]) return;
    const file = input.files[0];

    // File validation: JPG, PNG, WEBP, max 5MB
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type.toLowerCase())) {
      toast('Please choose a valid JPG, JPEG, PNG, or WEBP image.', 'error');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast('Image exceeds maximum allowed size of 5MB.', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
      const img = new Image();
      img.onload = function() {
        _cropImage = img;
        window.auraOpenCropModal();
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
    input.value = ''; // Reset input
  };

  window.auraOpenCropModal = function() {
    if (!_cropImage) return;

    let modal = document.getElementById('aura-crop-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'aura-crop-modal';
      modal.className = 'fixed inset-0 z-[13000] bg-black/90 backdrop-blur-xl flex items-center justify-center p-4 animate-fadeIn select-none font-sans';
      document.body.appendChild(modal);
    }
    modal.style.display = 'flex';

    modal.innerHTML = `
      <div class="w-full max-w-md bg-[#101420] border border-white/[0.08] rounded-3xl p-6 sm:p-7 flex flex-col items-center space-y-5 shadow-2xl">
        <div class="w-full flex items-center justify-between">
          <div class="flex items-center space-x-2">
            <h3 class="text-base font-extrabold text-white">Crop & Position Photo</h3>
          </div>
          <button onclick="document.getElementById('aura-crop-modal').style.display='none'" class="text-slate-400 hover:text-white p-1">
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <p class="text-[11px] text-slate-400 text-center leading-tight">Drag to reposition. Use slider below to zoom into your profile avatar.</p>

        <!-- Canvas Container: Exact Aspect Ratio 1:1 with rounded-3xl preview mask -->
        <div class="aura-crop-canvas-box shadow-2xl" id="aura-crop-box">
          <canvas id="aura-crop-canvas" width="280" height="280" class="w-full h-full block"></canvas>
        </div>

        <!-- Zoom Slider & Controls -->
        <div class="w-full space-y-2">
          <div class="flex items-center justify-between text-xs text-slate-400">
            <span>Zoom</span>
            <span id="aura-crop-zoom-label" class="font-mono text-emerald-400 font-bold">1.0x</span>
          </div>
          <div class="flex items-center space-x-3">
            <button onclick="window.auraAdjustCropZoom(-0.15)" class="w-7 h-7 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-white flex items-center justify-center font-bold text-sm cursor-pointer">-</button>
            <input type="range" id="aura-crop-slider" min="1" max="3" step="0.05" value="1" class="flex-1 accent-emerald-500 cursor-pointer" oninput="window.auraSetCropScale(this.value)" />
            <button onclick="window.auraAdjustCropZoom(0.15)" class="w-7 h-7 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-white flex items-center justify-center font-bold text-sm cursor-pointer">+</button>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="w-full flex items-center justify-end space-x-2.5 pt-2 border-t border-white/[0.06]">
          <button onclick="document.getElementById('aura-crop-modal').style.display='none'" class="px-4 py-2.5 rounded-xl text-slate-400 hover:text-white text-xs font-bold cursor-pointer">Cancel</button>
          <button onclick="window.auraSaveCroppedAvatar()" class="px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-xs transition-all shadow-lg shadow-emerald-500/20 cursor-pointer active:scale-95">Apply & Save Photo</button>
        </div>
      </div>
    `;

    initCropCanvas();
  };

  function initCropCanvas() {
    const canvas = document.getElementById('aura-crop-canvas');
    const box = document.getElementById('aura-crop-box');
    if (!canvas || !box || !_cropImage) return;

    // Reset crop transform
    _cropScale = 1;
    _cropOffset = { x: 0, y: 0 };

    const ctx = canvas.getContext('2d');

    // Pointer events for smooth mouse & touch dragging
    box.onpointerdown = function(e) {
      _isDraggingCrop = true;
      _cropDragStart = { x: e.clientX - _cropOffset.x, y: e.clientY - _cropOffset.y };
      box.setPointerCapture(e.pointerId);
    };

    box.onpointermove = function(e) {
      if (!_isDraggingCrop) return;
      _cropOffset.x = e.clientX - _cropDragStart.x;
      _cropOffset.y = e.clientY - _cropDragStart.y;
      drawCropCanvas(ctx, canvas);
    };

    box.onpointerup = function(e) {
      _isDraggingCrop = false;
      try { box.releasePointerCapture(e.pointerId); } catch (_) {}
    };

    drawCropCanvas(ctx, canvas);
  }

  function drawCropCanvas(ctx, canvas) {
    if (!_cropImage) return;
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    // Calculate aspect fit
    const imgAspect = _cropImage.width / _cropImage.height;
    let drawW = w;
    let drawH = h;
    if (imgAspect > 1) {
      drawH = h;
      drawW = h * imgAspect;
    } else {
      drawW = w;
      drawH = w / imgAspect;
    }

    drawW *= _cropScale;
    drawH *= _cropScale;

    const centerX = w / 2 + _cropOffset.x;
    const centerY = h / 2 + _cropOffset.y;

    ctx.drawImage(_cropImage, centerX - drawW / 2, centerY - drawH / 2, drawW, drawH);
  }

  window.auraSetCropScale = function(val) {
    _cropScale = parseFloat(val);
    const label = document.getElementById('aura-crop-zoom-label');
    if (label) label.textContent = `${_cropScale.toFixed(1)}x`;
    const canvas = document.getElementById('aura-crop-canvas');
    if (canvas) drawCropCanvas(canvas.getContext('2d'), canvas);
  };

  window.auraAdjustCropZoom = function(delta) {
    const slider = document.getElementById('aura-crop-slider');
    if (slider) {
      const nextVal = Math.max(1, Math.min(3, parseFloat(slider.value) + delta));
      slider.value = nextVal;
      window.auraSetCropScale(nextVal);
    }
  };

  window.auraSaveCroppedAvatar = async function() {
    const canvas = document.getElementById('aura-crop-canvas');
    if (!canvas) return;

    // Export 300x300 high-res image matching exact 1:1 aspect ratio
    const outCanvas = document.createElement('canvas');
    outCanvas.width = 300;
    outCanvas.height = 300;
    const outCtx = outCanvas.getContext('2d');
    outCtx.drawImage(canvas, 0, 0, 300, 300);

    const base64Data = outCanvas.toDataURL('image/png', 0.95);
    const currentUserId = getUserId();

    toast('Uploading and saving photo...');
    try {
      const res = await fetch('/api/community/profile/upload-avatar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUserId,
          imageBase64: base64Data
        })
      });
      const data = await res.json();
      if (!data || !data.success || !data.avatarUrl) {
        toast(data.error || 'Failed to upload photo.', 'error');
        return;
      }

      // Update local storage user avatar
      const u = getUser();
      if (u) {
        u.avatar = data.avatarUrl;
        localStorage.setItem('auramusic_current_user', JSON.stringify(u));
      }

      // Update avatar preview in edit modal
      const preview = document.getElementById('aura-edit-avatar-preview');
      if (preview) preview.src = data.avatarUrl;

      // Update avatars across existing page
      document.querySelectorAll('img[src*="/avatars/"]').forEach(img => {
        if (!img.closest('.aura-community-card') && !img.closest('#aura-creator-profile-modal')) {
          img.src = data.avatarUrl;
        }
      });

      toast('Profile photo updated successfully ✓');
      const cropModal = document.getElementById('aura-crop-modal');
      if (cropModal) cropModal.style.display = 'none';
      loadCommunityFeed();
    } catch (e) {
      toast('Error saving photo: ' + e.message, 'error');
    }
  };

  window.auraResetProfilePhoto = async function() {
    const currentUserId = getUserId();
    if (!confirm('Are you sure you want to remove your profile photo and reset to default?')) return;

    try {
      const res = await fetch(`/api/community/profile/avatar?userId=${encodeURIComponent(currentUserId)}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data && data.success) {
        const u = getUser();
        if (u) {
          u.avatar = data.avatarUrl;
          localStorage.setItem('auramusic_current_user', JSON.stringify(u));
        }
        const preview = document.getElementById('aura-edit-avatar-preview');
        if (preview) preview.src = data.avatarUrl;
        toast('Profile photo removed ✓');
        loadCommunityFeed();
      }
    } catch (e) {
      toast('Failed to reset photo: ' + e.message, 'error');
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 13. FOLLOWERS / FOLLOWING LIST MODAL
  // ═══════════════════════════════════════════════════════════════════════════
  window.auraOpenFollowersList = async function(userId, type = 'followers') {
    let modal = document.getElementById('aura-followers-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'aura-followers-modal';
      modal.className = 'fixed inset-0 z-[12000] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 select-none font-sans animate-fadeIn';
      document.body.appendChild(modal);
    }
    modal.style.display = 'flex';
    modal.innerHTML = `
      <div class="w-full max-w-md bg-[#121624] border border-white/[0.08] rounded-3xl p-6 space-y-4 shadow-2xl">
        <div class="flex items-center justify-between border-b border-white/[0.06] pb-3">
          <h3 class="text-base font-bold text-white capitalize">${type}</h3>
          <button onclick="document.getElementById('aura-followers-modal').style.display='none'" class="text-slate-400 hover:text-white p-1">
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div id="aura-followers-content" class="max-h-80 overflow-y-auto space-y-2.5">
          <div class="text-center py-8 text-slate-500 text-xs">Loading ${type}...</div>
        </div>
      </div>
    `;

    try {
      const endpoint = type === 'followers' ? '/api/community/users/followers' : '/api/community/users/following';
      const res = await fetch(`${endpoint}?userId=${encodeURIComponent(userId)}`);
      const data = await res.json();
      const list = type === 'followers' ? data.followers : data.following;
      const box = document.getElementById('aura-followers-content');

      if (!list || list.length === 0) {
        box.innerHTML = `<div class="text-center py-8 text-slate-500 text-xs">No ${type} yet.</div>`;
        return;
      }

      box.innerHTML = list.map(u => `
        <div class="flex items-center justify-between p-2 rounded-xl hover:bg-white/[0.04]">
          <div onclick="window.auraOpenCreatorProfile('${u.userId}'); document.getElementById('aura-followers-modal').style.display='none';" class="flex items-center space-x-2.5 cursor-pointer">
            <img src="${u.avatar || '/avatars/p1.jpg'}" alt="${u.displayName}" class="w-9 h-9 rounded-xl object-cover ring-1 ring-emerald-500/30 bg-slate-900" />
            <div>
              <div class="font-bold text-white text-xs">${u.displayName}</div>
              <div class="text-[10px] text-slate-500">@${u.username}</div>
            </div>
          </div>
          <button onclick="window.auraOpenCreatorProfile('${u.userId}'); document.getElementById('aura-followers-modal').style.display='none';" class="py-1 px-3 rounded-lg bg-white/[0.05] hover:bg-white/10 text-slate-300 text-[11px] font-bold">View</button>
        </div>
      `).join('');
    } catch (e) {
      const box = document.getElementById('aura-followers-content');
      if (box) box.innerHTML = `<div class="text-center py-8 text-red-400 text-xs">Failed to load ${type}.</div>`;
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 13B. COMMUNITY PLAYLIST DETAIL MODAL (Tap Playlist -> Show Songs & Creator)
  // ═══════════════════════════════════════════════════════════════════════════
  window.auraOpenCommunityPlaylist = async function(playlistId) {
    if (!playlistId) return;
    const currentUserId = getUserId();

    let modal = document.getElementById('aura-pl-detail-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'aura-pl-detail-modal';
      modal.className = 'fixed inset-0 z-[10500] bg-[#07080c]/98 backdrop-blur-2xl text-slate-100 flex flex-col overflow-y-auto animate-fadeIn select-none font-sans p-4 sm:p-8';
      document.body.appendChild(modal);
    }
    modal.style.display = 'flex';
    modal.innerHTML = `<div class="max-w-3xl mx-auto w-full py-20 text-center text-slate-500 text-sm animate-pulse">Loading playlist tracks...</div>`;

    try {
      const res = await fetch(`/api/playlists/details?id=${encodeURIComponent(playlistId)}&userId=${encodeURIComponent(currentUserId)}`);
      const data = await res.json();
      if (!data || !data.success || !data.playlist) {
        modal.innerHTML = `
          <div class="max-w-md mx-auto text-center py-20 space-y-4">
            <h2 class="text-xl font-bold text-white">${data.error || 'Playlist not found'}</h2>
            <button onclick="document.getElementById('aura-pl-detail-modal').style.display='none'" class="px-5 py-2 rounded-xl bg-white/10 text-white text-xs font-bold cursor-pointer">Close</button>
          </div>
        `;
        return;
      }

      const pl = data.playlist;
      const songs = pl.songs || [];
      const creator = pl.creator || {};
      const coverUrl = pl.coverUrl || pl.cover || songs[0]?.image || '/logo.png';

      window.__auraTempPlSongs = songs;

      modal.innerHTML = `
        <div class="max-w-3xl mx-auto w-full py-2 space-y-6 pb-32">
          <div class="flex items-center justify-between">
            <button onclick="document.getElementById('aura-pl-detail-modal').style.display='none'" class="inline-flex items-center space-x-1.5 text-xs font-bold text-slate-400 hover:text-white cursor-pointer py-1">
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg>
              <span>Back</span>
            </button>
            <button onclick="document.getElementById('aura-pl-detail-modal').style.display='none'" class="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-white/[0.08] cursor-pointer">
              <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
          </div>

          <!-- Playlist Hero Header -->
          <div class="rounded-3xl bg-[#0e1320] border border-white/[0.08] p-5 sm:p-7 flex flex-col sm:flex-row items-center sm:items-end gap-5 shadow-2xl">
            <img src="${coverUrl}" alt="${pl.name}" class="w-32 h-32 sm:w-40 sm:h-40 rounded-2xl object-cover shadow-2xl ring-2 ring-emerald-500/30 bg-slate-900 shrink-0" />
            <div class="flex-1 text-center sm:text-left space-y-2.5">
              <span class="aura-community-badge ${pl.visibility === 'public' ? 'aura-badge-public' : 'aura-badge-private'}">${pl.visibility === 'public' ? '🌐 PUBLIC PLAYLIST' : '🔒 PRIVATE PLAYLIST'}</span>
              <h1 class="text-2xl sm:text-3xl font-black text-white leading-tight">${pl.name}</h1>
              ${pl.description ? `<p class="text-xs text-slate-400">${pl.description}</p>` : ''}
              <!-- Clickable Creator Profile -->
              <div onclick="document.getElementById('aura-pl-detail-modal').style.display='none'; window.auraOpenCreatorProfile('${creator.userId}')" class="inline-flex items-center space-x-2 py-1 px-2.5 rounded-full bg-white/[0.04] hover:bg-white/[0.08] cursor-pointer transition-colors">
                <img src="${creator.avatar || '/avatars/p1.jpg'}" alt="${creator.displayName}" class="w-5 h-5 rounded-full object-cover" />
                <span class="text-xs font-bold text-slate-200">${creator.displayName || 'Creator'}</span>
                <span class="text-[10px] text-slate-400">@${creator.username || 'user'}</span>
              </div>

              <div class="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-2">
                <button onclick="window.auraPlayCommunityPlaylist('${pl.id}'); document.getElementById('aura-pl-detail-modal').style.display='none';" class="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-xs flex items-center space-x-1.5 cursor-pointer shadow-lg shadow-emerald-500/20">
                  <svg class="w-4 h-4 fill-current" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                  <span>Play All (${songs.length})</span>
                </button>
                <button onclick="window.auraToggleLikePlaylist('${pl.id}')" class="px-3.5 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-xs font-bold text-white cursor-pointer">❤️ ${pl.likesCount || 0}</button>
                <button onclick="window.auraToggleSavePlaylist('${pl.id}')" class="px-3.5 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-xs font-bold text-white cursor-pointer">${pl.isSaved ? '✓ Saved' : '💾 Save'}</button>
                <button onclick="window.auraSharePlaylist('${pl.id}', '${encodeURIComponent(pl.name)}')" class="px-3.5 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-xs font-bold text-white cursor-pointer">🔗 Share</button>
              </div>
            </div>
          </div>

          <!-- Songs List -->
          <div class="space-y-2">
            <h3 class="text-sm font-extrabold text-slate-300 px-1">Tracks (${songs.length})</h3>
            ${songs.length === 0 ? `
              <div class="p-10 text-center text-slate-500 text-xs rounded-2xl bg-white/[0.02] border border-white/[0.05]">No songs in this playlist yet.</div>
            ` : songs.map((s, idx) => `
              <div onclick="window.auraPlayCommunityTrack(${idx})" class="flex items-center justify-between p-3 rounded-2xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.04] cursor-pointer transition-all group">
                <div class="flex items-center space-x-3 min-w-0">
                  <span class="text-xs font-mono text-slate-500 w-5 text-center">${idx + 1}</span>
                  <img src="${s.image || '/logo.png'}" alt="${s.name || s.title}" class="w-11 h-11 rounded-xl object-cover bg-slate-900 shrink-0" />
                  <div class="min-w-0">
                    <div class="text-sm font-bold text-white truncate group-hover:text-emerald-400 transition-colors">${s.name || s.title || 'Track'}</div>
                    <div class="text-xs text-slate-400 truncate">${s.artist || 'Artist'}</div>
                  </div>
                </div>
                <button class="w-9 h-9 rounded-full bg-emerald-500/15 group-hover:bg-emerald-500 text-emerald-400 group-hover:text-black flex items-center justify-center transition-colors shrink-0">
                  <svg class="w-4 h-4 fill-current ml-0.5" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                </button>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    } catch (e) {
      modal.innerHTML = `<div class="p-12 text-center text-red-400 text-sm">Failed to load playlist: ${e.message}</div>`;
    }
  };

  window.auraPlayCommunityTrack = function(index) {
    const songs = window.__auraTempPlSongs || [];
    if (!songs[index]) return;
    if (window.__auraPlaySong) {
      window.__auraPlaySong(songs[index], songs);
      toast(`▶ Playing "${songs[index].name || songs[index].title}"`);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 13C. PROFILE PAGE CORNER PENCIL ICON + GALLERY UPLOAD & PLAYLIST VISIBILITY
  // ═══════════════════════════════════════════════════════════════════════════
  function injectProfilePageEnhancements() {
    const u = getUser();
    if (!u) return;

    // Detect Profile hero card (has Logout button + w-28 h-28 avatar)
    const profileImgs = document.querySelectorAll('main img.w-28.h-28, main img[class*="md:w-32"]');
    profileImgs.forEach(img => {
      const heroCard = img.closest('.glass-panel, .rounded-3xl');
      if (!heroCard || heroCard.closest('#aura-creator-profile-modal')) return;

      // 1. Add top-right corner Pencil (✏️) button for Display Name, Bio & Profile Edit
      if (!heroCard.querySelector('#aura-profile-corner-pencil')) {
        heroCard.style.position = 'relative';
        const pencilBtn = document.createElement('button');
        pencilBtn.id = 'aura-profile-corner-pencil';
        pencilBtn.title = 'Edit Profile, Display Name, Bio & Photo';
        pencilBtn.className = 'absolute top-4 right-4 w-10 h-10 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-400 flex items-center justify-center shadow-lg transition-all cursor-pointer active:scale-95 z-20';
        pencilBtn.innerHTML = `
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>
          </svg>
        `;
        pencilBtn.onclick = (e) => {
          e.stopPropagation();
          window.auraOpenEditProfileModal();
        };
        heroCard.appendChild(pencilBtn);
      }

      // 2. Add Gallery / Camera badge on avatar container (NO zoom on avatar tap!)
      const avatarWrapper = img.parentElement;
      if (avatarWrapper && !avatarWrapper.querySelector('#aura-avatar-gallery-btn')) {
        avatarWrapper.style.position = 'relative';
        const camBtn = document.createElement('button');
        camBtn.id = 'aura-avatar-gallery-btn';
        camBtn.title = 'Upload Photo from Gallery';
        camBtn.className = 'absolute -bottom-1.5 -right-1.5 w-9 h-9 rounded-full bg-emerald-500 hover:bg-emerald-400 text-black flex items-center justify-center shadow-xl border-2 border-[#090a0f] cursor-pointer active:scale-95 z-20 transition-transform';
        camBtn.innerHTML = `
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>
          </svg>
        `;
        camBtn.onclick = (e) => {
          e.stopPropagation();
          let fileInp = document.getElementById('aura-direct-gallery-input');
          if (!fileInp) {
            fileInp = document.createElement('input');
            fileInp.type = 'file';
            fileInp.id = 'aura-direct-gallery-input';
            fileInp.accept = 'image/jpeg,image/png,image/webp';
            fileInp.style.display = 'none';
            fileInp.onchange = function() { window.auraHandleAvatarFileSelect(this); };
            document.body.appendChild(fileInp);
          }
          fileInp.click();
        };
        avatarWrapper.appendChild(camBtn);
      }

      // 3. Display saved Bio under Display Name if not already shown
      const nameHeading = heroCard.querySelector('h1');
      if (nameHeading && !heroCard.querySelector('#aura-profile-bio-text')) {
        const bioEl = document.createElement('p');
        bioEl.id = 'aura-profile-bio-text';
        bioEl.className = 'text-xs text-slate-300 max-w-md mx-auto sm:mx-0 hidden';
        nameHeading.insertAdjacentElement('afterend', bioEl);
        fetch(`/api/community/profile?userId=${encodeURIComponent(getUserId())}`)
          .then(r => r.json())
          .then(d => {
            if (d?.profile?.bio) {
              bioEl.textContent = d.profile.bio;
              bioEl.classList.remove('hidden');
            }
          }).catch(() => {});
      }
    });
  }

  // Inject Public/Private Toggle & Gallery Cover Upload inside Library & Playlist Detail View
  function injectPlaylistControlsEnhancements() {
    const uid = getUserId();
    if (!uid || uid === 'guest') return;

    const mainEl = document.querySelector('main');
    if (!mainEl) return;

    let cachedPls = [];
    try { cachedPls = JSON.parse(localStorage.getItem('auramusic_cached_playlists') || '[]'); } catch {}

    // 1. Immediately patch Library playlist card thumbnails if first song has an image
    if (cachedPls.length > 0) {
      mainEl.querySelectorAll('.glass-card').forEach(card => {
        const titleEl = card.querySelector('h3, h2, .font-bold');
        const titleText = (titleEl?.textContent || '').trim();
        if (!titleText) return;
        const pl = cachedPls.find(p => (p.name || '').trim().toLowerCase() === titleText.toLowerCase());
        if (!pl) return;
        const thumbUrl = pl.cover || pl.coverUrl || pl.songs?.[0]?.image;
        if (!thumbUrl) return;
        const mediaBox = card.querySelector('.aspect-video');
        if (mediaBox && !mediaBox.querySelector('img')) {
          const img = document.createElement('img');
          img.src = thumbUrl;
          img.alt = pl.name;
          img.className = 'w-full h-full object-cover group-hover:scale-105 transition-transform duration-300';
          const placeholder = mediaBox.querySelector('div.flex.items-center.justify-center');
          if (placeholder) placeholder.replaceWith(img);
        }
      });
    }

    // 2. Look for "Back" / "Play All" inside a user playlist view (exclude Liked & Recently Played)
    const headings = mainEl.querySelectorAll('h1');
    headings.forEach(h1 => {
      const titleText = (h1.textContent || '').trim();
      if (!titleText || titleText === 'Your Library' || titleText === 'Liked Songs' || titleText === 'Recently Played' || titleText === 'Home' || titleText === 'Search') return;

      const headerContainer = h1.closest('.flex, .space-y-4, .rounded-3xl, div');
      if (!headerContainer || headerContainer.querySelector('#aura-pl-visibility-bar')) return;

      // Match with cached playlists to confirm it's a user playlist
      const matchedPl = cachedPls.find(p => (p.name || '').trim().toLowerCase() === titleText.toLowerCase());
      if (!matchedPl) return;

      const plId = String(matchedPl.id || matchedPl._id);
      const isPublic = matchedPl.visibility === 'public';

      const bar = document.createElement('div');
      bar.id = 'aura-pl-visibility-bar';
      bar.className = 'flex flex-wrap items-center gap-2 pt-2';
      bar.innerHTML = `
        <button id="aura-pl-vis-toggle-btn" class="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer border ${isPublic ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40' : 'bg-white/[0.06] text-slate-300 border-white/15'}">
          <span>${isPublic ? '🌐 Public (In Community)' : '🔒 Private (Only You)'}</span>
        </button>
        <button id="aura-pl-cover-gallery-btn" class="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-xs font-bold text-slate-200 cursor-pointer">
          <span>🖼️ Change Cover</span>
        </button>
        <button id="aura-pl-share-btn" class="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-xs font-bold text-slate-200 cursor-pointer ${isPublic ? '' : 'hidden'}">
          <span>🔗 Share</span>
        </button>
        <input type="file" id="aura-pl-cover-input" accept="image/jpeg,image/png,image/webp" style="display:none;" />
      `;
      h1.insertAdjacentElement('afterend', bar);

      // Visibility toggle handler
      const visBtn = bar.querySelector('#aura-pl-vis-toggle-btn');
      const shareBtn = bar.querySelector('#aura-pl-share-btn');
      visBtn.onclick = async () => {
        const nextVis = matchedPl.visibility === 'public' ? 'private' : 'public';
        visBtn.disabled = true;
        try {
          const r = await fetch('/api/playlists', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: uid, playlistId: plId, action: 'update_visibility', visibility: nextVis })
          });
          const j = await r.json();
          if (j && j.success) {
            matchedPl.visibility = nextVis;
            localStorage.setItem('auramusic_cached_playlists', JSON.stringify(cachedPls));
            const pub = nextVis === 'public';
            visBtn.innerHTML = `<span>${pub ? '🌐 Public (In Community)' : '🔒 Private (Only You)'}</span>`;
            visBtn.className = `inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer border ${pub ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40' : 'bg-white/[0.06] text-slate-300 border-white/15'}`;
            if (pub) shareBtn.classList.remove('hidden'); else shareBtn.classList.add('hidden');
            toast(pub ? '🌐 Playlist is now PUBLIC in Community!' : '🔒 Playlist is now PRIVATE');
          } else {
            toast(j.error || 'Failed to update visibility', 'error');
          }
        } catch (err) {
          toast('Network error updating visibility', 'error');
        } finally {
          visBtn.disabled = false;
        }
      };

      // Share handler
      shareBtn.onclick = () => window.auraSharePlaylist(plId, encodeURIComponent(matchedPl.name));

      // Gallery cover upload handler
      const coverBtn = bar.querySelector('#aura-pl-cover-gallery-btn');
      const coverInput = bar.querySelector('#aura-pl-cover-input');
      coverBtn.onclick = () => coverInput.click();
      coverInput.onchange = function() {
        if (!this.files || !this.files[0]) return;
        const file = this.files[0];
        if (!['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(file.type.toLowerCase())) {
          toast('Supported formats: JPG, JPEG, PNG, WEBP.', 'error');
          return;
        }
        if (file.size > 5 * 1024 * 1024) {
          toast('Image exceeds 5MB limit.', 'error');
          return;
        }
        const reader = new FileReader();
        reader.onload = async (ev) => {
          toast('Uploading playlist cover...');
          try {
            const r = await fetch('/api/playlists/upload-cover', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId: uid, playlistId: plId, imageBase64: ev.target.result })
            });
            const j = await r.json();
            if (j && j.success && j.coverUrl) {
              matchedPl.cover = j.coverUrl;
              matchedPl.coverUrl = j.coverUrl;
              localStorage.setItem('auramusic_cached_playlists', JSON.stringify(cachedPls));
              toast('Playlist cover updated ✓');
              if (typeof window.__auraRefreshPlaylists === 'function') window.__auraRefreshPlaylists();
            } else {
              toast(j.error || 'Cover upload failed', 'error');
            }
          } catch {
            toast('Failed to upload cover', 'error');
          }
        };
        reader.readAsDataURL(file);
        this.value = '';
      };
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 14. DEEP-LINK HASH ROUTING (#community, #playlist=..., #creator=...)
  // ═══════════════════════════════════════════════════════════════════════════
  function checkHashRouting() {
    const hash = window.location.hash;
    if (!hash) return;

    if (hash === '#community') {
      window.auraOpenCommunity();
    } else if (hash.startsWith('#playlist=')) {
      const plId = hash.replace('#playlist=', '').trim();
      if (plId) {
        window.auraOpenCommunityPlaylist(plId);
      }
    } else if (hash.startsWith('#creator=')) {
      const creatorId = hash.replace('#creator=', '').trim();
      if (creatorId) {
        window.auraOpenCreatorProfile(creatorId);
      }
    }
  }

  // Auto-close Community / Creator Profile / Playlist Detail when user taps any bottom nav or header navigation item
  document.addEventListener('click', (e) => {
    const navTarget = e.target.closest('nav button, aside button:not(.aura-community-sidebar-btn), header button, header input, header a');
    if (!navTarget) return;
    if (navTarget.closest('#aura-community-modal, #aura-creator-profile-modal, #aura-pl-detail-modal')) return;
    ['aura-community-modal', 'aura-creator-profile-modal', 'aura-pl-detail-modal'].forEach(id => {
      const m = document.getElementById(id);
      if (m && m.style.display !== 'none') m.style.display = 'none';
    });
  }, true);

  // Periodic navigation & profile/playlist UI injector
  setInterval(() => {
    injectCommunityNavButtons();
    injectProfilePageEnhancements();
    injectPlaylistControlsEnhancements();
  }, 800);
  window.addEventListener('DOMContentLoaded', () => {
    injectCommunityNavButtons();
    injectProfilePageEnhancements();
    injectPlaylistControlsEnhancements();
    checkHashRouting();
  });
  window.addEventListener('hashchange', checkHashRouting);

  // Expose module APIs
  window.__auraCommunity = {
    open: window.auraOpenCommunity,
    close: window.auraCloseCommunity,
    openProfile: window.auraOpenCreatorProfile,
    createPlaylist: window.auraOpenCreatePlaylistModal
  };

  console.log('✅ AuraMusic Social Music Community Module Initialized.');
})();
