// Starts looking up stream URLs before the user taps a song, so playback starts in ~1s.
// Results are kept in memory; the player picks them up through window.__pfGet.
(function () {
  var store = {};
  var TTL = 20 * 60 * 1000;
  var clean = function (id) { return String(id || '').replace(/^yt_|^yt-/, '').trim(); };

  window.__pfWarm = function (ids) {
    (ids || []).forEach(function (raw) {
      var id = clean(raw);
      if (!id) return;
      var hit = store[id];
      if (hit && Date.now() - hit.t < TTL) return;
      store[id] = {
        t: Date.now(),
        p: fetch('/api/yt/stream?id=' + encodeURIComponent(id) + '&json=1')
          .then(function (r) { return r.ok ? r : null; })
          .catch(function () { return null; })
      };
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

// Endless "next": the queue after a search is full of versions of one song, and a short queue
// ends up replaying songs. These helpers keep a play history, skip anything played recently and
// keep fetching related songs, so "next" always gives a new song and nothing comes back soon.
(function () {
  var NOISE = /\b(official|video|audio|lyrical|lyrics|lyric|full|song|songs|hd|4k|remix|slowed|reverb|lofi|cover|version|8d|bass|boosted|reprise|karaoke|instrumental|unplugged|live|male|female|feat|ft|music|visualizer|new)\b/g;
  var HISTORY_KEY = 'aura_played_v1';
  var HISTORY_MAX = 60;                        // songs remembered
  var HISTORY_AGE = 6 * 60 * 60 * 1000;        // ...for six hours

  function key(t) {
    return String(t || '').toLowerCase()
      .replace(/\(.*?\)|\[.*?\]|\{.*?\}/g, ' ')
      .replace(NOISE, ' ')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
  }
  // Same song = the first words of the titles match (the rest is "Official Video", artist, "Lofi mix"...).
  function same(a, b) {
    var x = key(a).split(' ').filter(Boolean);
    var y = key(b).split(' ').filter(Boolean);
    if (!x.length || !y.length) return false;
    var n = Math.min(x.length, y.length, 3);
    for (var i = 0; i < n; i++) if (x[i] !== y[i]) return false;
    return n >= 2 || x[0].length >= 4;
  }
  var isYt = function (s) { return !!s && String(s.id || '').indexOf('yt_') === 0; };
  var videoId = function (s) { return s.videoId || String(s.id || '').replace(/^yt_|^yt-/, ''); };

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
  function played(song) {
    if (!isYt(song)) return;
    history = history.filter(function (h) { return h.id !== song.id; });
    history.push({ id: song.id, videoId: videoId(song), name: song.name || '', artist: song.artist || '', t: Date.now() });
    if (history.length > HISTORY_MAX) history = history.slice(-HISTORY_MAX);
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); } catch (e) {}
  }
  function wasPlayed(song) {
    if (!isYt(song)) return false;
    var list = recent();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === song.id || same(list[i].name, song.name)) return true;
    }
    return false;
  }

  function fetchRelated(seed, done, fail) {
    fetch('/api/yt/related?id=' + encodeURIComponent(videoId(seed)) +
          '&title=' + encodeURIComponent(seed.name || '') +
          '&artist=' + encodeURIComponent(seed.artist || ''))
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (list) {
        if (Array.isArray(list) && list.length) done(list); else fail();
      })
      .catch(function () { fail(); });
  }

  // put related songs right after the current one, leaving out anything played recently
  function merge(cur, queue, add) {
    var have = {};
    queue.forEach(function (s) { have[s.id] = true; });
    var fresh = add.filter(function (s) {
      return !have[s.id] && !same(s.name, cur.name) && !wasPlayed(s);
    });
    var at = queue.findIndex(function (s) { return s.id === cur.id; });
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

    // Fresh related songs for `cur`. If everything related was already played, try what was
    // related to the last couple of songs. ok(list) with new songs, fail() when none are found.
    playRelated: function (cur, ok, fail) {
      var seeds = [cur];
      var past = recent().filter(function (h) { return h.id !== cur.id; }).slice(-2).reverse();
      past.forEach(function (h) { seeds.push({ id: h.id, videoId: h.videoId, name: h.name, artist: h.artist }); });
      var i = 0;
      (function tryNext() {
        if (i >= seeds.length) { fail(); return; }
        var seed = seeds[i++];
        fetchRelated(seed, function (list) {
          var fresh = list.filter(function (s) { return !wasPlayed(s) && !same(s.name, cur.name); });
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
    trim: function (cur, list) {
      return list.filter(function (s) { return s.id === cur.id || !same(s.name, cur.name); });
    },
    load: function (cur, done) {
      fetchRelated(cur, done, function () {});
    },

    // Keep at least three new songs queued after the current one, so "next" is instant.
    topUp: function (cur, queue, setQueue, toSong) {
      if (!isYt(cur) || topping[cur.id]) return;
      var at = queue.findIndex(function (s) { return s.id === cur.id; });
      if (at < 0) return;
      var ahead = 0;
      for (var i = at + 1; i < queue.length; i++) {
        if (!wasPlayed(queue[i]) && !same(queue[i].name, cur.name)) ahead++;
      }
      if (ahead >= 3) return;
      topping[cur.id] = true;
      fetchRelated(cur, function (list) {
        setQueue(function (q) { return merge(cur, q, list.map(toSong)); });
      }, function () {});
    }
  };
})();
