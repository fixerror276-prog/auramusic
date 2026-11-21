// AuraMusic Prefetch Engine v4 — Instant playback (<1.5s target)
// - Warms stream URLs before tap via /api/yt/stream?json=1
// - Pre-fetches first 1MB chunk of audio for instant buffer start
// - 2-connection parallel fetch: stream URL + first audio chunk simultaneously
// - Fallback: if warm fetch >2s, switch to backup JioSaavn CDN URL
(function () {
  var store = {};           // id -> { t, p, chunkP, url }
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
  // This fills the network buffer so the <audio> element starts in <1s
  function prefetchFirstChunk(url) {
    if (!url || url.startsWith('/api/')) return Promise.resolve(null);
    try {
      return fetch(url, {
        headers: { 'Range': 'bytes=0-' + (CHUNK_BYTES - 1) },
        signal: AbortSignal.timeout(5000),
        priority: 'high'
      }).then(function (r) {
        // consume the body so the browser caches it
        return r.ok ? r.arrayBuffer().catch(function () { return null; }) : null;
      }).catch(function () { return null; });
    } catch (e) { return Promise.resolve(null); }
  }

  // Warm: resolve URL + pre-fetch first chunk in parallel
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
            // Fire first-chunk prefetch immediately after URL resolved (parallel)
            store[id].chunkP = prefetchFirstChunk(data.streamUrl);
            // Return a fake Response so __pfGet is happy
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
  window.__pfGet = function (raw, fallback) {
    var id = clean(raw);
    var hit = id && store[id];
    if (!hit || Date.now() - hit.t >= TTL) return fallback();
    return hit.p.then(function (r) { return r ? r.clone() : fallback(); });
  };

  // Warm next 2 songs immediately when current song starts
  document.addEventListener('play', function (e) {
    if (!e.target || e.target.tagName !== 'AUDIO') return;
    try {
      var queue = JSON.parse(localStorage.getItem('auramusic_queue') || '[]');
      var idx = parseInt(localStorage.getItem('auramusic_queue_index') || '0', 10);
      var nextIds = [];
      for (var i = idx + 1; i <= idx + 2 && i < queue.length; i++) {
        var s = queue[i];
        var v = s && (s.videoId || (s.id && s.id.replace(/^yt[-_]/, '')));
        if (v) nextIds.push(v);
      }
      if (nextIds.length) window.__pfWarm(nextIds);
    } catch (_) {}
  }, true);
})();

