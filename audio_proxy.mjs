// Streams audio through this server in small Range chunks.
//
// Why: the YouTube (googlevideo) URL we extract only works from the IP address of the machine
// that extracted it, so a phone can never play it directly. Proxying fixes that. Serving the
// audio in ~1 MB chunks (the browser just asks for the next chunk) keeps every request short,
// which matters on serverless hosts like Vercel that cut long responses, and it makes seeking work.

import { Readable } from 'node:stream';

const CHUNK_BYTES = 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = 10000;
const USER_AGENT =
  'com.google.ios.youtube/21.03.1 (iPhone16,2; U; CPU iOS 18_2 like Mac OS X;)';

function parseRange(header) {
  const m = /^bytes=(\d+)-(\d*)$/.exec(header || '');
  if (!m) {
    // If client sends no Range header (first audio tag request), request initial 1MB chunk from YouTube
    return { start: 0, end: CHUNK_BYTES - 1, isDefault: true };
  }
  const start = parseInt(m[1], 10);
  let end = m[2] === '' ? null : parseInt(m[2], 10);
  const cap = start + CHUNK_BYTES - 1;
  if (end === null || end > cap) end = cap;
  if (end < start) return null;
  return { start, end, isDefault: false };
}

// getUrl(): Promise<string>  - the (cached) upstream audio URL
// forget(): void             - drop that cached URL (it expired or was rejected)
// Resolves true when a response was written, false when nothing could be sent (caller may fall back).
export async function proxyAudio(req, res, { getUrl, forget }) {
  const range = parseRange(req.headers.range);

  for (let attempt = 0; attempt < 2; attempt++) {
    let url;
    try {
      url = await getUrl();
    } catch {
      return false;
    }

    const headers = { 'User-Agent': USER_AGENT };
    if (range) headers.Range = `bytes=${range.start}-${range.end}`;

    let upstream;
    try {
      upstream = await fetch(url, { headers, signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
    } catch {
      forget();
      continue;
    }

    // Link expired or was refused: get a fresh one and try once more.
    if ([401, 403, 404, 410].includes(upstream.status)) {
      try { await upstream.body?.cancel(); } catch {}
      forget();
      continue;
    }

    if (upstream.status === 416) {
      try { await upstream.body?.cancel(); } catch {}
      const total = (upstream.headers.get('content-range') || '').split('/')[1];
      res.writeHead(416, total ? { 'Content-Range': `bytes */${total}` } : {});
      res.end();
      return true;
    }

    if (!upstream.ok || !upstream.body) {
      try { await upstream.body?.cancel(); } catch {}
      return false;
    }

    const out = {
      'Content-Type': upstream.headers.get('content-type') || 'audio/mp4',
      'Accept-Ranges': 'bytes',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'private, max-age=300'
    };
    const length = upstream.headers.get('content-length');
    if (length) out['Content-Length'] = length;
    const contentRange = upstream.headers.get('content-range');
    if (contentRange) {
      out['Content-Range'] = contentRange;
      res.writeHead(206, out);
    } else {
      res.writeHead(200, out);
    }

    const body = Readable.fromWeb(upstream.body);
    res.on('close', () => body.destroy());
    body.on('error', () => res.destroy());
    body.pipe(res);
    return true;
  }
  return false;
}
