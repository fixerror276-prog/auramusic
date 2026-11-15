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
