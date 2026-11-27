/**
 * innertube_next.mjs
 *
 * Calls YouTube Music's InnerTube /next endpoint directly (same as Mochy does)
 * to get the "Up Next" queue for any song — the real YouTube Music radio.
 *
 * Returns up to 20 songs with videoId, title, artist, duration, thumbnail.
 * Results are cached for 30 minutes.
 */

import { createRequire } from 'node:module';

// ── Constants (from Mochy's YouTubeClient.kt) ───────────────────────────────
const YTM_ORIGIN    = 'https://music.youtube.com';
const YTM_API_BASE  = `${YTM_ORIGIN}/youtubei/v1/`;
const CLIENT_NAME   = 'WEB_REMIX';
const CLIENT_VER    = '1.20260707.12.00';
const USER_AGENT    = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

// Simple in-process cache
const cache = new Map();  // key → { data, expiresAt }
const CACHE_TTL_MS = 30 * 60 * 1000;  // 30 min

function getCached(key) {
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.data;
  cache.delete(key);
  return null;
}
function setCached(key, data) {
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
  // Evict old entries when cache grows too large
  if (cache.size > 500) {
    const now = Date.now();
    for (const [k, v] of cache) {
      if (v.expiresAt <= now) cache.delete(k);
    }
  }
}

// ── Build the InnerTube context (same structure Mochy uses) ─────────────────
function makeContext(visitorData = '') {
  return {
    client: {
      clientName: CLIENT_NAME,
      clientVersion: CLIENT_VER,
      hl: 'en',
      gl: 'IN',
      ...(visitorData ? { visitorData } : {})
    }
  };
}

// ── POST to InnerTube ────────────────────────────────────────────────────────
async function innertubePost(endpoint, body, signal) {
  const url = `${YTM_API_BASE}${endpoint}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': USER_AGENT,
      'Origin': YTM_ORIGIN,
      'Referer': `${YTM_ORIGIN}/`,
      'X-YouTube-Client-Name': '67',
      'X-YouTube-Client-Version': CLIENT_VER,
      'X-Origin': YTM_ORIGIN,
    },
    body: JSON.stringify(body),
    signal
  });
  if (!res.ok) throw new Error(`InnerTube ${endpoint} → HTTP ${res.status}`);
  return res.json();
}

// ── Parse a PlaylistPanelVideoRenderer into a song object ───────────────────
function parseSong(renderer) {
  if (!renderer?.videoId) return null;

  const title = renderer.title?.runs?.[0]?.text;
  if (!title) return null;

  // Duration from lengthText e.g. "3:45"
  const durationStr = renderer.lengthText?.runs?.[0]?.text || '';
  let duration = 0;
  const parts = durationStr.split(':').map(Number);
  if (parts.length === 2) duration = parts[0] * 60 + parts[1];
  if (parts.length === 3) duration = parts[0] * 3600 + parts[1] * 60 + parts[2];

  // Artist from longBylineText or shortBylineText
  const bylineRuns = (renderer.longBylineText ?? renderer.shortBylineText)?.runs ?? [];
  const artist = bylineRuns
    .filter(r => r.text && r.text !== ' • ' && r.text !== ', ' && !/^\d+:\d+$/.test(r.text))
    .map(r => r.text.trim())
    .filter(Boolean)
    .join(', ') || 'Unknown Artist';

  // Best thumbnail
  const thumbs = renderer.thumbnail?.thumbnails ?? [];
  const thumbnail = thumbs.length > 0
    ? thumbs.sort((a, b) => (b.width || 0) - (a.width || 0))[0].url
    : `https://i.ytimg.com/vi/${renderer.videoId}/hqdefault.jpg`;

  return {
    videoId  : renderer.videoId,
    id       : 'yt_' + renderer.videoId,
    name     : title,
    title    : title,
    artist,
    duration,
    thumbnail,
    image    : thumbnail,
    // fields needed by our existing song shape
    album    : 'YouTube Music',
    url      : `/api/yt/stream?id=${renderer.videoId}&q=${encodeURIComponent(title)}`,
    source   : 'AuraMusic Queue',
    year     : new Date().getFullYear().toString(),
    genre    : 'Music',
    selected : renderer.selected ?? false,
  };
}

// ── Main: get next songs for a videoId ──────────────────────────────────────
/**
 * getNextQueue(videoId, playlistId?)
 *
 * Returns { songs: SongItem[], continuation: string|null }
 * Songs are the "Up Next" list YouTube Music gives for this video.
 */
