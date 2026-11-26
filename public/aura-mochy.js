// ═══════════════════════════════════════════════════════════════════════════
// AuraMusic — Live Listen Together
// Share a room code so friends join and listen in real-time sync.
// ═══════════════════════════════════════════════════════════════════════════
(function AuraLiveListenTogether() {
  'use strict';

  let _liveRoomId = null;
  let _liveHostInterval = null;
  let _liveListenInterval = null;
  let _liveIsHost = false;

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

  function showLiveBadge(isHost) {
    removeLiveBadge();
    const badge = document.createElement('div');
    badge.id = 'aura-live-badge';
    badge.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:50;background:rgba(239,68,68,0.9);color:#fff;font-size:11px;font-weight:900;letter-spacing:0.08em;padding:4px 12px;border-radius:999px;pointer-events:none;';
    badge.textContent = isHost ? '🔴 LIVE HOST' : '🔴 LIVE';
    document.body.appendChild(badge);
  }

  function removeLiveBadge() {
    const b = document.getElementById('aura-live-badge');
    if (b) b.remove();
  }

  function renderLiveModal() {
    const modal = document.getElementById('aura-mochy-modal');
    if (!modal || modal.style.display === 'none') return;
    const inRoom = !!_liveRoomId;
    const roomBadge = inRoom
      ? `<span class="px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30 text-[10px] font-black">🔴 ${_liveIsHost ? 'HOSTING' : 'LISTENING'}</span>`
      : '';

    modal.innerHTML = `
      <div class="p-4 sm:p-6 border-b border-white/[0.08] flex items-center justify-between bg-[#0B0E17] shrink-0">
        <div class="flex items-center space-x-3">
          <img src="/logo.png" alt="AuraMusic" class="w-9 h-9 rounded-xl object-cover ring-2 ring-emerald-500/30" />
          <div>
            <h1 class="text-lg sm:text-xl font-black text-white">Live Listen Together ${roomBadge}</h1>
            <p class="text-[11px] text-slate-400">Share a room code — friends join and hear in sync</p>
          </div>
        </div>
        <button onclick="window.auraCloseMochyStudio()" class="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/[0.08] cursor-pointer">
          <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      </div>

      <div class="flex-1 overflow-y-auto p-4 sm:p-6 pb-32 max-w-2xl mx-auto w-full space-y-5">
        <div class="rounded-3xl bg-[#0e1320] border border-white/[0.08] p-5 space-y-4">
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

        <div class="rounded-3xl bg-[#0e1320] border border-white/[0.08] p-5 space-y-2">
          <h3 class="text-sm font-black text-white">ℹ️ How it works</h3>
          <ul class="text-xs text-slate-400 space-y-1.5 list-disc list-inside">
            <li><span class="text-emerald-400">Create Room</span> → share code → friends join → everyone hears the same song at the same position</li>
            <li>Host controls playback; listeners auto-sync every 3 seconds</li>
          </ul>
        </div>
      </div>
    `;
  }

  window.auraOpenMochyStudio = function() {
    let modal = document.getElementById('aura-mochy-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'aura-mochy-modal';
      modal.style.background = '#07080c';
      modal.className = 'fixed inset-x-0 top-0 bottom-16 md:bottom-0 z-[26] md:z-[46] text-slate-100 flex flex-col overflow-hidden select-none font-sans';
      document.body.appendChild(modal);
    }
    modal.style.display = 'flex';
    renderLiveModal();
  };

  window.auraCloseMochyStudio = function() {
    const modal = document.getElementById('aura-mochy-modal');
    if (modal) modal.style.display = 'none';
  };

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
      renderLiveModal();
    } catch {
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
      renderLiveModal();
    } catch {
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
    renderLiveModal();
  };

  function injectLiveNav() {
    const sidebarNavs = document.querySelectorAll('aside [class*="space-y-1.5"], aside nav');
    sidebarNavs.forEach(sidebarNav => {
      if (sidebarNav.querySelector('.aura-mochy-live-btn')) return;
      const liveBtn = document.createElement('button');
      liveBtn.className = 'aura-mochy-live-btn w-full flex items-center justify-between px-3.5 py-3 rounded-2xl font-bold text-sm transition-all duration-200 text-slate-400 hover:text-white hover:bg-white/[0.05] cursor-pointer';
      liveBtn.innerHTML = `
        <div class="flex items-center space-x-3.5">
          <span class="text-base">📡</span>
          <span>Live Listen Together</span>
        </div>
        <span class="text-[10px] uppercase font-black px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/30">LIVE</span>
      `;
      liveBtn.onclick = () => {
        const mobileOverlay = liveBtn.closest('.fixed.inset-0');
        if (mobileOverlay) mobileOverlay.click();
        window.auraOpenMochyStudio();
      };
      sidebarNav.appendChild(liveBtn);
    });
  }

  document.addEventListener('click', (e) => {
    const navTarget = e.target.closest('nav button, aside button:not(.aura-mochy-live-btn), header button, header input, header a');
    if (!navTarget) return;
    if (navTarget.closest('#aura-mochy-modal')) return;
    window.auraCloseMochyStudio();
  }, true);

  setInterval(injectLiveNav, 1200);
  window.addEventListener('DOMContentLoaded', injectLiveNav);
})();
