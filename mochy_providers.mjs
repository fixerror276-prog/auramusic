// ═══════════════════════════════════════════════════════════════════════════
// Mochy-Music Provider Ecosystem (Ported to Node.js for AuraMusic)
// Inspired by realidkroo/Mochy-Music (GPL-3.0)
// Includes: InnerTube Typed Search & Browse, Multi-Provider Synced Lyrics
// (YouLy+ Word-Sync, SimpMusic, LRCLib, NetEase), Wikipedia Artist Info,
// and Spotify / Apple Music / Tidal / CSV Playlist Importer.
// ═══════════════════════════════════════════════════════════════════════════

const YTM_HEADERS = {
  'Content-Type': 'application/json',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Origin': 'https://music.youtube.com',
  'Referer': 'https://music.youtube.com/'
};

const YTM_CONTEXT = {
  client: {
    clientName: 'WEB_REMIX',
    clientVersion: '1.20250101.01.00',
    hl: 'en',
    gl: 'IN'
  }
};

const SEARCH_PARAMS = {
  songs: 'EgWKAQIIAWoKEAMQBBAJEAoQBQ%3D%3D',
  albums: 'EgWKAQIYAWoKEAMQBBAJEAoQBQ%3D%3D',
  artists: 'EgWKAQIgAWoKEAMQBBAJEAoQBQ%3D%3D',
  playlists: 'EgWKAQIoAWoKEAMQBBAJEAoQBQ%3D%3D'
};

function parseDuration(str) {
  const m = String(str || '').match(/(\d+):(\d{2})(?::(\d{2}))?/);
  if (!m) return 200;
  return m[3]
    ? (parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + parseInt(m[3], 10))
    : (parseInt(m[1], 10) * 60 + parseInt(m[2], 10));
}

/**
 * Typed YouTube Music InnerTube Search (songs | albums | artists | playlists)
 */
export async function searchYTMusicTyped(query, type = 'songs') {
  if (!query || !query.trim()) return [];
  const cleanType = SEARCH_PARAMS[type] ? type : 'songs';
  try {
    const res = await fetch('https://music.youtube.com/youtubei/v1/search?prettyPrint=false', {
      method: 'POST',
      headers: YTM_HEADERS,
      body: JSON.stringify({
        query: query.trim(),
        params: SEARCH_PARAMS[cleanType],
        context: YTM_CONTEXT
      }),
      signal: AbortSignal.timeout(5000)
    });
    if (!res.ok) return [];
    const data = await res.json();
    const tabs = data.contents?.tabbedSearchResultsRenderer?.tabs || [];
    const sections = tabs[0]?.tabRenderer?.content?.sectionListRenderer?.contents || [];
    const out = [];
    const seen = new Set();

    for (const sec of sections) {
      const items = sec.musicShelfRenderer?.contents || [];
      for (const item of items) {
        const r = item.musicResponsiveListItemRenderer;
        if (!r) continue;
        const title = r.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.map(x => x.text).join('') || '';
        const subRuns = r.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
        const subText = subRuns.map(x => x.text).join('');
        const subParts = subText.split('•').map(s => s.trim()).filter(Boolean);
        const thumbs = r.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
        const rawImg = thumbs[thumbs.length - 1]?.url || '/logo.png';
        const image = rawImg.replace(/=w\d+-h\d+/, '=w544-h544');

        if (cleanType === 'songs') {
          const vid = r.playlistItemData?.videoId ||
            r.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint?.videoId;
          if (!vid || seen.has(vid)) continue;
          seen.add(vid);
          const artist = subParts[0] || 'Unknown Artist';
          const durPart = subParts.find(p => /^\d+:\d{2}/.test(p));
          const album = (subParts.length >= 2 && !/^\d+:\d{2}/.test(subParts[1])) ? subParts[1] : 'YouTube Music';
          out.push({
            id: 'yt_' + vid,
            videoId: vid,
            type: 'song',
            name: title || query,
            artist,
            album,
            duration: parseDuration(durPart),
            image,
            url: `/api/yt/stream?id=${vid}&title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}`,
            source: 'Mochy YT Music'
          });
        } else {
          const browseId = r.navigationEndpoint?.browseEndpoint?.browseId || '';
          if (!browseId || seen.has(browseId)) continue;
          seen.add(browseId);
          out.push({
            id: browseId,
            browseId,
            type: cleanType.slice(0, -1), // album | artist | playlist
            name: title,
            subtitle: subText,
            artist: subParts[1] || subParts[0] || '',
            image
          });
        }
      }
    }
    return out;
  } catch (e) {
    console.warn(`[Mochy Search ${cleanType}] warning:`, e.message);
    return [];
  }
}