// ── Smart Queue: Mood Match, Taste Lock, Duplicate Removal ──────────────────
// - Keeps a play history (what was played in last 6hrs)
// - Detects user's "language taste" from recent plays: Hindi/Punjabi vs English
// - Sends `lang` param to server so related songs match user's taste
// - Removes duplicate versions of same song (needs → trim at threshold 1)
// - Taste Lock: if user is in Indian mode, all queued songs are filtered to Indian
(function () {
  var NOISE = /\b(official|video|audio|lyrical|lyrics|lyric|full|song|songs|hd|4k|remix|slowed|reverb|lofi|cover|version|8d|bass|boosted|reprise|karaoke|instrumental|unplugged|live|male|female|feat|ft|music|visualizer|new)\b/g;
  var HISTORY_KEY = 'aura_played_v2';          // bumped to clear old cache
  var HISTORY_MAX = 80;
  var HISTORY_AGE = 8 * 60 * 60 * 1000;        // 8 hours

  // ── Taste detection ──────────────────────────────────────────────────────
  // Known Indian artists (lowercase) for fast O(1) lookup
  var INDIAN_ARTISTS_SET = new Set([
    'arijit singh','atif aslam','shreya ghoshal','neha kakkar','badshah','honey singh',
    'yo yo honey singh','diljit dosanjh','ap dhillon','sidhu moose wala','karan aujla',
    'jubin nautiyal','darshan raval','sonu nigam','kumar sanu','udit narayan','alka yagnik',
    'lata mangeshkar','kishore kumar','mohammed rafi','mohit chauhan','kk','vishal mishra',
    'b praak','guru randhawa','armaan malik','pritam','a r rahman','a.r. rahman','anuv jain',
    'sunidhi chauhan','asees kaur','tulsi kumar','mika singh','jass manak','harrdy sandhu',
    'shubh','king','mc stan','prateek kuhad','jasleen royal','sachin-jigar','amit trivedi',
    'vishal-shekhar','papon','palak muchhal','payal dev','stebin ben','ammy virk','amrit maan',
    'kaka','jaani','mankirt aulakh','gurnam bhullar','raftaar','emiway','divine','imran khan',
    'arjun kanungo','ankit tiwari','mithoon','sukhwinder singh','rahat fateh ali khan',
    'nusrat fateh ali khan','talwiinder','anirudh ravichander','sid sriram','dhanush',
    'yuvan shankar raja','sp balasubramanyam','zahrah s khan','nikhita gandhi','rochak kohli',
    'tanishk bagchi','darshan raval','yasser desai','raghav chaitanya','dhvani bhanushali'
  ]);
    var WESTERN_ARTISTS_SET = new Set([
    'ed sheeran','taylor swift','justin bieber','the weeknd','weeknd','dua lipa','billie eilish','imagine dragons',
    'coldplay','eminem','drake','post malone','bruno mars','adele','rihanna','ariana grande','selena gomez',
    'charlie puth','shawn mendes','maroon 5','linkin park','marshmello','alan walker','martin garrix','kygo',
    'avicii','calvin harris','david guetta','onerepublic','sia','katy perry','lady gaga','miley cyrus','harry styles',
    'olivia rodrigo','sam smith','lewis capaldi','travis scott','kendrick lamar','21 savage','bts','blackpink',
    'camila cabello','ellie goulding','rema','doja cat','sza','lana del rey','queen','the beatles','michael jackson',
    'nf','juice wrld','xxxtentacion','lil nas x','lil baby','lil wayne','pitbull','jason derulo','sean paul','akon',
    'one direction','5 seconds of summer','halsey','the chainsmokers','zedd','tones and i','glass animals','gotye',
    'khalid','jvke','benson boone','sabrina carpenter','chappell roan','teddy swims','morgan wallen','luke combs',
    'tyla','burna boy','wizkid','ava max','meghan trainor'
  ]);
  var INDIC_SCRIPT = /[\u0900-\u097F\u0A00-\u0A7F\u0980-\u09FF\u0B80-\u0BFF\u0C00-\u0C7F\u0AA0-\u0ABF]/;
  var HINDI_WORDS = /\b(tera|mera|meri|teri|tum|hum|dil|pyar|ishq|mohabbat|zindagi|saath|yaar|yaad|bekhayali|kesariya|tujhe|mujhe|humsafar|dilbar|dhadkan|chaand|aankhein|bollywood|hindi|punjabi|bhojpuri)\b/i;

  // Returns 'in' (Indian), 'en' (Western), or '' (unknown)
  function songLang(name, artist) {
    var t = String(name || '').toLowerCase();
    var a = String(artist || '').toLowerCase();
    if (INDIC_SCRIPT.test(t + a)) return 'in';
    var parts = a.replace(/[,&]/g, '|').split('|').map(function(x) { return x.trim(); });
    for (var i = 0; i < parts.length; i++) {
      if (INDIAN_ARTISTS_SET.has(parts[i])) return 'in';
    }
    if (HINDI_WORDS.test(t)) return 'in';
    if (/\b(t.series|zee music|sony music india|tips|saregama|speed records|desi melodies|lahari|hungama|aditya music|white hill|geet mp3)\b/i.test(t + a)) return 'in';
    // Check Western artist set
    if (WESTERN_ARTISTS_SET.has(a)) return 'en';
    for (var j = 0; j < parts.length; j++) {
      if (WESTERN_ARTISTS_SET.has(parts[j])) return 'en';
    }
    if (/\bvevo\b/i.test(a)) return 'en';
    return '';
  }

  // Determine user's dominant taste from recent plays: 'in', 'en', or ''
  function tasteLang() {
    // Strictly locked to Indian (Hindi/Punjabi) for all auto-suggestions and play queue
    return 'in';
  }

  // Filter list to match user's taste (Strict: never allow English in queue/autoplay)
  function applyTasteLock(list, taste) {
    return (list || []).filter(function(s) {
      return songLang(s.name, s.artist) !== 'en';
    });
  }

  // ── Core dedup + history ─────────────────────────────────────────────────
  function key(t) {
    return String(t || '').toLowerCase()
      .replace(/\(.*?\)|\[.*?\]|\{.*?\}/g, ' ')
      .replace(NOISE, ' ')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
  }

  // Same song = first words match (regardless of "Official Video", "Lofi", etc.)
  function same(a, b) {
    var x = key(a).split(' ').filter(Boolean);
    var y = key(b).split(' ').filter(Boolean);
    if (!x.length || !y.length) return false;
    var n = Math.min(x.length, y.length, 3);
    var starts = true;
    for (var i = 0; i < n; i++) if (x[i] !== y[i]) { starts = false; break; }
    if (starts && (n >= 2 || x[0].length >= 4)) return true;
    // "Meri Aashiqui Ab Tum Hi Ho" is still "Tum Hi Ho": the shorter title sits inside the longer one.
    var sx = x.join(' '), sy = y.join(' ');
    var short = sx.length <= sy.length ? sx : sy, long = sx.length <= sy.length ? sy : sx;
    return short.split(' ').length >= 3 && short.length >= 8 && (' ' + long + ' ').indexOf(' ' + short + ' ') !== -1;
  }

  // Everything after the playing song: drop other versions of songs already in the queue
  // or already played, so "next" never gives the same song again.
  function cleanQueue(cur, queue) {
    var at = queue.findIndex(function(s) { return s.id === cur.id; });
    if (at < 0) return queue;
    var kept = [];
    var out = [];
    for (var i = 0; i < queue.length; i++) {
      var s = queue[i];
      if (i <= at) { out.push(s); kept.push(s); continue; }
      var dup = kept.some(function(k) { return k.id === s.id || same(k.name, s.name); }) || wasPlayed(s);
      if (!dup) { out.push(s); kept.push(s); }
    }
    return out;
  }

  var isYt = function(s) { return !!s && String(s.id || '').indexOf('yt_') === 0; };
  var videoId = function(s) { return s.videoId || String(s.id || '').replace(/^yt_|^yt-/, ''); };

  var history = (function() {
    try {
      var h = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
      return Array.isArray(h) ? h : [];
    } catch (e) { return []; }
  })();

  function recent() {
    var cutoff = Date.now() - HISTORY_AGE;
    return history.filter(function(h) { return h.t > cutoff; });
  }
  function played(song) {
    if (!isYt(song)) return;
    history = history.filter(function(h) { return h.id !== song.id; });
    history.push({
      id: song.id, videoId: videoId(song),
      name: song.name || '', artist: song.artist || '',
      lang: songLang(song.name, song.artist),
      t: Date.now()
    });
    if (history.length > HISTORY_MAX) history = history.slice(-HISTORY_MAX);
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); } catch (e) {}
    // Update taste lock display
    var lang = tasteLang();
    if (lang) {
      try { localStorage.setItem('aura_taste_lang', lang + ':' + Date.now()); } catch(e) {}
    }
  }
  function wasPlayed(song) {
    if (!isYt(song)) return false;
    var list = recent();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === song.id || same(list[i].name, song.name)) return true;
    }
    return false;
  }

  // ── Fetch related songs from server ─────────────────────────────────────
  function fetchRelated(seed, done, fail) {
    var lang = tasteLang();
    var url = '/api/yt/related'
      + '?id=' + encodeURIComponent(videoId(seed))
      + '&title=' + encodeURIComponent(seed.name || '')
      + '&artist=' + encodeURIComponent(seed.artist || '')
      + '&lang=' + encodeURIComponent(lang)
      + '&hist=' + encodeURIComponent(history.slice(-12).map(function(h) {
          return String(h.name || '').replace(/[|;]/g, ' ')
            + '|' + String(h.artist || '').replace(/[|;]/g, ' ');
        }).join(';'));

    fetch(url)
      .then(function(r) { return r.ok ? r.json() : []; })
      .then(function(list) {
        if (!Array.isArray(list) || !list.length) { fail(); return; }
        // Client-side Taste Lock enforcement (belt+suspenders after server filter)
        var taste = tasteLang();
        var locked = applyTasteLock(list, taste);
        if (locked.length) done(locked); else fail();
      })
      .catch(function() { fail(); });
  }

  // ── Merge: insert related right after current song, skip played/duplicates ──
  function merge(cur, queue, add) {
    var have = {};
    queue.forEach(function(s) { have[s.id] = true; });
    // Taste Lock on merge too
    var taste = tasteLang();
    var filtered = applyTasteLock(add, taste);
    var fresh = filtered.filter(function(s) {
      return !have[s.id] && !same(s.name, cur.name) && !wasPlayed(s);
    });
    var at = queue.findIndex(function(s) { return s.id === cur.id; });
    if (window.__pfWarm) window.__pfWarm(fresh.slice(0, 2).map(videoId));
    if (at < 0) return queue.concat(fresh);
    return queue.slice(0, at + 1).concat(fresh, queue.slice(at + 1));
  }

  var topping = {};

  window.__auraRelated = {
    same: same,
    played: played,
    wasPlayed: wasPlayed,
    merge: merge,
    tasteLang: tasteLang,
    songLang: songLang,

    playRelated: function(cur, ok, fail) {
      var seeds = [cur];
      var past = recent().filter(function(h) { return h.id !== cur.id; }).slice(-3).reverse();
      past.forEach(function(h) {
        seeds.push({ id: h.id, videoId: h.videoId, name: h.name, artist: h.artist });
      });
      var i = 0;
      (function tryNext() {
        if (i >= seeds.length) { fail(); return; }
        var seed = seeds[i++];
        fetchRelated(seed, function(list) {
          var fresh = list.filter(function(s) { return !wasPlayed(s) && !same(s.name, cur.name); });
          if (fresh.length) ok(fresh); else tryNext();
        }, tryNext);
      })();
    },

    // ── DUPLICATE REMOVAL: even 1 duplicate triggers trim (was 2) ──────────
    needs: function(cur, list) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].id !== cur.id && same(list[i].name, cur.name)) return true;
      }
      return false;
    },
    trim: function(cur, list) {
      // Keep only the BEST version (first occurrence = highest quality from server)
      return cleanQueue(cur, list);
    },
    load: function(cur, done) {
      fetchRelated(cur, done, function() {});
    },

    // Keep 4+ fresh songs queued after current (was 3)
    topUp: function(cur, queue, setQueue, toSong) {
      if (!isYt(cur)) return;
      var cleaned = cleanQueue(cur, queue);
      if (cleaned.length !== queue.length) { setQueue(cleaned); queue = cleaned; }
      if (topping[cur.id]) return;
      var at = queue.findIndex(function(s) { return s.id === cur.id; });
      if (at < 0) return;
      var taste = tasteLang();
      var ahead = 0;
      for (var i = at + 1; i < queue.length; i++) {
        var s = queue[i];
        if (!wasPlayed(s) && !same(s.name, cur.name)) {
          // In taste-lock mode, only count songs matching the taste
          if (!taste || songLang(s.name, s.artist) !== 'en') ahead++;
        }
      }
      if (ahead >= 4) return;
      topping[cur.id] = true;
      fetchRelated(cur, function(list) {
        setQueue(function(q) { return merge(cur, q, list.map(toSong)); });
      }, function() {});
    }
  };

  // Expose taste info on window for the auto-suggest feature
  window.__auraTasteLang = tasteLang;
})();
