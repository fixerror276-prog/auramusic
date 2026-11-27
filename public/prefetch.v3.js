// AuraMusic Prefetch Engine v6 — Pure Mochy YT Music Flow
// - Removes buggy shadow audio preloader & Range prefetch that was freezing playback
// - Fast direct stream caching & warm up
// - Clean Mochy Radio queue without duplication or lockups
(function () {
  window.__auraStreamCache = window.__auraStreamCache || new Map();

  var store = {};           // id -> { t, p, url }
  var TTL = 20 * 60 * 1000;
  var clean = function (id) { return String(id || '').replace(/^yt_|^yt-/, '').trim(); };

  // Resolve the JSON stream URL in background
  function resolveStreamUrl(id) {
    return fetch('/api/yt/stream?id=' + encodeURIComponent(id) + '&json=1', {
      signal: AbortSignal.timeout(4000)
    })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }

  // Warm stream URLs
  window.__pfWarm = function (ids) {
    (ids || []).forEach(function (raw) {
      var id = clean(raw);
      if (!id) return;
      var hit = store[id];
      if (hit && Date.now() - hit.t < TTL) return;

      var urlPromise = resolveStreamUrl(id);
      store[id] = {
        t: Date.now(),
        url: null,
        p: urlPromise.then(function (data) {
          if (data && data.streamUrl) {
            store[id].url = data.streamUrl;
            if (window.__auraStreamCache) window.__auraStreamCache.set(id, data.streamUrl);
            return new Response(JSON.stringify(data), { status: 200 });
          }
          return null;
        })
      };
    });
  };

  window.__pfGetUrl = function (raw) {
    var id = clean(raw);
    var hit = id && store[id];
    if (!hit || Date.now() - hit.t >= TTL) return Promise.resolve(null);
    if (hit.url) return Promise.resolve(hit.url);
    return hit.p.then(function () { return hit.url || null; });
  };

  // Checks __auraStreamCache first for instant hit, otherwise falls back to normal fetch
  window.__pfGet = function (raw, fallback) {
    var id = clean(raw);
    if (id && window.__auraStreamCache && window.__auraStreamCache.has(id)) {
      var url = window.__auraStreamCache.get(id);
      return Promise.resolve(new Response(JSON.stringify({ streamUrl: url }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }));
    }
    var hit = id && store[id];
    if (!hit || Date.now() - hit.t >= TTL) return fallback();
    return hit.p.then(function (r) { return r ? r.clone() : fallback(); });
  };

  // Warm next 10 songs on playback start
  document.addEventListener('play', function (e) {
    if (!e.target || e.target.tagName !== 'AUDIO') return;
    try {
      var queue = JSON.parse(localStorage.getItem('auramusic_queue') || '[]');
      var idx = parseInt(localStorage.getItem('auramusic_queue_index') || '0', 10);
      var nextIds = [];
      for (var i = idx + 1; i <= idx + 10 && i < queue.length; i++) {
        var s = queue[i];
        var v = s && (s.videoId || (s.id && s.id.replace(/^yt[-_]/, '')));
        if (v) nextIds.push(v);
      }
      if (nextIds.length) window.__pfWarm(nextIds);
    } catch (_) {}
  }, true);

  // ── COMPLETELY HIDE PLAY QUEUE UI (AS REQUESTED) ───────────────────────────
  try {
    var style = document.createElement('style');
    style.id = 'aura-hide-queue-ui';
    style.textContent = `
      button[title="Play Queue"],
      button[aria-label="Play Queue"],
      button[title*="Queue" i],
      button:has(svg.lucide-list-music),
      .play-queue-panel,
      [data-panel="queue"] {
        display: none !important;
        pointer-events: none !important;
        visibility: hidden !important;
      }
    `;
    if (document.head) document.head.appendChild(style);
    else document.addEventListener('DOMContentLoaded', function() { document.head.appendChild(style); });

    var hideQueueObserver = new MutationObserver(function() {
      var queueBtns = document.querySelectorAll('button[title="Play Queue"], button[title*="Queue" i]');
      queueBtns.forEach(function(b) { b.style.display = 'none'; });
      var h2s = document.querySelectorAll('h2');
      h2s.forEach(function(h) {
        if (h.textContent && h.textContent.trim() === 'Play Queue') {
          var panel = h.closest('div.fixed') || h.closest('aside') || h.closest('div[class*="z-"]');
          if (panel) panel.style.display = 'none';
        }
      });
    });
    hideQueueObserver.observe(document.documentElement, { childList: true, subtree: true });
  } catch (_) {}
})();

