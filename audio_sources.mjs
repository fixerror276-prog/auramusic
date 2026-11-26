// Pure Mochy InnerTube Audio & Video Extractor
// Uses YouTube InnerTube (ANDROID_VR / IOS) for <300ms unciphered audio/video streams
// and YT Music InnerTube (WEB_REMIX) for related/up-next radio tracks.

const INNERTUBE_TIMEOUT_MS = 2500;
const VIDEO_TIMEOUT_MS = 4500;
const RELATED_TIMEOUT_MS = 3500;
const STREAM_TTL_MS = 60 * 60 * 1000;
const RELATED_TTL_MS = 30 * 60 * 1000;

const cache = new Map(); // key -> { value, expires }

function getCached(key) {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  cache.delete(key);
  return null;
}

function setCached(key, value, ttl) {
  if (cache.size > 500) cache.delete(cache.keys().next().value);
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

// Mochy-Music InnerTube direct player clients (ANDROID_VR & IOS — <300ms unciphered streams)
const MOCHY_INNERTUBE_CLIENTS = [
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
  if (!best) throw new Error('no innertube audio format');
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
  const key = `innertube:${id}`;
  const cached = getCached(key);
  if (cached) return cached;
  return dedupe(key, async () => {
    const found = await withTimeout(
      Promise.any(MOCHY_INNERTUBE_CLIENTS.map(c => mochyInnerTubeExtract(c, id))),
      INNERTUBE_TIMEOUT_MS + 500,
      'innertube'
    );
    setCached(key, found, STREAM_TTL_MS);
    return found;
  });
}

// Fills the cache ahead of time using Mochy InnerTube so the first tap on a song is instant.
export function warmAudio(ids) {
  if (!Array.isArray(ids)) return;
  for (const id of ids) {
    if (!id) continue;
    getInnerTubeAudio(id).catch(() => {});
  }
}

// Returns { streamUrl, source } or null — Pure Mochy InnerTube (ANDROID_VR & IOS).
export async function resolveAudio(id) {
  const cached = getCached(`innertube:${id}`);
  if (cached) {
    return { streamUrl: cached.url, source: cached.source };
  }
  try {
    const p = await getInnerTubeAudio(id);
    if (p?.url) return { streamUrl: p.url, source: p.source };
  } catch {}
  return null;
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
  const id = maybeId || idOrUnused;
  if (!id) return [];
  const key = `related:${id}`;
  const cached = getCached(key);
  if (cached) return cached;

  return dedupe(key, async () => {
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
  });
}
