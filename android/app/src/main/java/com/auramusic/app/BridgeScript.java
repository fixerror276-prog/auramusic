package com.auramusic.app;

// JavaScript injected into the site. The site already publishes what is playing through the
// browser Media Session API; this forwards it to Android (AuraNative) and lets Android press the
// site's own play / pause / next / previous / seek handlers.
final class BridgeScript {
    private BridgeScript() { }

    static final String JS = """
(function () {
  if (window.__auraBridge || !window.AuraNative || !navigator.mediaSession) return;
  window.__auraBridge = true;
  var ms = navigator.mediaSession;
  var handlers = {};

  var origSet = ms.setActionHandler.bind(ms);
  ms.setActionHandler = function (action, handler) {
    handlers[action] = handler;
    try { origSet(action, handler); } catch (e) {}
  };

  // Called from Android when a lock-screen / notification button is pressed.
  window.__auraAction = function (action, value) {
    var h = handlers[action];
    if (h) {
      try { h({ action: action, seekTime: value }); return; } catch (e) {}
    }
    var audio = document.querySelector('audio');
    if (!audio) return;
    if (action === 'play') audio.play();
    else if (action === 'pause') audio.pause();
    else if (action === 'seekto' && value != null) audio.currentTime = value;
  };

  var proto = Object.getPrototypeOf(ms);
  function watch(name, onSet) {
    var d = Object.getOwnPropertyDescriptor(proto, name);
    if (!d || !d.set) return;
    Object.defineProperty(ms, name, {
      configurable: true,
      get: function () { return d.get.call(ms); },
      set: function (v) {
        d.set.call(ms, v);
        try { onSet(v); } catch (e) {}
      }
    });
  }

  watch('metadata', function (m) {
    if (!m) return;
    var art = '';
    if (m.artwork && m.artwork.length) {
      art = m.artwork[m.artwork.length - 1].src || '';
      try { art = new URL(art, location.href).href; } catch (e) {}
    }
    AuraNative.setMetadata(String(m.title || ''), String(m.artist || ''), art);
  });

  watch('playbackState', function (s) {
    AuraNative.setPlaying(s === 'playing');
  });

  var origPos = ms.setPositionState ? ms.setPositionState.bind(ms) : null;
  var lastSent = 0;
  if (origPos) {
    ms.setPositionState = function (st) {
      try { origPos(st); } catch (e) {}
      var now = Date.now();
      if (st && now - lastSent > 2000) {
        lastSent = now;
        AuraNative.setPosition(Math.round((st.duration || 0) * 1000), Math.round((st.position || 0) * 1000));
      }
    };
  }
})();
""";
}
