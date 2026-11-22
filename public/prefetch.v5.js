// Starts looking up stream URLs before the user taps a song, so playback starts in ~1s.
// Results are kept in memory; the player picks them up through window.__pfGet.
(function () {
  var store = {};
  var TTL = 20 * 60 * 1000;
  var clean = function (id) { return String(id || '').replace(/^yt_|^yt-/, '').trim(); };

  // Also pulls the first seconds of the next song into the browser, so skipping does not wait
  // for the audio to start downloading. Best effort: it only helps if the host allows caching.
  var preloaders = [];
  function preload(url) {
    try {
      var a = new Audio();
      a.preload = 'auto';
      a.muted = true;
      a.src = url;
      a.load();
      preloaders.push(a);
      if (preloaders.length > 2) {
        var old = preloaders.shift();
        old.removeAttribute('src');
        old.load();
      }
    } catch (e) {}
  }

  window.__pfWarm = function (ids, preloadFirst) {
    (ids || []).forEach(function (raw, index) {
      var id = clean(raw);
      if (!id) return;
      var hit = store[id];
      if (!hit || Date.now() - hit.t >= TTL) {
        hit = store[id] = {
          t: Date.now(),
          p: fetch('/api/yt/stream?id=' + encodeURIComponent(id) + '&json=1')
            .then(function (r) { return r.ok ? r : null; })
            .catch(function () { return null; })
        };
      }
      if (preloadFirst && index === 0 && !hit.preloaded) {
        hit.preloaded = true;
        hit.p.then(function (r) {
          if (!r) return;
          r.clone().json().then(function (j) { if (j && j.streamUrl) preload(j.streamUrl); }).catch(function () {});
        });
      }
    });
  };

  // Resolves to a Response for the stream lookup; uses the warmed one when there is one.
  window.__pfGet = function (raw, fallback) {
    var id = clean(raw);
    var hit = id && store[id];
    if (!hit || Date.now() - hit.t >= TTL) return fallback();
    return hit.p.then(function (r) { return r ? r.clone() : fallback(); });
  };
})();

