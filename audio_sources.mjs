// Mochy Music REST API & InnerTube Audio Engine
// Connects to high-performance Mochy Music REST API (https://mochy-music-api.vercel.app)
// with sub-300ms direct unciphered fallback and in-memory multi-tier caching.

export const MOCHY_API_BASE = 'https://mochy-music-api.vercel.app';
const INNERTUBE_TIMEOUT_MS = 2000;   // tighter: fail fast so Promise.any wins sooner
const MOCHY_API_TIMEOUT_MS = 1200;   // Mochy REST is fast, don't wait too long
const VIDEO_TIMEOUT_MS = 4500;
const RELATED_TIMEOUT_MS = 3500;
const STREAM_TTL_MS = 90 * 60 * 1000;  // 90 min — YT stream URLs last ~6h
const RELATED_TTL_MS = 30 * 60 * 1000;
const CACHE_MAX = 1000; // larger cache = more songs stay warm

// LRU cache: Map preserves insertion order; on get we delete+re-insert to move to end
const cache = new Map(); // key -> { value, expires }

function getCached(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (hit.expires <= Date.now()) { cache.delete(key); return null; }
  // LRU: move to end (most recently used)
  cache.delete(key);
  cache.set(key, hit);
  return hit.value;
}

function setCached(key, value, ttl) {
  // LRU eviction: delete oldest entries when over limit
  if (cache.size >= CACHE_MAX) {
    // Delete first (oldest) CACHE_MAX/10 entries
    let evicted = 0;
    for (const k of cache.keys()) {
      cache.delete(k);
      if (++evicted >= CACHE_MAX / 10) break;
    }
  }
  cache.set(key, { value, expires: Date.now() + ttl });
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function isHttpUrl(value) {
  return typeof value === 'string' && /^https?:\/\//i.test(value);
}

// Prefer AAC/MP4 (plays everywhere, including iOS/Android); otherwise highest bitrate.
function pickBest(items, getBitrate, isMp4) {
  if (!items.length) return null;
  const byBitrate = (a, b) => getBitrate(b) - getBitrate(a);
  const mp4 = items.filter(isMp4).sort(byBitrate);
  return (mp4[0] || [...items].sort(byBitrate)[0]) || null;
}

// Mochy-Music InnerTube direct player clients (from Mochy YouTubeClient.kt — <300ms unciphered streams)
const MOCHY_INNERTUBE_CLIENTS = [
  {
    name: 'IOS',
    context: {
      client: {
        clientName: 'IOS',
        clientVersion: '21.03.1',
        osName: 'iOS',
        osVersion: '18.2.22C152',
        hl: 'en',
        gl: 'US'
      }
    },
    ua: 'com.google.ios.youtube/21.03.1 (iPhone16,2; U; CPU iOS 18_2 like Mac OS X;)'
  },
  {
    name: 'ANDROID_VR',
    context: {
      client: {
        clientName: 'ANDROID_VR',
        clientVersion: '1.61.48',
        osName: 'Android',
        osVersion: '12',
        deviceMake: 'Oculus',
        deviceModel: 'Quest 3',
        androidSdkVersion: '32',
        hl: 'en',
        gl: 'US'
      }
    },
    ua: 'com.google.android.apps.youtube.vr.oculus/1.61.48 (Linux; U; Android 12; en_US; Oculus Quest 3; Build/SQ3A.220605.009.A1; Cronet/132.0.6808.3)'
  },
  {
    name: 'VISIONOS',
    context: {
      client: {
        clientName: 'VISIONOS',
        clientVersion: '1.04',
        osName: 'visionOS',
        osVersion: '26.6.0.23O770',
        deviceMake: 'Apple',
        deviceModel: 'RealityDevice17,1',
        clientScreen: 'WATCH',
        platform: 'MOBILE',
        hl: 'en',
        gl: 'US'
      }
    },
    ua: 'com.google.visionos.youtube/1.04(RealityDevice17,1; U; CPU visionOS 26_6_0 like Mac OS X; US)'
  },
  {
    name: 'TVHTML5_SIMPLY_EMBEDDED_PLAYER',
    context: {
      client: {
        clientName: 'TVHTML5_SIMPLY_EMBEDDED_PLAYER',
        clientVersion: '2.0',
        hl: 'en',
        gl: 'US'
      },
      thirdParty: { embedUrl: 'https://www.youtube.com/' }
    },
    ua: 'Mozilla/5.0 (PlayStation; PlayStation 4/12.02) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.4 Safari/605.1.15'
  },
  {
    name: 'ANDROID',
    context: {
      client: {
        clientName: 'ANDROID',
        clientVersion: '21.26.364',
        osName: 'Android',
        osVersion: '11',
        hl: 'en',
        gl: 'US'
      }
    },
    ua: 'com.google.android.youtube/21.26.364 (Linux; U; Android 11) gzip'
  }
];

async function mochyInnerTubeExtract(clientCfg, id) {
  const res = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': clientCfg.ua
    },
    body: JSON.stringify({
      videoId: id,
      context: clientCfg.context,
      contentCheckOk: true,
      racyCheckOk: true
    }),
    signal: AbortSignal.timeout(INNERTUBE_TIMEOUT_MS)
  });
  if (!res.ok) throw new Error(`InnerTube HTTP ${res.status}`);
  const data = await res.json();
  const formats = (data.streamingData?.adaptiveFormats || []).filter(
    f => /^audio\//i.test(f.mimeType || '') && isHttpUrl(f.url)
  );
  const best = pickBest(
    formats,
    f => f.bitrate || f.averageBitrate || 0,
    f => /audio\/mp4/i.test(f.mimeType || '')
  );
  if (!best) {
    const status = data.playabilityStatus?.status || 'UNKNOWN';
    const reason = data.playabilityStatus?.reason || '';
    throw new Error(`no innertube audio format (${status}${reason ? ': ' + reason : ''})`);
  }
  return { url: best.url, source: `innertube:${clientCfg.name}` };
}

