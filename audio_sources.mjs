// Finds a playable audio URL for a YouTube video id.
//
// Why this exists: the old code asked ytdl-core for a googlevideo URL and handed it to
// the browser. That URL is locked to the IP address of the server that extracted it, so
// when the server is on a host like Vercel and the phone is on its own network, playback
// fails and the app silently fell back to the YouTube iframe (slow, and it stops when the
// screen locks). Here we:
//   * cache results so repeat plays are instant,
//   * check whether the extracted URL will work for the requesting client,
//   * fall back to Piped / Invidious instances, whose proxied URLs work from any network,
//   * keep every network call on a short timeout.

const splitList = (value, fallback) =>
  (value || fallback).split(',').map(s => s.trim().replace(/\/+$/, '')).filter(Boolean);

const PIPED_INSTANCES = splitList(
  process.env.PIPED_INSTANCES,
  'https://pipedapi.kavin.rocks,https://pipedapi.adminforge.de,https://api.piped.private.coffee'
);
const INVIDIOUS_INSTANCES = splitList(
  process.env.INVIDIOUS_INSTANCES,
  'https://inv.nadeko.net,https://yewtu.be'
);

const RELATED_TIMEOUT_MS = 4000;
const RELATED_TTL_MS = 30 * 60 * 1000;
const YTDL_TIMEOUT_MS = 4000;
const PORTABLE_TIMEOUT_MS = 3000;  // faster timeout for Piped/Invidious
const HEDGE_DELAY_MS = 0;          // race ALL sources simultaneously – fastest wins
const YTDL_TTL_MS = 4 * 60 * 60 * 1000;      // googlevideo URLs live ~6h
const PORTABLE_TTL_MS = 60 * 60 * 1000;

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

// Prefer AAC/MP4 (plays everywhere, including iPhones); otherwise the highest bitrate.
function pickBest(items, getBitrate, isMp4) {
  if (!items.length) return null;
  const byBitrate = (a, b) => getBitrate(b) - getBitrate(a);
  const mp4 = items.filter(isMp4).sort(byBitrate);
  return (mp4[0] || [...items].sort(byBitrate)[0]) || null;
}

async function ytdlExtract(client, id) {
  const info = await client.getInfo(`https://www.youtube.com/watch?v=${id}`);
  const audio = (info.formats || []).filter(f => f.hasAudio && !f.hasVideo && isHttpUrl(f.url));
  const best = pickBest(
    audio,
    f => f.audioBitrate || f.bitrate || 0,
    f => /audio\/mp4/i.test(f.mimeType || '') || f.container === 'mp4'
  );
  if (!best) throw new Error('no audio format found');
  return best.url;
}

async function fetchJson(url, ms) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 AuraMusic', Accept: 'application/json' },
    signal: AbortSignal.timeout(ms)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function pipedExtract(instance, id) {
  const data = await fetchJson(`${instance}/streams/${encodeURIComponent(id)}`, PORTABLE_TIMEOUT_MS);
  const streams = (data.audioStreams || []).filter(s => isHttpUrl(s.url));
  const best = pickBest(
    streams,
    s => s.bitrate || 0,
    s => /mp4|m4a/i.test(s.mimeType || '') || /m4a/i.test(s.format || '')
  );
  if (!best) throw new Error('no audio stream');
  return { url: best.url, source: `piped:${new URL(instance).hostname}` };
}

async function invidiousExtract(instance, id) {
  const data = await fetchJson(
    `${instance}/api/v1/videos/${encodeURIComponent(id)}?local=true&fields=adaptiveFormats`,
    PORTABLE_TIMEOUT_MS
  );
  const formats = (data.adaptiveFormats || []).filter(
    f => /^audio\//i.test(f.type || '') && isHttpUrl(f.url)
  );
  const best = pickBest(
    formats,
    f => parseInt(f.bitrate, 10) || 0,
    f => /audio\/mp4/i.test(f.type || '')
  );
  if (!best) throw new Error('no audio format');
  return { url: best.url, source: `invidious:${new URL(instance).hostname}` };
}