// Endless "next": keeps a play history, skips anything played recently, other versions of the
// same song and covers / remixes, and keeps fetching songs that are related to what is playing
// and to what this user likes. Also reports plays / skips so the server learns the user's taste.
(function () {
  var NOISE = /\b(official|video|audio|lyrical|lyrics|lyric|full|song|songs|hd|4k|remix|slowed|reverb|lofi|cover|version|8d|bass|boosted|reprise|karaoke|instrumental|unplugged|live|male|female|feat|ft|music|visualizer|new)\b/g;
  var VARIANT = /\b(cover|covered|remake|reprise|slowed|reverb|lofi|lo-fi|remix|mashup|unplugged|acoustic|8d|nightcore|sped up|speed up|karaoke|instrumental|tribute|piano|guitar|live)\b/i;
  var HISTORY_KEY = 'aura_played_v1';
  var HISTORY_MAX = 60;                        // songs remembered
  var HISTORY_AGE = 6 * 60 * 60 * 1000;        // ...for six hours
  var SKIP_UNDER_MS = 25000;                   // moving on before this counts as a skip

  function key(t) {
    return String(t || '').toLowerCase()
      .replace(/\(.*?\)|\[.*?\]|\{.*?\}/g, ' ')
      .replace(NOISE, ' ')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
  }
  // Same song: the titles start with the same words, or the shorter title sits inside the longer
  // one ("Cover by X - Tum Hi Ho").
  function same(a, b) {
    var x = key(a).split(' ').filter(Boolean);
    var y = key(b).split(' ').filter(Boolean);
    if (!x.length || !y.length) return false;
    var n = Math.min(x.length, y.length, 3);
    var prefix = true;
    for (var i = 0; i < n; i++) if (x[i] !== y[i]) { prefix = false; break; }
    if (prefix && (n >= 2 || x[0].length >= 4)) return true;
    var s = x.length <= y.length ? x : y;
    var l = x.length <= y.length ? y : x;
    if (s.length < 2 && s[0].length < 6) return false;
    return (' ' + l.join(' ') + ' ').indexOf(' ' + s.slice(0, 3).join(' ') + ' ') > -1;
  }
  var variant = function (t) { return VARIANT.test(String(t || '')); };
  var isYt = function (s) { return !!s && String(s.id || '').indexOf('yt_') === 0; };
  var videoId = function (s) { return s.videoId || String(s.id || '').replace(/^yt_|^yt-/, ''); };

  // ---- who is signed in ----
  function userId() {
    try {
      var u = JSON.parse(localStorage.getItem('auramusic_current_user') || 'null');
      return u && u.id ? String(u.id) : '';
    } catch (e) { return ''; }
  }

  // ---- play history ----
  var history = (function () {
    try {
      var h = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
      return Array.isArray(h) ? h : [];
    } catch (e) { return []; }
  })();
  function recent() {
    var cutoff = Date.now() - HISTORY_AGE;
    return history.filter(function (h) { return h.t > cutoff; });
  }
  function wasPlayed(song) {
    if (!isYt(song)) return false;
    var list = recent();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === song.id || same(list[i].name, song.name)) return true;
    }
    return false;
  }
  // true when `cand` should not be offered as the next song after `cur`
  function skip(cand, cur) {
    if (!cand) return true;
    if (cur && same(cand.name, cur.name)) return true;
    if (wasPlayed(cand)) return true;
    return isYt(cand) && variant(cand.name) && !(cur && variant(cur.name));
  }

  // ---- 4D context ----
  function tasteContext() {
    var now = new Date();
    var h   = now.getHours();
    var dow = now.getDay();
    var isWE = (dow === 0 || dow === 6);
    var slot = h >= 5 && h < 12 ? 'morning'
             : h >= 12 && h < 17 ? 'afternoon'
             : h >= 17 && h < 21 ? 'evening'
             : h >= 21 ? 'night' : 'late_night';
    return { hour: h, dayOfWeek: dow, isWeekend: isWE, timeSlot: slot,
             contextKey: slot + '_' + (isWE ? 'weekend' : 'weekday') };
  }

  // ---- taste events (enriched with listen depth + 4D context) ----
  function sendTaste(type, song, extraMs) {
    var uid = userId();
    if (!uid || !isYt(song)) return;
    // listenedSec = how long the user actually listened
    var listenedSec = 0;
    if ((type === 'play' || type === 'skip' || type === 'replay') && startedAt > 0) {
      listenedSec = Math.round((Date.now() - startedAt) / 1000);
    }
    if (extraMs != null) listenedSec = Math.round(extraMs / 1000);
    try {
      fetch('/api/taste/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: uid, type: type, tsMs: Date.now(),
          song: {
            videoId  : videoId(song),
            name     : song.name   || '',
            artist   : song.artist || '',
            duration : song.duration ? Number(song.duration) : 0
          },
          listenedSec: listenedSec,
          context: tasteContext()
        }),
        keepalive: true
      }).catch(function () {});
    } catch (e) {}
  }

  var current = null;      // the song that is playing
  var startedAt = 0;
  function played(song) {
    if (!isYt(song)) { current = null; return; }
    current = song;
    startedAt = Date.now();
    history = history.filter(function (h) { return h.id !== song.id; });
    history.push({ id: song.id, videoId: videoId(song), name: song.name || '', artist: song.artist || '', t: Date.now() });
    if (history.length > HISTORY_MAX) history = history.slice(-HISTORY_MAX);
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); } catch (e) {}
    sendTaste('play', song);
  }
  // called when the user moves on from `song`
  function skipped(song) {
    if (current && song && current.id === song.id && Date.now() - startedAt < SKIP_UNDER_MS) {
      sendTaste('skip', song);
    }
  }

  // ---- related songs ----
  function fetchList(url) {
    return fetch(url)
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (l) { return Array.isArray(l) ? l : []; })
      .catch(function () { return []; });
  }
  function relatedOf(seed) {
    return fetchList('/api/yt/related?id=' + encodeURIComponent(videoId(seed)) +
      '&title=' + encodeURIComponent(seed.name || '') +
      '&artist=' + encodeURIComponent(seed.artist || ''));
  }
  var forYouCache = { t: 0, list: [] };
  function forYouList() {
    var uid = userId();
    if (!uid) return Promise.resolve([]);
    if (Date.now() - forYouCache.t < 3 * 60 * 1000) return Promise.resolve(forYouCache.list);
    return fetchList('/api/taste/foryou?userId=' + encodeURIComponent(uid)).then(function (list) {
      forYouCache = { t: Date.now(), list: list };
      return list;
    });
  }
  // songs related to `seed`, mixed one-for-one with songs picked for this user's taste
  function fetchMixed(seed, done, fail) {
    Promise.all([relatedOf(seed), forYouList()]).then(function (res) {
      var related = res[0], mine = res[1], out = [], seen = {};
      for (var i = 0; i < Math.max(related.length, mine.length); i++) {
        [related[i], mine[i]].forEach(function (s) {
          if (s && !seen[s.id]) { seen[s.id] = true; out.push(s); }
        });
      }
      if (out.length) done(out); else fail();
    });
  }

  // put fresh songs right after the current one
  function merge(cur, queue, add) {
    var have = {};
    queue.forEach(function (s) { have[s.id] = true; });
    var fresh = add.filter(function (s) { return !have[s.id] && !skip(s, cur); });
    var at = queue.findIndex(function (s) { return s.id === cur.id; });
    if (window.__pfWarm) window.__pfWarm(fresh.slice(0, 3).map(videoId), true);
    if (at < 0) return queue.concat(fresh);
    return queue.slice(0, at + 1).concat(fresh, queue.slice(at + 1));
  }

  var topping = {};

  window.__auraRelated = {
    same: same,
    skip: skip,
    wasPlayed: wasPlayed,
    played: played,
    skipped: skipped,
    merge: merge,

    // ── Explicit feedback hooks ───────────────────────────────────
    liked: function (song) { sendTaste('like', song); },
    disliked: function (song) { sendTaste('dislike', song); },
    replayed: function (song) { sendTaste('replay', song); },
    // Call with the query string when user searches
    searched: function (query) {
      var uid = userId();
      if (!uid || !query) return;
      try {
        fetch('/api/taste/event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: uid, type: 'search', query: String(query).slice(0,100), tsMs: Date.now(), context: tasteContext() }),
          keepalive: true
        }).catch(function(){});
      } catch(e) {}
    },

    // Fresh songs for `cur`. If everything was already played, try what was related to the last
    // couple of songs. ok(list) with new songs, fail() when none are found.
    playRelated: function (cur, ok, fail) {
      var seeds = [cur];
      recent().filter(function (h) { return h.id !== cur.id; }).slice(-2).reverse().forEach(function (h) {
        seeds.push({ id: h.id, videoId: h.videoId, name: h.name, artist: h.artist });
      });
      var i = 0;
      (function tryNext() {
        if (i >= seeds.length) { fail(); return; }
        fetchMixed(seeds[i++], function (list) {
          var fresh = list.filter(function (s) { return !skip(s, cur); });
          if (fresh.length) ok(fresh); else tryNext();
        }, tryNext);
      })();
    },

    // true when the queue holds two or more other versions of the song that was tapped
    needs: function (cur, list) {
      var n = 0;
      for (var i = 0; i < list.length; i++) {
        if (list[i].id !== cur.id && same(list[i].name, cur.name)) n++;
      }
      return n >= 2;
    },
    // drop other versions and covers of the tapped song from the queue
    trim: function (cur, list) {
      return list.filter(function (s) { return s.id === cur.id || !skip(s, cur); });
    },
    load: function (cur, done) {
      fetchMixed(cur, done, function () {});
    },

    // Keep at least three new songs queued after the current one, so "next" is instant.
    topUp: function (cur, queue, setQueue, toSong) {
      if (!isYt(cur) || topping[cur.id]) return;
      var at = queue.findIndex(function (s) { return s.id === cur.id; });
      if (at < 0) return;
      var ahead = 0;
      for (var i = at + 1; i < queue.length; i++) {
        if (!skip(queue[i], cur)) ahead++;
      }
      if (ahead >= 3) return;
      topping[cur.id] = true;
      fetchMixed(cur, function (list) {
        setQueue(function (q) { return merge(cur, q, list.map(toSong)); });
      }, function () {});
    }
  };
})();