/**
 * Browse YouTube Music Album, Playlist, or Artist by browseId
 */
export async function browseYTMusic(browseId) {
  if (!browseId) return null;
  try {
    const res = await fetch('https://music.youtube.com/youtubei/v1/browse?prettyPrint=false', {
      method: 'POST',
      headers: YTM_HEADERS,
      body: JSON.stringify({ browseId, context: YTM_CONTEXT }),
      signal: AbortSignal.timeout(5500)
    });
    if (!res.ok) return null;
    const data = await res.json();

    // Extract header metadata
    const header = data.header?.musicDetailHeaderRenderer ||
      data.header?.musicImmersiveHeaderRenderer ||
      data.header?.musicVisualHeaderRenderer ||
      data.header?.musicResponsiveHeaderRenderer || {};
    const title = header.title?.runs?.map(r => r.text).join('') || 'Collection';
    const subtitle = header.subtitle?.runs?.map(r => r.text).join('') ||
      header.description?.runs?.map(r => r.text).join('') || '';
    const thumbs = header.thumbnail?.croppedSquareThumbnailRenderer?.thumbnail?.thumbnails ||
      header.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
    const image = (thumbs[thumbs.length - 1]?.url || '/logo.png').replace(/=w\d+-h\d+/, '=w544-h544');

    // Recursively find musicResponsiveListItemRenderer tracks
    const tracks = [];
    const seen = new Set();
    const walk = (obj) => {
      if (!obj || typeof obj !== 'object') return;
      if (Array.isArray(obj)) {
        for (const el of obj) walk(el);
        return;
      }
      if (obj.musicResponsiveListItemRenderer) {
        const r = obj.musicResponsiveListItemRenderer;
        const vid = r.playlistItemData?.videoId ||
          r.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint?.videoId;
        if (vid && !seen.has(vid)) {
          seen.add(vid);
          const tName = r.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.map(x => x.text).join('') || 'Track';
          const subRuns = r.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
          const subParts = subRuns.map(x => x.text).join('').split('•').map(s => s.trim()).filter(Boolean);
          const tArtist = subParts[0] || title;
          const durPart = subParts.find(p => /^\d+:\d{2}/.test(p));
          const tThumbs = r.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
          const tImg = (tThumbs[tThumbs.length - 1]?.url || image).replace(/=w\d+-h\d+/, '=w544-h544');
          tracks.push({
            id: 'yt_' + vid,
            videoId: vid,
            name: tName,
            artist: tArtist,
            album: title,
            duration: parseDuration(durPart),
            image: tImg,
            url: `/api/yt/stream?id=${vid}&title=${encodeURIComponent(tName)}&artist=${encodeURIComponent(tArtist)}`,
            source: 'Mochy YT Music'
          });
        }
      }
      for (const k of Object.keys(obj)) walk(obj[k]);
    };
    walk(data.contents);

    return { browseId, title, subtitle, image, tracks };
  } catch (e) {
    console.warn('[Mochy Browse] warning:', e.message);
    return null;
  }
}

/**
 * Artist Bio & Top Songs (Wikipedia + InnerTube)
 */
export async function getArtistInfo(name) {
  const cleanName = String(name || '').split(',')[0].trim();
  if (!cleanName) return null;

  const [wikiBio, artists, songs] = await Promise.all([
    fetch(`https://en.wikipedia.org/w/api.php?action=query&prop=extracts|pageimages&exintro=1&explaintext=1&pithumbsize=500&redirects=1&format=json&titles=${encodeURIComponent(cleanName)}`, {
      headers: { 'User-Agent': 'AuraMusic/1.0' },
      signal: AbortSignal.timeout(3500)
    }).then(r => r.json()).then(d => {
      const pages = Object.values(d?.query?.pages || {});
      const p = pages.find(x => x.extract && !x.missing);
      return p ? { bio: p.extract, image: p.thumbnail?.source || null } : null;
    }).catch(() => null),
    searchYTMusicTyped(cleanName, 'artists').catch(() => []),
    searchYTMusicTyped(`${cleanName} top songs`, 'songs').catch(() => [])
  ]);

  const topArtist = artists[0] || null;
  return {
    name: topArtist?.name || cleanName,
    browseId: topArtist?.browseId || null,
    image: topArtist?.image || wikiBio?.image || songs[0]?.image || '/logo.png',
    bio: wikiBio?.bio || `${cleanName} — Discovered via Mochy YouTube Music & Wikipedia.`,
    topSongs: songs.slice(0, 12)
  };
}