// Mochy-Music InnerTube direct player extractor (ANDROID_VR & IOS — <300ms unciphered audio streams)
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
    signal: AbortSignal.timeout(2500)
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
      signal: AbortSignal.timeout(4500)
    });
    if (!res.ok) throw new Error(`InnerTube HTTP ${res.status}`);
    const data = await res.json();
    const prog = (data.streamingData?.formats || []).filter(f => /video\/mp4/i.test(f.mimeType || '') && isHttpUrl(f.url));
    const adaptive = (data.streamingData?.adaptiveFormats || []).filter(f => /video\/mp4/i.test(f.mimeType || '') && /avc1/i.test(f.mimeType || '') && isHttpUrl(f.url));
    const pick = prog.sort((a, b) => (b.height || 0) - (a.height || 0))[0]
              || adaptive.filter(f => (f.height || 0) <= 720 && (f.height || 0) >= 360).sort((a, b) => (b.height || 0) - (a.height || 0))[0]
              || adaptive[0];
    if (!pick) throw new Error('no video format');
    return { streamUrl: pick.url, quality: pick.qualityLabel || `${pick.height || 360}p`, source: `innertube:${clientCfg.name}` };
  };

  try {
    const found = await Promise.any(MOCHY_INNERTUBE_CLIENTS.map(c => extract(c)));
    setCached(key, found, PORTABLE_TTL_MS);
    return found;
  } catch {
    return null;
  }
}

// Mochy InnerTube only — fastest (<300ms) unciphered audio streams.
function portableExtract(id) {
  const attempts = MOCHY_INNERTUBE_CLIENTS.map(c => mochyInnerTubeExtract(c, id));
  if (!attempts.length) return Promise.reject(new Error('no innertube clients configured'));
  return Promise.any(attempts);
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
  if (!client || client === '127.0.0.1' || client === '::1') return true; // server and browser on one machine
  return normaliseIp(lockedIp) === client;
}

const looksLikeDatacenter = () =>
  Boolean(process.env.VERCEL || process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME);