// ---- Update notification banner ----
// Checks /api/update/latest on load and when tab becomes visible.
// Shows a dismissible bottom banner. Hides in APK (window.AuraNative).
(function () {
  if (window.AuraNative) return; // APK doesn't need web update banners

  var SEEN_KEY = 'aura_update_seen_v1';
  var banner = null;

  function seenId() {
    try { return localStorage.getItem(SEEN_KEY) || ''; } catch(e) { return ''; }
  }
  function markSeen(id) {
    try { localStorage.setItem(SEEN_KEY, id); } catch(e) {}
  }

  function showBanner(update) {
    if (!update || !update.id || seenId() === update.id) return;
    if (banner) banner.remove();

    var b = document.createElement('div');
    b.style.cssText = [
      'position:fixed','bottom:70px','left:50%','transform:translateX(-50%)',
      'z-index:99999','max-width:92vw','width:380px',
      'background:linear-gradient(135deg,#0d2318,#0a1f17)',
      'border:1px solid #34d399','border-radius:14px',
      'padding:14px 16px','box-shadow:0 8px 32px rgba(0,0,0,.7)',
      'display:flex','flex-direction:column','gap:8px',
      'font-family:system-ui,-apple-system,sans-serif'
    ].join(';');

    var top = document.createElement('div');
    top.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px';

    var titleEl = document.createElement('span');
    titleEl.style.cssText = 'color:#34d399;font-weight:800;font-size:.88rem';
    titleEl.textContent = '🎵 ' + (update.title || 'Update available');
    top.appendChild(titleEl);

    var close = document.createElement('button');
    close.style.cssText = 'background:none;border:none;color:#6b7280;cursor:pointer;font-size:1.1rem;line-height:1;padding:0 2px';
    close.textContent = '×';
    close.onclick = function() { markSeen(update.id); b.remove(); banner = null; };
    top.appendChild(close);
    b.appendChild(top);

    if (update.message) {
      var msg = document.createElement('div');
      msg.style.cssText = 'color:#cbd5e1;font-size:.8rem;line-height:1.45';
      msg.textContent = update.message;
      b.appendChild(msg);
    }

    if (update.url && /^https:\/\//i.test(update.url)) {
      var row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:8px';
      var dl = document.createElement('button');
      dl.style.cssText = 'flex:1;background:#34d399;color:#000;border:none;border-radius:8px;padding:8px;font-weight:800;font-size:.8rem;cursor:pointer';
      dl.textContent = '⬇ Download Update';
      dl.onclick = function() { window.open(update.url, '_blank'); markSeen(update.id); b.remove(); banner = null; };
      row.appendChild(dl);
      var skip = document.createElement('button');
      skip.style.cssText = 'background:#1f2937;color:#9ca3af;border:none;border-radius:8px;padding:8px 12px;font-size:.78rem;cursor:pointer';
      skip.textContent = 'Later';
      skip.onclick = function() { markSeen(update.id); b.remove(); banner = null; };
      row.appendChild(skip);
      b.appendChild(row);
    }

    document.body.appendChild(b);
    banner = b;
  }

  function checkUpdate() {
    fetch('/api/update/latest')
      .then(function(r) { return r.ok ? r.json() : null; })
      .then(function(u) { if (u && u.id) showBanner(u); })
      .catch(function() {});
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkUpdate);
  } else {
    setTimeout(checkUpdate, 1500);
  }
  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'visible') checkUpdate();
  });
})();
