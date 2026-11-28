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

// ── Pure Mochy Radio Queue & Instant Skip System ──────────────────────────────
(function () {
  var isYt = function(s) { return !!s && (String(s.id || '').indexOf('yt_') === 0 || !!s.videoId); };
  var videoId = function(s) { return s.videoId || String(s.id || '').replace(/^yt_|^yt-/, ''); };

  var relatedCache = {};
  function fetchRelated(seed, done, fail) {
    if (!seed) { if (fail) fail(); return; }
    var vid = videoId(seed);
    if (vid && relatedCache[vid] && Date.now() - relatedCache[vid].t < 15 * 60 * 1000) {
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
        // Immediately store streamUrl for songs that have it
        list.forEach(function(s) {
          var sVid = videoId(s);
          if (sVid && s.streamUrl && window.__auraStreamCache) {
            window.__auraStreamCache.set(sVid, s.streamUrl);
            window.__auraStreamCache.set('yt_' + sVid, s.streamUrl);
            window.__auraStreamCache.set('/api/yt/stream?id=' + sVid, s.streamUrl);
          }
        });
        // Pre-warm top 5 upcoming Mochy songs immediately
        if (window.__pfWarm) {
          window.__pfWarm(list.slice(0, 5).map(videoId));
        }
        done(list);
      })
      .catch(function() { if (fail) fail(); });
  }

  function cleanTitle(str) {
    return String(str || '')
      .toLowerCase()
      .replace(/\(.*?\)|\[.*?\]/g, '')
      .replace(/[^a-z0-9]/g, '')
      .trim();
  }

  function merge(cur, queue, add) {
    var haveIds = {};
    var haveTitles = {};
    var curVid = videoId(cur);
    var curTitle = cur ? cleanTitle(cur.name || cur.title) : '';
    if (curTitle) haveTitles[curTitle] = true;
    if (curVid) haveIds[curVid] = true;

    (queue || []).forEach(function(s) {
      if (s) {
        var v = videoId(s);
        if (v) haveIds[v] = true;
        if (s.id) haveIds[s.id] = true;
        var t = cleanTitle(s.name || s.title);
        if (t) haveTitles[t] = true;
      }
    });

    var fresh = (add || []).filter(function(s) {
      if (!s) return false;
      var v = videoId(s);
      var t = cleanTitle(s.name || s.title);
      // Strictly prevent duplicate ID or duplicate song title!
      if (v && haveIds[v]) return false;
      if (s.id && haveIds[s.id]) return false;
      if (t && haveTitles[t]) return false;
      if (v) haveIds[v] = true;
      if (s.id) haveIds[s.id] = true;
      if (t) haveTitles[t] = true;
      return true;
    });

    var at = (queue || []).findIndex(function(s) {
      return (s && (s.id === cur.id || (curVid && videoId(s) === curVid)));
    });

    // Immediately warm next 5 upcoming songs
    if (window.__pfWarm && fresh.length) {
      window.__pfWarm(fresh.slice(0, 5).map(videoId));
    }
    if (at < 0) return (queue || []).concat(fresh);
    return queue.slice(0, at + 1).concat(fresh, queue.slice(at + 1));
  }

  var topping = {};

  window.__auraRelated = {
    // Determine if fresh Mochy radio tracks need to be loaded
    needs: function(cur, list) {
      if (!list || list.length <= 1) return true;
      var curVid = videoId(cur);
      var at = list.findIndex(function(s) {
        return s && (s.id === cur.id || (curVid && videoId(s) === curVid));
      });
      // If current song is missing or less than 5 upcoming songs, fetch more from Mochy Radio
      if (at < 0 || (list.length - 1 - at) < 5) {
        return true;
      }
      // Check if upcoming queue contains duplicate titles of the current song
      var curTitle = cleanTitle(cur.name || cur.title);
      var hasDup = list.slice(at + 1).some(function(s) {
        return s && cleanTitle(s.name || s.title) === curTitle;
      });
      if (hasDup) return true;
      return false;
    },

    // Preserve upcoming Mochy songs in queue and deduplicate repeat titles
    trim: function(cur, list) {
      if (!list || !list.length) return [cur];
      var curVid = videoId(cur);
      var at = list.findIndex(function(s) {
        return s && (s.id === cur.id || (curVid && videoId(s) === curVid));
      });
      if (at >= 0) {
        var seenTitles = {};
        var curTitle = cleanTitle(cur.name || cur.title);
        if (curTitle) seenTitles[curTitle] = true;
        var upcoming = list.slice(at + 1).filter(function(s) {
          if (!s) return false;
          var t = cleanTitle(s.name || s.title);
          if (t && seenTitles[t]) return false;
          if (t) seenTitles[t] = true;
          return true;
        });
        return [list[at]].concat(upcoming);
      }
      return [cur];
    },

    merge: merge,

    same: function(a, b) {
      if (!a || !b) return false;
      var c1 = cleanTitle(a);
      var c2 = cleanTitle(b);
      if (c1 && c2 && c1 === c2) return true;
      return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
    },

    played: function() {},
    wasPlayed: function() { return false; },
    tasteLang: function() { return ''; },
    songLang: function() { return ''; },

    // Instant Skip: Return cached Mochy related tracks synchronously whenever available!
    playRelated: function(cur, ok, fail) {
      var vid = videoId(cur);
      var curTitle = cur ? cleanTitle(cur.name || cur.title) : '';
      if (vid && relatedCache[vid] && Array.isArray(relatedCache[vid].list) && relatedCache[vid].list.length) {
        var cached = relatedCache[vid].list.filter(function(s) {
          if (!s || s.id === cur.id || videoId(s) === vid) return false;
          if (curTitle && cleanTitle(s.name || s.title) === curTitle) return false;
          return true;
        });
        if (cached.length) {
          if (window.__pfWarm) window.__pfWarm(cached.slice(0, 5).map(videoId));
          ok(cached);
          return;
        }
      }
      fetchRelated(cur, function(list) {
        if (list && list.length) {
          var nextList = list.filter(function(s) {
            if (!s || s.id === cur.id || videoId(s) === vid) return false;
            if (curTitle && cleanTitle(s.name || s.title) === curTitle) return false;
            return true;
          });
          if (nextList.length) {
            if (window.__pfWarm) window.__pfWarm(nextList.slice(0, 5).map(videoId));
            ok(nextList);
          } else if (fail) {
            fail();
          }
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
      var curVid = videoId(cur);
      var at = (queue || []).findIndex(function(s) {
        return s && (s.id === cur.id || (curVid && videoId(s) === curVid));
      });
      var ahead = at < 0 ? 0 : Math.max(0, queue.length - 1 - at);
      if (ahead >= 8) return;
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