export async function getNextQueue(videoId, playlistId = null, continuation = null) {
  const cacheKey = `next:${videoId}:${playlistId || ''}:${continuation || ''}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const body = {
      context: makeContext(),
      videoId,
      ...(playlistId ? { playlistId } : {}),
      ...(continuation ? { continuation } : {}),
      // These params tell YTM we want the music radio queue
      params: 'wAEB',
      enablePersistentPlaylistPanel: true,
      isAudioOnly: true,
      tunerSettingValue: 'AUTOMIX_SETTING_NORMAL',
    };

    const data = await innertubePost('next', body, controller.signal);

    // Parse the queue from the response
    let panelContents = null;

    // Try continuation first
    if (data.continuationContents?.playlistPanelContinuation?.contents) {
      panelContents = data.continuationContents.playlistPanelContinuation.contents;
    } else {
      // Normal response path
      const queueRenderer = data.contents
        ?.singleColumnMusicWatchNextResultsRenderer
        ?.tabbedRenderer
        ?.watchNextTabbedResultsRenderer
        ?.tabs?.[0]
        ?.tabRenderer
        ?.content
        ?.musicQueueRenderer
        ?.content
        ?.playlistPanelRenderer;

      panelContents = queueRenderer?.contents ?? null;
    }

    if (!panelContents) {
      // Fallback: try to find playlistPanelRenderer anywhere in the response
      const str = JSON.stringify(data);
      const match = str.match(/"videoId":"([A-Za-z0-9_-]{11})"/g);
      if (match && match.length > 1) {
        // Return minimal result with just videoIds found
        const songs = [...new Set(match.map(m => m.replace(/[^A-Za-z0-9_-]/g, '').replace('videoId', '')))]
          .filter(id => id !== videoId && id.length === 11)
          .slice(0, 10)
          .map(id => ({
            videoId: id, id: 'yt_' + id, name: 'Loading...', title: 'Loading...',
            artist: 'YouTube Music', duration: 0,
            thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
            image: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
            album: 'YouTube Music', url: `/api/yt/stream?id=${id}`,
            source: 'AuraMusic Queue', year: '', genre: 'Music'
          }));
        const result = { songs, continuation: null };
        if (songs.length > 0) setCached(cacheKey, result);
        return result;
      }
      return { songs: [], continuation: null };
    }

    const songs = panelContents
      .map(c => c.playlistPanelVideoRenderer)
      .filter(Boolean)
      .map(parseSong)
      .filter(Boolean);

    // Get continuation token for "load more"
    const nextContinuation = panelContents
      .find(c => c.playlistPanelVideoWrapperRenderer?.primaryRenderer?.automixPreviewVideoRenderer)
      ? null
      : (data.continuationContents?.playlistPanelContinuation?.continuations?.[0]?.nextContinuationData?.continuation ?? null);

    const result = { songs, continuation: nextContinuation };
    if (songs.length > 0) setCached(cacheKey, result);
    return result;

  } finally {
    clearTimeout(timeout);
  }
}

/**
 * getSearchSuggestionsYTM(query)
 * Real-time search suggestions from YouTube Music (same source Mochy uses).
 */
export async function getSearchSuggestionsYTM(query) {
  if (!query || query.length < 2) return [];
  const cacheKey = `suggest:${query.toLowerCase()}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const body = {
      context: makeContext(),
      input: query,
    };
    const data = await innertubePost('music/get_search_suggestions', body);
    const suggestions = [];

    for (const section of data.contents ?? []) {
      const contents = section.searchSuggestionsSectionRenderer?.contents ?? [];
      for (const item of contents) {
        // Text suggestion
        const textSug = item.searchSuggestionRenderer?.suggestion?.runs?.map(r => r.text).join('');
        if (textSug) suggestions.push({ type: 'query', text: textSug });

        // Song suggestion
        const songSug = item.musicResponsiveListItemRenderer;
        if (songSug) {
          const title = songSug.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text;
          const subtitle = songSug.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.map(r => r.text).join('');
          const videoId = songSug.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint?.videoId;
          const thumb = songSug.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails?.slice(-1)?.[0]?.url;
          if (title && videoId) {
            suggestions.push({ type: 'song', text: title, subtitle, videoId, thumbnail: thumb });
          }
        }
      }
    }

    setCached(cacheKey, suggestions);
    return suggestions;
  } catch {
    return [];
  }
}