// ── Pure Mochy Radio Queue & Skip System ─────────────────────────────────────
(function () {
  var isYt = function(s) { return !!s && (String(s.id || '').indexOf('yt_') === 0 || !!s.videoId); };
  var videoId = function(s) { return s.videoId || String(s.id || '').replace(/^yt_|^yt-/, ''); };

  var relatedCache = {};
  function fetchRelated(seed, done, fail) {
    var vid = videoId(seed);
    if (vid && relatedCache[vid] && Date.now() - relatedCache[vid].t < 10 * 60 * 1000) {
      done(relatedCache[vid].list);
      return;
    }
    var url = '/api/yt/related'
      + '?id=' + encodeURIComponent(vid)
      + '&title=' + encodeURIComponent(seed.name || '')
      + '&artist=' + encodeURIComponent(seed.artist || '');

    fetch(url)
      .then(function(r) { return r.ok ? r.json() : []; })
      .then(function(list) {
        if (!Array.isArray(list) || !list.length) { if (fail) fail(); return; }
        if (vid) relatedCache[vid] = { t: Date.now(), list: list };
        if (window.__pfWarm) window.__pfWarm(list.slice(0, 10).map(videoId));
        done(list);
      })
      .catch(function() { if (fail) fail(); });
  }

  function merge(cur, queue, add) {
    var have = {};
    (queue || []).forEach(function(s) { if (s && s.id) have[s.id] = true; });
    var fresh = (add || []).filter(function(s) {
      return s && s.id && !have[s.id];
    });
    var at = (queue || []).findIndex(function(s) { return s.id === cur.id; });
    if (window.__pfWarm) window.__pfWarm(fresh.slice(0, 10).map(videoId));
    if (at < 0) return (queue || []).concat(fresh);
    return queue.slice(0, at + 1).concat(fresh, queue.slice(at + 1));
  }

  var topping = {};

  window.__auraRelated = {
    needs: function(cur, list) {
      return true;
    },

    trim: function(cur, list) {
      var at = (list || []).findIndex(function(s) { return s.id === cur.id; });
      return at < 0 ? [cur] : list.slice(0, at + 1);
    },

    merge: merge,

    same: function(a, b) {
      if (!a || !b) return false;
      return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
    },

    played: function() {},
    wasPlayed: function() { return false; },
    tasteLang: function() { return ''; },
    songLang: function() { return ''; },

    playRelated: function(cur, ok, fail) {
      fetchRelated(cur, function(list) {
        if (list && list.length) {
          var nextList = list.filter(function(s) { return s.id !== cur.id && s.videoId !== cur.videoId; });
          if (nextList.length) ok(nextList);
          else if (fail) fail();
        } else if (fail) {
          fail();
        }
      }, fail);
    },

    load: function(cur, done) {
      fetchRelated(cur, done, function() {});
    },

    topUp: function(cur, queue, setQueue, toSong) {
      if (!isYt(cur)) return;
      var curId = cur.id || cur.videoId;
      if (topping[curId]) return;
      var at = (queue || []).findIndex(function(s) { return s.id === cur.id; });
      var ahead = at < 0 ? 0 : Math.max(0, queue.length - 1 - at);
      if (ahead >= 10) return;
      topping[curId] = true;
      fetchRelated(cur, function(list) {
        delete topping[curId];
        var mapped = (list || []).map(toSong || function(x) { return x; });
        if (typeof setQueue === 'function') {
          setQueue(function(q) { return merge(cur, q, mapped); });
        }
      }, function() {
        delete topping[curId];
      });
    }
  };
})();