/**
 * Parse standard LRC AND enhanced word-by-word <mm:ss.xx> LRC
 */
export function parseLrcText(lrcRaw) {
  if (!lrcRaw) return [];
  const lines = [];
  for (const raw of String(lrcRaw).split('\n')) {
    const m = raw.match(/\[(\d+):(\d+(?:\.\d+)?)\]\s*(.*)/);
    if (!m) continue;
    const time = parseInt(m[1], 10) * 60 + parseFloat(m[2]);
    let rest = m[3].trim();
    if (!rest) continue;

    // Check for enhanced word-by-word tags <mm:ss.xx>word
    const words = [];
    const wordRegex = /<(\d+):(\d+(?:\.\d+)?)>([^<]*)/g;
    let wm;
    while ((wm = wordRegex.exec(rest)) !== null) {
      const wTime = parseInt(wm[1], 10) * 60 + parseFloat(wm[2]);
      const wText = wm[3].trim();
      if (wText) words.push({ time: wTime, text: wText });
    }
    const cleanText = rest.replace(/<\d+:\d+(?:\.\d+)?>/g, '').replace(/\s+/g, ' ').trim();
    if (cleanText) {
      lines.push(words.length > 0 ? { time, text: cleanText, words } : { time, text: cleanText });
    }
  }
  return lines.sort((a, b) => a.time - b.time);
}

/**
 * Multi-Provider Synced Lyrics Cascade:
 * 1. YouLy+ (word-by-word synced)
 * 2. SimpMusic Lyrics (YouTube videoId synced)
 * 3. LRCLib (synced LRC)
 * 4. NetEase (163.com synced LRC fallback)
 */
