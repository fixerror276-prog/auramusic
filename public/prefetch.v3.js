// AuraMusic Prefetch Engine v5 — Pure Mochy API, Instant playback (<0.5s target)
// - Warms stream URLs before tap via /api/yt/stream?json=1
// - Intercepts HTMLMediaElement.prototype.src synchronously before React mounts
// - Pre-fetches first 1MB chunk of audio for instant buffer start
// - NO taste/mood/history tracking — pure Mochy YT Music Radio
(function () {
  window.__auraStreamCache = window.__auraStreamCache || new Map();

  // Instant zero-delay interception of audio.src before anything else runs
  try {
    var _mediaSrcDesc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src');
    if (_mediaSrcDesc && _mediaSrcDesc.set) {
      Object.defineProperty(HTMLMediaElement.prototype, 'src', {
        get: function() {
          return _mediaSrcDesc.get.call(this);
        },
        set: function(val) {
          var targetUrl = val;
          if (this.id !== 'aura-shadow-preloader' && typeof val === 'string' && val.includes('/api/yt/stream')) {
            var match = val.match(/[?&]id=([a-zA-Z0-9_-]+)/);
            var vid = match ? match[1].replace(/^yt[-_]/, '') : '';
            var cached = (vid && window.__auraStreamCache.get(vid)) || window.__auraStreamCache.get(val);
            if (cached) {
              targetUrl = cached;
            }
          }
          return _mediaSrcDesc.set.call(this, targetUrl);
        },
        configurable: true,
        enumerable: true
      });
    }
  } catch (_) {}

  var store = {};           // id -> { t, p, url }
  var TTL = 20 * 60 * 1000;
  var CHUNK_BYTES = 1048576; // 1MB first-chunk preload
  var clean = function (id) { return String(id || '').replace(/^yt_|^yt-/, '').trim(); };

  // Resolve the JSON stream URL — always fire first, fastest path
  function resolveStreamUrl(id) {
    return fetch('/api/yt/stream?id=' + encodeURIComponent(id) + '&json=1', {
      signal: AbortSignal.timeout(4000)
    })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }

  // Pre-fetch first 1MB audio bytes into browser cache using Range header
  function prefetchFirstChunk(url) {
    if (!url || url.startsWith('/api/')) return Promise.resolve(null);
    try {
      return fetch(url, {
        headers: { 'Range': 'bytes=0-' + (CHUNK_BYTES - 1) },
        signal: AbortSignal.timeout(5000),
        priority: 'high'
      }).then(function (r) {
        return r.ok ? r.arrayBuffer().catch(function () { return null; }) : null;
      }).catch(function () { return null; });
    } catch (e) { return Promise.resolve(null); }
  }

  // Hidden <audio> pre-buffer pool so top results & next songs start in ~0.1s
  var _audioPool = [];
  function prebufferAudioElement(url) {
    if (!url || typeof document === 'undefined' || !document.body) return;
    try {
      var el = _audioPool.shift();
      if (!el) {
        el = document.createElement('audio');
        el.preload = 'auto';
        el.muted = true;
        el.volume = 0;
        el.id = 'aura-shadow-preloader';
        el.style.display = 'none';
        document.body.appendChild(el);
      }
      _audioPool.push(el);
      if (el.src !== url) {
        el.src = url;
        el.load();
      }
    } catch (_) {}
  }

  // Warm: resolve URL + pre-fetch first chunk + prebuffer <audio> in parallel
  window.__pfWarm = function (ids) {
    (ids || []).forEach(function (raw, idx) {
      var id = clean(raw);
      if (!id) return;
      var hit = store[id];
      if (hit && Date.now() - hit.t < TTL) {
        if (hit.url && idx < 2) prebufferAudioElement(hit.url);
        return;
      }

      var urlPromise = resolveStreamUrl(id);
      store[id] = {
        t: Date.now(),
        url: null,
        p: urlPromise.then(function (data) {
          if (data && data.streamUrl) {
            store[id].url = data.streamUrl;
            if (window.__auraStreamCache) window.__auraStreamCache.set(id, data.streamUrl);
            prefetchFirstChunk(data.streamUrl);
            if (idx < 2) prebufferAudioElement(data.streamUrl);
            return new Response(JSON.stringify(data), { status: 200 });
          }
          return null;
        })
      };
    });
  };

  // Get warmed stream URL directly (no clone needed, returns JSON data)
  window.__pfGetUrl = function (raw) {
    var id = clean(raw);
    var hit = id && store[id];
    if (!hit || Date.now() - hit.t >= TTL) return Promise.resolve(null);
    if (hit.url) return Promise.resolve(hit.url);
    return hit.p.then(function () { return hit.url || null; });
  };

  // Legacy compat: Resolves to a Response for the stream lookup
  // Also checks __auraStreamCache for instant synchronous hit
  window.__pfGet = function (raw, fallback) {
    var id = clean(raw);
    // Check auraStreamCache first for instant sync hit
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

  // Warm next 10 songs immediately when current song starts (instant skip-skip-skip)
  document.addEventListener('play', function (e) {
    if (!e.target || e.target.tagName !== 'AUDIO' || e.target.id === 'aura-shadow-preloader') return;
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
})();

// ── Pure Mochy Radio Queue — no taste/mood/history tracking ─────────────────
(function () {
  var isYt = function(s) { return !!s && String(s.id || '').indexOf('yt_') === 0; };
  var videoId = function(s) { return s.videoId || String(s.id || '').replace(/^yt_|^yt-/, ''); };

  // Fetch related songs from Mochy YT Music Radio (pure, no filtering)
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
        if (!Array.isArray(list) || !list.length) { fail(); return; }
        if (vid) relatedCache[vid] = { t: Date.now(), list: list };
        if (window.__pfWarm) window.__pfWarm(list.slice(0, 10).map(videoId));
        done(list);
      })
      .catch(function() { fail(); });
  }

  // Merge: keep exact Mochy playtrack order, append only new songs by id
  function merge(cur, queue, add) {
    var have = {};
    queue.forEach(function(s) { have[s.id] = true; });
    var fresh = (add || []).filter(function(s) {
      return s && s.id && !have[s.id];
    });
    var at = queue.findIndex(function(s) { return s.id === cur.id; });
    if (window.__pfWarm) window.__pfWarm(fresh.slice(0, 10).map(videoId));
    if (at < 0) return queue.concat(fresh);
    return queue.slice(0, at + 1).concat(fresh, queue.slice(at + 1));
  }

  var topping = {};

  window.__auraRelated = {
    // Always trim to current song so search results are replaced by Mochy Radio songs
    needs: function() { return true; },

    // Trim queue to current song position (clears search result duplicates)
    trim: function(cur, list) {
      var at = (list || []).findIndex(function(s) { return s.id === cur.id; });
      return at < 0 ? [] : list.slice(0, at + 1);
    },

    merge: merge,

    // No-ops kept for API compatibility
    played: function() {},
    wasPlayed: function() { return false; },
    tasteLang: function() { return ''; },
    songLang: function() { return ''; },
    same: function() { return false; },

    playRelated: function(cur, ok, fail) {
      fetchRelated(cur, function(list) {
        if (list.length) ok(list); else fail();
      }, fail);
    },

    load: function(cur, done) {
      fetchRelated(cur, done, function() {});
    },

    // Keep 10+ songs ahead in queue so skipping is always instant
    topUp: function(cur, queue, setQueue, toSong) {
      if (!isYt(cur)) return;
      if (topping[cur.id]) return;
      var at = queue.findIndex(function(s) { return s.id === cur.id; });
      if (at < 0) return;
      var ahead = Math.max(0, queue.length - 1 - at);
      if (ahead >= 10) return;
      topping[cur.id] = true;
      fetchRelated(cur, function(list) {
        delete topping[cur.id];
        setQueue(function(q) { return merge(cur, q, list.map(toSong)); });
      }, function() {
        delete topping[cur.id];
      });
    }
  };
})();