// Concurrent callers for the same id (e.g. a prefetch and the real play) share one lookup.
const inflight = new Map();
function dedupe(key, factory) {
  if (inflight.has(key)) return inflight.get(key);
  const p = factory().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

async function getYtdlUrl(client, id) {
  const key = `ytdl:${id}`;
  const cached = getCached(key);
  if (cached) return cached;
  return dedupe(key, async () => {
    const url = await withTimeout(ytdlExtract(client, id), YTDL_TIMEOUT_MS, 'ytdl');
    setCached(key, url, YTDL_TTL_MS);
    return url;
  });
}

// The raw (cached) URL from ytdl, for the server's own streaming proxy. Throws if none can be found.
export function getDirectAudioUrl(client, id) {
  return getYtdlUrl(client, id);
}

export function forgetDirectAudioUrl(id) {
  cache.delete(`ytdl:${id}`);
}

async function getPortable(id) {
  const key = `portable:${id}`;
  const cached = getCached(key);
  if (cached) return cached;
  return dedupe(key, async () => {
    const found = await withTimeout(portableExtract(id), PORTABLE_TIMEOUT_MS + 500, 'fallback');
    setCached(key, found, PORTABLE_TTL_MS);
    return found;
  });
}

// Resolves with the first truthy value, or null once every promise has settled without one.
function firstUseful(promises) {
  return new Promise(resolve => {
    let pending = promises.length;
    if (!pending) return resolve(null);
    const settle = v => {
      if (v) resolve(v);
      else if (--pending === 0) resolve(null);
    };
    for (const p of promises) p.then(settle, () => settle(null));
  });
}

// Fills the caches ahead of time using Mochy InnerTube so the first tap on a song is instant.
export function warmAudio(client, ids) {
  for (const id of ids) {
    if (!id) continue;
    getPortable(id).catch(() => {});
  }
}

// Returns { streamUrl, source } or null.
// Primary: Mochy InnerTube (ANDROID_VR & IOS). Backup: ytdl only if InnerTube fails.
export async function resolveAudio(client, id, clientIp) {
  const cached_portable = getCached(`portable:${id}`);
  if (cached_portable) {
    return { streamUrl: cached_portable.url, source: cached_portable.source };
  }

  try {
    const p = await getPortable(id);
    if (p?.url) return { streamUrl: p.url, source: p.source };
  } catch (_) {}

  // Emergency fallback only if InnerTube fails
  const ytdlUrl = getCached(`ytdl:${id}`) || await getYtdlUrl(client, id).catch(() => null);
  if (ytdlUrl) return { streamUrl: ytdlUrl, source: urlWorksForClient(ytdlUrl, clientIp) ? 'ytdl' : 'ytdl-ip-mismatch' };
  return null;
}

// Step-by-step report so it is obvious which part works on a given host.
export async function diagnose(client, id, clientIp) {
  const timed = async fn => {
    const start = Date.now();
    try {
      const value = await fn();
      return { ok: true, ms: Date.now() - start, value };
    } catch (e) {
      return { ok: false, ms: Date.now() - start, error: e.message };
    }
  };

  const report = {
    videoId: id,
    runningOn: process.env.VERCEL ? 'vercel' : process.env.NETLIFY ? 'netlify' : 'node',
    clientIp: normaliseIp(clientIp),
    ytdl: null,
    streamUrlCheck: null,
    fallbacks: []
  };

  const yt = await timed(() => withTimeout(ytdlExtract(client, id), 8000, 'ytdl'));
  if (yt.ok) {
    let host = '';
    let lockedIp = '';
    try { const u = new URL(yt.value); host = u.hostname; lockedIp = u.searchParams.get('ip') || ''; } catch {}
    report.ytdl = { ok: true, ms: yt.ms, host, lockedToIp: lockedIp, worksForThisClient: urlWorksForClient(yt.value, clientIp) };
    const check = await timed(async () => {
      const res = await fetch(yt.value, { headers: { Range: 'bytes=0-1' }, signal: AbortSignal.timeout(5000) });
      return res.status;
    });
    report.streamUrlCheck = check.ok
      ? { fetchedFromServerStatus: check.value, ms: check.ms }
      : { error: check.error };
  } else {
    report.ytdl = { ok: false, ms: yt.ms, error: yt.error };
  }

  const instances = [
    ...PIPED_INSTANCES.map(i => ({ kind: 'piped', instance: i, run: () => pipedExtract(i, id) })),
    ...INVIDIOUS_INSTANCES.map(i => ({ kind: 'invidious', instance: i, run: () => invidiousExtract(i, id) }))
  ];
  report.fallbacks = await Promise.all(instances.map(async ({ kind, instance, run }) => {
    const r = await timed(run);
    return r.ok
      ? { kind, instance, ok: true, ms: r.ms }
      : { kind, instance, ok: false, ms: r.ms, error: r.error };
  }));

  const finalPick = await resolveAudio(client, id, clientIp);
  report.wouldPlayVia = finalPick ? finalPick.source : 'nothing (iframe fallback, stops when screen locks)';
  return report;
}


// ---- related ("what to play next") ----

const idFromWatchUrl = u => (String(u || '').match(/[?&]v=([\w-]{11})/) || [])[1];

async function pipedRelated(instance, id) {
  const data = await fetchJson(`${instance}/streams/${encodeURIComponent(id)}`, RELATED_TIMEOUT_MS);
  const items = (data.relatedStreams || [])
    .filter(s => s && s.type !== 'playlist' && idFromWatchUrl(s.url))
    .map(s => ({
      videoId: idFromWatchUrl(s.url), title: s.title, artist: s.uploaderName,
      duration: s.duration, image: s.thumbnail
    }));
  if (!items.length) throw new Error('no related');
  return items;
}

async function invidiousRelated(instance, id) {
  const data = await fetchJson(
    `${instance}/api/v1/videos/${encodeURIComponent(id)}?local=true&fields=recommendedVideos`,
    RELATED_TIMEOUT_MS
  );
  const items = (data.recommendedVideos || [])
    .filter(v => v && v.videoId)
    .map(v => ({
      videoId: v.videoId, title: v.title, artist: v.author, duration: v.lengthSeconds,
      image: `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`
    }));
  if (!items.length) throw new Error('no related');
  return items;
}

async function ytdlRelated(client, id) {
  const info = await withTimeout(
    client.getInfo(`https://www.youtube.com/watch?v=${id}`), RELATED_TIMEOUT_MS + 1000, 'ytdl related'
  );
  const items = (info.related_videos || [])
    .filter(v => v && v.id)
    .map(v => ({
      videoId: v.id, title: v.title, artist: v.author?.name || v.author || '',
      duration: v.length_seconds, image: v.thumbnails?.[v.thumbnails.length - 1]?.url
    }));
  if (!items.length) throw new Error('no related');
  return items;
}

// Videos YouTube recommends after this one. First source that answers wins; cached.
export async function getRelated(client, id) {
  const key = `related:${id}`;
  const cached = getCached(key);
  if (cached) return cached;
  return dedupe(key, async () => {
    const attempts = [
      ...PIPED_INSTANCES.map(i => pipedRelated(i, id)),
      ...INVIDIOUS_INSTANCES.map(i => invidiousRelated(i, id)),
      ytdlRelated(client, id)
    ];
    const list = await Promise.any(attempts);
    setCached(key, list, RELATED_TTL_MS);
    return list;
  });
}