export async function fetchMultiProviderLyrics({ title, artist, videoId, duration, enabledProviders }) {
  const cleanTitle = String(title || '').split('|')[0].replace(/\(.*?\)|\[.*?\]/g, '').trim();
  const cleanArtist = String(artist || '').split(',')[0].trim();
  if (!cleanTitle) return { success: false, lines: [], provider: null };

  const allow = (name) => !Array.isArray(enabledProviders) || enabledProviders.includes(name);

  // 1. YouLy+ (Word-by-word!)
  if (allow('youlyplus')) {
    for (const host of ['https://lyricsplus.binimum.org', 'https://lyricsplus.prjktla.my.id']) {
      try {
        const u = `${host}/v2/lyrics/get?title=${encodeURIComponent(cleanTitle)}&artist=${encodeURIComponent(cleanArtist)}${duration ? `&duration=${Math.round(duration)}` : ''}`;
        const res = await fetch(u, { headers: { 'User-Agent': 'AuraMusic/1.0' }, signal: AbortSignal.timeout(3000) });
        if (res.ok) {
          const d = await res.json();
          if (Array.isArray(d?.lyrics) && d.lyrics.length > 0) {
            const lines = d.lyrics.map(l => ({
              time: (l.time || 0) / 1000,
              text: l.text || (Array.isArray(l.syllabus) ? l.syllabus.map(s => s.text).join('') : ''),
              words: Array.isArray(l.syllabus) && l.syllabus.length > 0
                ? l.syllabus.map(s => ({ time: (s.time || 0) / 1000, text: s.text || '' }))
                : undefined
            })).filter(l => l.text);
            if (lines.length > 0) {
              return { success: true, synced: true, wordSync: lines.some(l => l.words?.length), provider: 'YouLy+ (Word-Sync)', lines };
            }
          }
        }
      } catch {}
    }
  }

  // 2. SimpMusic Lyrics (by videoId)
  if (allow('simpmusic') && videoId) {
    try {
      const cleanVid = String(videoId).replace(/^yt_/, '');
      const res = await fetch(`https://api-lyrics.simpmusic.org/v1/${encodeURIComponent(cleanVid)}`, {
        headers: { 'User-Agent': 'AuraMusic/1.0' },
        signal: AbortSignal.timeout(3000)
      });
      if (res.ok) {
        const d = await res.json();
        const item = Array.isArray(d?.data) ? d.data[0] : d?.data || d;
        const lrc = item?.syncedLyrics || item?.richSyncLyrics;
        const lines = parseLrcText(lrc);
        if (lines.length > 0) {
          return { success: true, synced: true, wordSync: lines.some(l => l.words?.length), provider: 'SimpMusic', lines };
        }
      }
    } catch {}
  }

  // 3. LRCLib
  if (allow('lrclib')) {
    try {
      const lrcRes = await fetch(`https://lrclib.net/api/search?track_name=${encodeURIComponent(cleanTitle)}&artist_name=${encodeURIComponent(cleanArtist)}`, {
        headers: { 'User-Agent': 'AuraMusic/1.0' },
        signal: AbortSignal.timeout(3500)
      });
      if (lrcRes.ok) {
        const list = await lrcRes.json();
        const match = Array.isArray(list) ? list.find(x => x.syncedLyrics) || list[0] : null;
        if (match?.syncedLyrics) {
          const lines = parseLrcText(match.syncedLyrics);
          if (lines.length > 0) {
            return { success: true, synced: true, wordSync: false, provider: 'LRCLib', lines };
          }
        } else if (match?.plainLyrics) {
          const lines = match.plainLyrics.split('\n').filter(Boolean).map((text, idx) => ({ time: idx * 4, text: text.trim() }));
          if (lines.length > 0) return { success: true, synced: false, wordSync: false, provider: 'LRCLib (Plain)', lines };
        }
      }
    } catch {}
  }

  // 4. NetEase Fallback
  if (allow('netease')) {
    try {
      const sRes = await fetch(`https://music.163.com/api/search/get?s=${encodeURIComponent(cleanTitle + ' ' + cleanArtist)}&type=1&limit=3`, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://music.163.com/' },
        signal: AbortSignal.timeout(3000)
      });
      if (sRes.ok) {
        const sd = await sRes.json();
        const songId = sd?.result?.songs?.[0]?.id;
        if (songId) {
          const lRes = await fetch(`https://music.163.com/api/song/lyric?id=${songId}&lv=1&tv=-1`, {
            headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://music.163.com/' },
            signal: AbortSignal.timeout(3000)
          });
          if (lRes.ok) {
            const ld = await lRes.json();
            const lines = parseLrcText(ld?.lrc?.lyric);
            if (lines.length > 0) {
              return { success: true, synced: true, wordSync: false, provider: 'NetEase', lines };
            }
          }
        }
      }
    } catch {}
  }

  return { success: false, synced: false, lines: [], provider: null };
}

/**
 * External Playlist / Track Importer (Spotify, Apple Music, Tidal/Monochrome, CSV/Text)
 */
