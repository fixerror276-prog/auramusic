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

// Queue helper: after a search, the queue is full of versions of the same song. These
// functions drop those versions and put YouTube's related songs next, like a playlist.
(function () {
  var NOISE = /\b(official|video|audio|lyrical|lyrics|lyric|full|song|songs|hd|4k|remix|slowed|reverb|lofi|cover|version|8d|bass|boosted|reprise|karaoke|instrumental|unplugged|live|male|female|feat|ft|music|visualizer|new)\b/g;
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
  var videoId = function (s) { return s.videoId || String(s.id || '').replace(/^yt_|^yt-/, ''); };

  window.__auraRelated = {
    same: same,
    // fetch related songs for `cur`; ok(list) when there are some, fail() otherwise
    playRelated: function (cur, ok, fail) {
      fetch('/api/yt/related?id=' + encodeURIComponent(videoId(cur)) +
            '&title=' + encodeURIComponent(cur.name || '') +
            '&artist=' + encodeURIComponent(cur.artist || ''))
        .then(function (r) { return r.ok ? r.json() : []; })
        .then(function (list) {
          if (Array.isArray(list) && list.length) ok(list); else fail();
        })
        .catch(function () { fail(); });
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
      fetch('/api/yt/related?id=' + encodeURIComponent(videoId(cur)) +
            '&title=' + encodeURIComponent(cur.name || '') +
            '&artist=' + encodeURIComponent(cur.artist || ''))
        .then(function (r) { return r.ok ? r.json() : []; })
        .then(function (list) { if (Array.isArray(list) && list.length) done(list); })
        .catch(function () {});
    },
    // put the related songs right after the current one
    merge: function (cur, queue, add) {
      var have = {};
      queue.forEach(function (s) { have[s.id] = true; });
      var fresh = add.filter(function (s) { return !have[s.id] && !same(s.name, cur.name); });
      var at = queue.findIndex(function (s) { return s.id === cur.id; });
      if (window.__pfWarm) window.__pfWarm(fresh.slice(0, 2).map(videoId));
      if (at < 0) return queue.concat(fresh);
      return queue.slice(0, at + 1).concat(fresh, queue.slice(at + 1));
    }
  };
})();