// Mochy-Music InnerTube direct video extractor (MP4 360p/720p for Video Player Mode)
export async function resolveVideo(id) {
  const key = `video:${id}`;
  const cached = getCached(key);
  if (cached) return cached;

  const extract = async (clientCfg) => {
    const res = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': clientCfg.ua },
      body: JSON.stringify({
        videoId: id,
        context: clientCfg.context,
        contentCheckOk: true,
        racyCheckOk: true
      }),
      signal: AbortSignal.timeout(VIDEO_TIMEOUT_MS)
    });
    if (!res.ok) throw new Error(`InnerTube HTTP ${res.status}`);
    const data = await res.json();
    const prog = (data.streamingData?.formats || []).filter(f => /video\/mp4/i.test(f.mimeType || '') && isHttpUrl(f.url));
    const adaptive = (data.streamingData?.adaptiveFormats || []).filter(
      f => /video\/mp4/i.test(f.mimeType || '') && /avc1/i.test(f.mimeType || '') && isHttpUrl(f.url)
    );
    const pick = prog.sort((a, b) => (b.height || 0) - (a.height || 0))[0]
              || adaptive.filter(f => (f.height || 0) <= 720 && (f.height || 0) >= 360).sort((a, b) => (b.height || 0) - (a.height || 0))[0]
              || adaptive[0];
    if (!pick) throw new Error('no video format');
    return { streamUrl: pick.url, quality: pick.qualityLabel || `${pick.height || 360}p`, source: `innertube:${clientCfg.name}` };
  };

  try {
    const found = await Promise.any(MOCHY_INNERTUBE_CLIENTS.map(c => extract(c)));
    setCached(key, found, STREAM_TTL_MS);
    return found;
  } catch {
    return null;
  }
}

function normaliseIp(ip) {
  return (ip || '').replace(/^::ffff:/, '').trim();
}

export function getClientIp(req) {
  const forwarded = (req.headers['x-forwarded-for'] || '').split(',')[0];
  return normaliseIp(forwarded || req.socket?.remoteAddress || '');
}

// A googlevideo URL carries `ip=<address that extracted it>`; it only plays from that IP.
export function urlWorksForClient(url, clientIp) {
  let lockedIp = '';
  try { lockedIp = new URL(url).searchParams.get('ip') || ''; } catch { return true; }
  if (!lockedIp) return true;
  const client = normaliseIp(clientIp);
  if (!client || client === '127.0.0.1' || client === '::1') return true;
  return normaliseIp(lockedIp) === client;
}