export async function resolveExternalImport(input) {
  const raw = String(input || '').trim();
  if (!raw) return { success: false, error: 'Empty URL or tracklist' };

  let playlistTitle = 'Imported Playlist';
  const rawTracks = []; // [{ title, artist }]

  // 1. Spotify Public Playlist / Album / Track URL via Spotify Embed __NEXT_DATA__
  const spMatch = raw.match(/open\.spotify\.com\/(playlist|album|track)\/([a-zA-Z0-9]+)/);
  if (spMatch) {
    const [, kind, id] = spMatch;
    try {
      const res = await fetch(`https://open.spotify.com/embed/${kind}/${id}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        signal: AbortSignal.timeout(6000)
      });
      if (res.ok) {
        const html = await res.text();
        const ndMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
        if (ndMatch) {
          const nd = JSON.parse(ndMatch[1]);
          const entity = nd?.props?.pageProps?.state?.data?.entity;
          if (entity) {
            playlistTitle = entity.name || entity.title || 'Spotify Import';
            const list = entity.trackList || (entity.type === 'track' ? [entity] : []);
            for (const t of list) {
              const title = t.title || t.name;
              const artist = t.subtitle || (Array.isArray(t.artists) ? t.artists.map(a => a.name).join(', ') : '');
              if (title) rawTracks.push({ title, artist });
            }
          }
        }
      }
    } catch (e) {
      console.warn('[Spotify Import] error:', e.message);
    }
  }
  // 2. Apple Music URL -> iTunes Lookup API
  else if (/music\.apple\.com/i.test(raw)) {
    const amId = raw.match(/\/(?:album|playlist)\/[^/]+\/([a-zA-Z0-9.]+)/)?.[1] || raw.match(/[?&]i=(\d+)/)?.[1] || raw.match(/\/(\d+)(?:\?|$)/)?.[1];
    if (amId && /^\d+$/.test(amId)) {
      try {
        const res = await fetch(`https://itunes.apple.com/lookup?id=${amId}&entity=song`, { signal: AbortSignal.timeout(5000) });
        if (res.ok) {
          const d = await res.json();
          for (const item of (d.results || [])) {
            if (item.wrapperType === 'collection') playlistTitle = item.collectionName || playlistTitle;
            if (item.wrapperType === 'track' && item.trackName) {
              rawTracks.push({ title: item.trackName, artist: item.artistName || '' });
            }
          }
        }
      } catch {}
    }
    // Fallback: scrape Apple Music HTML meta/JSON-LD
    if (rawTracks.length === 0) {
      try {
        const res = await fetch(raw, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(5000) });
        if (res.ok) {
          const html = await res.text();
          const tMatch = html.match(/<title>([^<]+)<\/title>/i);
          if (tMatch) playlistTitle = tMatch[1].replace(/\s*-\s*Apple Music.*/i, '').trim();
          const songMatches = [...html.matchAll(/"name":"([^"]{2,80})","url":"https:\/\/music\.apple\.com\/[^"]*\/song\//g)];
          for (const m of songMatches.slice(0, 25)) rawTracks.push({ title: m[1], artist: '' });
        }
      } catch {}
    }
  }
  // 3. Tidal / Monochrome URL
  else if (/tidal\.com|monochrome/i.test(raw)) {
    const tidalId = raw.match(/\/(?:playlist|album|track)\/([a-zA-Z0-9-]+)/)?.[1];
    if (tidalId) {
      for (const host of ['https://api.monochrome.tf', 'https://eu-central.monochrome.tf']) {
        try {
          const kind = raw.includes('/album/') ? 'album' : raw.includes('/track/') ? 'info' : 'playlist';
          const res = await fetch(`${host}/${kind}/?id=${encodeURIComponent(tidalId)}`, { signal: AbortSignal.timeout(4500) });
          if (res.ok) {
            const d = await res.json();
            const items = d?.data?.items || d?.items || (d?.data?.title ? [d.data] : []);
            playlistTitle = d?.data?.title || d?.title || 'Tidal Import';
            for (const it of items) {
              const tr = it.item || it;
              if (tr?.title) rawTracks.push({ title: tr.title, artist: tr.artist?.name || tr.artists?.[0]?.name || '' });
            }
            if (rawTracks.length > 0) break;
          }
        } catch {}
      }
    }
  }
  // 4. Plain Text / CSV lines ("Song - Artist" or "Song, Artist")
  else {
    playlistTitle = 'Imported Tracklist';
    for (const line of raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean).slice(0, 30)) {
      if (/^title\s*[-,]/i.test(line)) continue;
      const parts = line.split(/\s+-\s+|\t|,/);
      rawTracks.push({ title: parts[0].trim(), artist: (parts[1] || '').trim() });
    }
  }

  if (rawTracks.length === 0) {
    return { success: false, error: 'Could not extract tracks from that link or text. Try a public Spotify/Apple/Tidal link or paste "Song - Artist" lines.' };
  }

  // Match up to 20 tracks via YouTube Music InnerTube in parallel batches of 5
  const matched = [];
  const toResolve = rawTracks.slice(0, 20);
  for (let i = 0; i < toResolve.length; i += 5) {
    const batch = toResolve.slice(i, i + 5);
    const results = await Promise.all(batch.map(async t => {
      const q = `${t.title} ${t.artist}`.trim();
      const hits = await searchYTMusicTyped(q, 'songs').catch(() => []);
      return hits[0] || null;
    }));
    for (const h of results) if (h) matched.push(h);
  }

  return {
    success: matched.length > 0,
    playlistTitle,
    totalFound: rawTracks.length,
    matchedCount: matched.length,
    tracks: matched
  };
}
