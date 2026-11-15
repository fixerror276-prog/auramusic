package com.auramusic.app;

// JavaScript injected into the site before its own code runs. It does three things:
//  1. If this phone's WebView has no Media Session API, it installs a stand-in, so the site
//     (which already publishes title / artist / cover / play state through it) works as usual.
//  2. It forwards what is playing to Android (AuraNative) for the lock-screen player.
//  3. It lets Android press the site's own play / pause / next / previous / seek handlers.
// Audio element events and the site's saved "current song" are used as a backup source.
final class BridgeScript {
    private BridgeScript() { }

    static final String JS = """
(function () {
  if (window.__auraBridge || !window.AuraNative) return;
  window.__auraBridge = true;

  var handlers = {};
  var gotMetadata = false;
  var lastPosSent = 0;

  function absolute(url) {
    if (!url) return '';
    try { return new URL(url, location.href).href; } catch (e) { return ''; }
  }
  function sendMeta(title, artist, art) {
    try { AuraNative.setMetadata(String(title || ''), String(artist || ''), absolute(art)); } catch (e) {}
  }
  function sendPlaying(p) {
    try { AuraNative.setPlaying(!!p); } catch (e) {}
  }
  function sendPosition(durationSec, positionSec, force) {
    var now = Date.now();
    if (!force && now - lastPosSent < 2000) return;
    if (!isFinite(durationSec) || !isFinite(positionSec)) return;
    lastPosSent = now;
    try { AuraNative.setPosition(Math.round(durationSec * 1000), Math.round(positionSec * 1000)); } catch (e) {}
  }
  function onMetadata(m) {
    if (!m) return;
    gotMetadata = true;
    var art = '';
    if (m.artwork && m.artwork.length) art = m.artwork[m.artwork.length - 1].src || '';
    sendMeta(m.title, m.artist, art);
  }
  function onState(s) { sendPlaying(s === 'playing'); }

  var ms = navigator.mediaSession;
  if (!ms) {
    // Stand-in Media Session for WebViews that do not have one.
    var store = { metadata: null, playbackState: 'none' };
    ms = {
      setActionHandler: function (action, handler) { handlers[action] = handler; },
      setPositionState: function (st) {
        if (st) sendPosition(st.duration || 0, st.position || 0, false);
      }
    };
    Object.defineProperty(ms, 'metadata', {
      get: function () { return store.metadata; },
      set: function (v) { store.metadata = v; try { onMetadata(v); } catch (e) {} }
    });
    Object.defineProperty(ms, 'playbackState', {
      get: function () { return store.playbackState; },
      set: function (v) { store.playbackState = v; try { onState(v); } catch (e) {} }
    });
    try {
      Object.defineProperty(navigator, 'mediaSession', { value: ms, configurable: true });
    } catch (e) {}
    if (typeof window.MediaMetadata === 'undefined') {
      window.MediaMetadata = function (init) {
        init = init || {};
        this.title = init.title || '';
        this.artist = init.artist || '';
        this.album = init.album || '';
        this.artwork = init.artwork || [];
      };
    }
  } else {
    // The WebView has a Media Session: keep it, and watch what the site does with it.
    var origSet = ms.setActionHandler.bind(ms);
    ms.setActionHandler = function (action, handler) {
      handlers[action] = handler;
      try { origSet(action, handler); } catch (e) {}
    };
    var proto = Object.getPrototypeOf(ms);
    var watch = function (name, onSet) {
      var d = Object.getOwnPropertyDescriptor(proto, name);
      if (!d || !d.set) return;
      Object.defineProperty(ms, name, {
        configurable: true,
        get: function () { return d.get.call(ms); },
        set: function (v) { d.set.call(ms, v); try { onSet(v); } catch (e) {} }
      });
    };
    watch('metadata', onMetadata);
    watch('playbackState', onState);
    if (ms.setPositionState) {
      var origPos = ms.setPositionState.bind(ms);
      ms.setPositionState = function (st) {
        try { origPos(st); } catch (e) {}
        if (st) sendPosition(st.duration || 0, st.position || 0, false);
      };
    }
  }

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

  // Backup: the site's saved "current song", used only if the Media Session never gave a title.
  function fromSavedSong() {
    if (gotMetadata) return;
    try {
      var song = JSON.parse(localStorage.getItem('auramusic_current_song') || 'null');
      if (song && song.name) sendMeta(song.name, song.artist || '', song.image || '');
    } catch (e) {}
  }

  // Backup: play state and progress straight from the audio element.
  function isAudio(e) { return e.target && e.target.tagName === 'AUDIO'; }
  document.addEventListener('playing', function (e) {
    if (!isAudio(e)) return;
    fromSavedSong();
    sendPlaying(true);
  }, true);
  document.addEventListener('pause', function (e) {
    if (isAudio(e)) sendPlaying(false);
  }, true);
  document.addEventListener('timeupdate', function (e) {
    if (isAudio(e)) sendPosition(e.target.duration, e.target.currentTime, false);
  }, true);
})();
""";
}