const inflight = new Map();
function dedupe(key, factory) {
  if (inflight.has(key)) return inflight.get(key);
  const p = factory().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

async function getInnerTubeAudio(id) {
  const key = `raw_innertube:${id}`;
  const cached = getCached(key);
  if (cached) return cached;
  return dedupe(key, async () => {
    // Fire fastest 2 clients first (IOS + ANDROID_VR — unciphered, no throttle)
    // After 300ms if no result, fire remaining clients in parallel
    const fast = MOCHY_INNERTUBE_CLIENTS.slice(0, 2);
    const slow = MOCHY_INNERTUBE_CLIENTS.slice(2);

    const fastRace = Promise.any(fast.map(c => mochyInnerTubeExtract(c, id)));

    const slowDelayed = new Promise((resolve, reject) => {
      setTimeout(() => {
        Promise.any(slow.map(c => mochyInnerTubeExtract(c, id))).then(resolve).catch(reject);
      }, 300);
    });

    const found = await withTimeout(
      Promise.any([fastRace, slowDelayed]),
      INNERTUBE_TIMEOUT_MS,
      'innertube'
    );
    setCached(key, found, STREAM_TTL_MS);
    return found;
  });
}

// Fills the cache ahead of time — staggered so we don't burst outbound connections.
// First 3 start immediately (they're about to be played), rest are staggered 150ms apart.
export function warmAudio(ids) {
  if (!Array.isArray(ids)) return;
  const clean = ids.map(id => String(id || '').replace(/^yt[-_]/, '').trim()).filter(Boolean);
  clean.forEach((id, index) => {
    const delay = index < 3 ? 0 : (index - 3) * 150; // first 3 immediate, rest staggered
    if (delay === 0) {
      resolveAudio(id).catch(() => {});
    } else {
      setTimeout(() => resolveAudio(id).catch(() => {}), delay);
    }
  });
}

// Returns { streamUrl, source } or null — Mochy Music REST API with InnerTube fallback.
// Strategy: try Mochy REST first (fastest, 1.2s timeout). If it doesn't respond in 400ms,
// fire InnerTube in parallel. First one to succeed wins — instant if cached.
export async function resolveAudio(id) {
  if (!id) return null;
  const cleanId = String(id).replace(/^yt[-_]/, '').trim();
  if (!cleanId || cleanId.length < 5) return null;
  const cacheKey = `audio:${cleanId}`;
  const cached = getCached(cacheKey);
  if (cached) {
    return { streamUrl: cached.url || cached.streamUrl, source: cached.source };
  }

  return dedupe(cacheKey, async () => {
    const mochyFetch = async () => {
      const res = await fetch(`${MOCHY_API_BASE}/api/song/${encodeURIComponent(cleanId)}/stream?quality=high`, {
        signal: AbortSignal.timeout(MOCHY_API_TIMEOUT_MS)
      });
      if (!res.ok) throw new Error('mochy api http error ' + res.status);
      const data = await res.json();
      if (!data?.success || !data?.streamUrl || !isHttpUrl(data.streamUrl)) {
        throw new Error('mochy api no stream url');
      }
      return { url: data.streamUrl, streamUrl: data.streamUrl, source: 'mochy-music-api' };
    };

    const directFetch = async () => {
      const p = await getInnerTubeAudio(cleanId);
      if (!p?.url) throw new Error('innertube no stream url');
      return { url: p.url, streamUrl: p.url, source: p.source || 'mochy:innertube' };
    };

    // Fire Mochy REST immediately. After 400ms if no result yet, fire InnerTube in parallel.
    // Promise.any returns whichever resolves first.
    let innerTubeFired = false;
    const innerTubeDelayed = new Promise((resolve, reject) => {
      setTimeout(() => {
        innerTubeFired = true;
        directFetch().then(resolve).catch(reject);
      }, 400);
    });

    try {
      const winner = await Promise.any([mochyFetch(), innerTubeDelayed]);
      setCached(cacheKey, winner, STREAM_TTL_MS);
      return winner;
    } catch {
      // Both failed — last-ditch: try InnerTube directly (in case delay was the issue)
      if (!innerTubeFired) {
        try {
          const fallback = await directFetch();
          if (fallback?.url) { setCached(cacheKey, fallback, STREAM_TTL_MS); return fallback; }
        } catch {}
      }
      return null;
    }
  });
}

// Diagnostic report for Mochy InnerTube clients.
export async function diagnose(id, clientIp) {
  const timed = async fn => {
    const start = Date.now();
    try {
      const value = await fn();
      return { ok: true, ms: Date.now() - start, value };
    } catch (e) {
      return { ok: false, ms: Date.now() - start, error: e.message };
    }
  };

  const clients = await Promise.all(MOCHY_INNERTUBE_CLIENTS.map(async c => {
    const r = await timed(() => mochyInnerTubeExtract(c, id));
    return r.ok
      ? { client: c.name, ok: true, ms: r.ms, worksForThisClient: urlWorksForClient(r.value.url, clientIp) }
      : { client: c.name, ok: false, ms: r.ms, error: r.error };
  }));

  const finalPick = await resolveAudio(id);
  return {
    videoId: id,
    engine: 'Mochy InnerTube Only',
    clientIp: normaliseIp(clientIp),
    clients,
    wouldPlayVia: finalPick ? finalPick.source : 'unavailable'
  };
}

// ---- related ("what to play next") via Mochy YT Music InnerTube Radio ----

function parseDurationStr(str) {
  const m = String(str || '').match(/(\d+):(\d{2})(?::(\d{2}))?/);
  if (!m) return 200;
  return m[3]
    ? (parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + parseInt(m[3], 10))
    : (parseInt(m[1], 10) * 60 + parseInt(m[2], 10));
}

// Supports both getRelated(id) and legacy getRelated(client, id) signature used by taste.mjs.
export async function getRelated(idOrUnused, maybeId) {
  const id = (maybeId || idOrUnused || '').replace(/^yt[-_]/, '').trim();
  if (!id) return [];
  const key = `related:${id}`;
  const cached = getCached(key);
  if (cached) return cached;

  return dedupe(key, async () => {
    const seenTitles = new Set();
    const cleanTitle = (str) => String(str || '')
      .toLowerCase()
      .replace(/\(.*?\)|\[.*?\]/g, '')
      .replace(/[^a-z0-9]/g, '')
      .trim();

    // 1. Try Mochy Music REST API related queue
    try {
      const resMochy = await fetch(`${MOCHY_API_BASE}/api/song/${encodeURIComponent(id)}/related`, {
        signal: AbortSignal.timeout(2000)
      });
      if (resMochy.ok) {
        const d = await resMochy.json();
        if (d && d.success && Array.isArray(d.tracks) && d.tracks.length > 0) {
          const items = [];
          for (const t of d.tracks) {
            const vid = t.id || t.videoId;
            if (!vid || vid === id) continue;
            const cTitle = cleanTitle(t.title);
            if (cTitle && seenTitles.has(cTitle)) continue;
            if (cTitle) seenTitles.add(cTitle);
            const thumbs = t.thumbnails || [];
            const rawImg = t.thumbnail || thumbs[thumbs.length - 1]?.url || `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`;
            items.push({
              videoId: vid,
              title: t.title,
              artist: t.artist || 'Unknown Artist',
              duration: t.durationSeconds || parseDurationStr(t.duration),
              image: rawImg
            });
          }
          if (items.length > 0) {
            setCached(key, items, RELATED_TTL_MS);
            return items;
          }
        }
      }
    } catch {}

    // 2. Direct InnerTube next fallback
    try {
      const res = await fetch('https://music.youtube.com/youtubei/v1/next?prettyPrint=false', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
          'Origin': 'https://music.youtube.com'
        },
        body: JSON.stringify({
          videoId: id,
          playlistId: `RDAMVM${id}`,
          isAudioOnly: true,
          context: {
            client: {
              clientName: 'WEB_REMIX',
              clientVersion: '1.20241118.01.00',
              hl: 'en',
              gl: 'IN'
            }
          }
        }),
        signal: AbortSignal.timeout(RELATED_TIMEOUT_MS)
      });
      if (!res.ok) throw new Error(`InnerTube next HTTP ${res.status}`);
      const data = await res.json();
      const tabs = data.contents?.singleColumnMusicWatchNextResultsRenderer?.tabbedRenderer?.watchNextTabbedResultsRenderer?.tabs;
      const contents = tabs?.[0]?.tabRenderer?.content?.musicQueueRenderer?.content?.playlistPanelRenderer?.contents || [];
      const items = [];
      for (const entry of contents) {
        const v = entry?.playlistPanelVideoRenderer;
        if (!v?.videoId || v.videoId === id) continue;
        const title = (v.title?.runs || []).map(r => r.text).join('').trim();
        const cTitle = cleanTitle(title);
        if (cTitle && seenTitles.has(cTitle)) continue;
        if (cTitle) seenTitles.add(cTitle);
        const artist = (v.longBylineText?.runs?.[0]?.text || v.shortBylineText?.runs?.[0]?.text || 'Unknown Artist').trim();
        const thumbs = v.thumbnail?.thumbnails || [];
        const image = thumbs[thumbs.length - 1]?.url || `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`;
        const duration = parseDurationStr(v.lengthText?.runs?.[0]?.text);
        if (title) {
          items.push({ videoId: v.videoId, title, artist, duration, image });
        }
      }
      if (items.length) setCached(key, items, RELATED_TTL_MS);
      return items;
    } catch {
      return [];
    }
  });
}
