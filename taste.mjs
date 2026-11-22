/**
 * AuraMusic — Advanced User Taste Profile System v2
 *
 * Tracks every play/skip/like/dislike/replay/search with 4D context
 * (hour, dayOfWeek, isWeekend, timeSlot) and builds a rich per-user
 * "Taste DNA" that includes:
 *
 *   • 4D context matrix   – morning_weekday / night_weekend / …
 *   • Listen depth score  – 0-15s=implicit dislike, replay=obsession
 *   • Tag weight vectors  – mood, energy, language, genre
 *   • Time decay          – weights × 0.95 / day (taste stays fresh)
 *   • Emotional journey   – daily arc of play moments by hour
 *   • Taste DNA card      – persona, weekly pattern, volatility score
 *   • Gamification        – milestone badges, mood-shift detection
 *   • Nightly refresh     – call processDailyDecay() at ~2 AM IST
 */

// ─────────────────────────── constants ───────────────────────────

const MAX_SONGS    = 300;   // per user
const MAX_ARTISTS  = 80;
const MAX_EVENTS   = 500;   // raw event log (rolling)
const DECAY_RATE   = 0.95;  // per day

// Listen depth thresholds (seconds)
const DEPTH_OBSESSION    = -1;   // special: replay detected
const DEPTH_IMPLICIT_BAD =  15;  // <15 s = "didn't like it"
const DEPTH_SHALLOW      =  30;
const DEPTH_MEDIUM       =  60;
const DEPTH_DEEP         = 120;

// Variants to skip (unless the current track is one)
const VARIANT = /\b(cover|covered|remake|reprise|slowed|reverb|lofi|lo-fi|remix|mashup|unplugged|acoustic|8d|nightcore|sped\s*up|speed\s*up|karaoke|instrumental|tribute|piano|guitar|live)\b/i;
export const isVariantTitle = t => VARIANT.test(String(t || ''));

// Tag detectors ─ applied to song name + artist
const TAG_RULES = {
  mood: {
    romantic : /\b(love|pyar|pyaar|ishq|mohabbat|romantic|dil|saath|sanam|humsafar|tere|tera|meri|teri|tu|tum)\b/i,
    sad      : /\b(sad|dard|dukh|aansoo|rona|broken|lonely|hurt|pain|bekhayali|judaai|alvida|woh\s*din)\b/i,
    party    : /\b(party|dance|dj|club|boom|banging|dhoom|celebration|naach|naacho|josh)\b/i,
    chill    : /\b(chill|relax|lofi|lo.fi|slow|calm|peaceful|acoustic|coffee|late\s*night|slow)\b/i,
    hype     : /\b(hype|energy|power|beast|gym|workout|fire|lit|slay|boss|hustle|grind)\b/i,
    devotional:/\b(bhajan|aarti|mantra|ganesh|shiv|ram|krishna|waheguru|sufi|qawwali|devotional)\b/i,
  },
  energy: {
    high  : /\b(fast|upbeat|dance|party|hype|energetic|power|rock|metal|rap|hip.hop|dhol)\b/i,
    medium: /\b(pop|bollywood|punjabi|folk|sufi|filmi|indie)\b/i,
    low   : /\b(lofi|chill|acoustic|slow|sad|classical|ghazal|ambient|lullaby)\b/i,
  },
  language: {
    hindi   : /\b(tera|mera|dil|pyar|zindagi|hum|tum|hai|hain|ke|ka|ko|se|aaj|raat|saath)\b|[ऀ-ॿ]/u,
    punjabi : /\b(jatt|gabru|yaar|suit|kudi|munda|tu|te|ni|si|aayi|gidha|bhangra|sardari|pindan|jaan)\b/i,
    english : /\b(love|the|you|me|my|your|night|day|heart|soul|baby|girl|boy|gonna|feel)\b/i,
    hindi_film:/\b(bollywood|filmi|hindi film|hindi movie|ost|original\s*soundtrack)\b/i,
  },
  genre: {
    bollywood: /\b(bollywood|hindi film|filmi|yrf|t.series|dharma|zee music)\b/i,
    punjabi  : /\b(punjabi|bhangra|jatt|gidha|pollywood|desi beats)\b/i,
    lofi     : /\b(lofi|lo.fi|chill beats|study music|slow jamz|café)\b/i,
    sufi     : /\b(sufi|qawwali|ghazal|kafi|doha|dargah|rooh)\b/i,
    hiphop   : /\b(rap|hip.hop|desi hip.hop|trap|drill|bars|flow|freestyle)\b/i,
    indie    : /\b(indie|independent|original|prateek kuhad|anuv jain|ritviz|when chai met toast)\b/i,
    retro    : /\b(retro|classic|old is gold|kishore|rafi|lata|evergreen|golden era)\b/i,
    devotional:/\b(bhajan|aarti|mantra|ganesh|shiv|ram|krishna|waheguru|sufi|qawwali|devotional)\b/i,
  }
};

// ─────────────────────────── helpers ─────────────────────────────

const cleanId = id => String(id || '').replace(/^yt_|^yt-/, '').trim();

/** Returns the 4D context for a given timestamp (ms). */
export function getContext(tsMs = Date.now()) {
  const d = new Date(tsMs);
  const hour       = d.getHours();
  const dayOfWeek  = d.getDay();              // 0=Sun … 6=Sat
  const isWeekend  = dayOfWeek === 0 || dayOfWeek === 6;
  const timeSlot   = hour >= 5  && hour < 12 ? 'morning'
                   : hour >= 12 && hour < 17 ? 'afternoon'
                   : hour >= 17 && hour < 21 ? 'evening'
                   : hour >= 21 && hour < 24 ? 'night'
                   : 'late_night';            // 0-4
  const contextKey = `${timeSlot}_${isWeekend ? 'weekend' : 'weekday'}`;
  return { hour, dayOfWeek, isWeekend, timeSlot, contextKey };
}

/** Scores how deep the user listened (0-15 = dislike, replay = obsession). */
function listenDepthScore(listenedSec, totalSec, isReplay) {
  if (isReplay) return 8;                                // obsession bonus
  if (!listenedSec || listenedSec <= 0) return 0;
  if (listenedSec < DEPTH_IMPLICIT_BAD) return -3;      // implicit dislike
  const ratio = totalSec > 0 ? listenedSec / totalSec : 0;
  if (listenedSec >= DEPTH_DEEP && ratio >= 0.8) return 5;   // deep listen + > 80%
  if (listenedSec >= DEPTH_MEDIUM)               return 3;
  if (listenedSec >= DEPTH_SHALLOW)              return 1;
  return 0;
}

/** Detect which tags apply to a song. Returns {mood:[], energy:[], language:[], genre:[]}. */
function detectTags(name, artist) {
  const haystack = `${name} ${artist}`;
  const tags = {};
  for (const [category, rules] of Object.entries(TAG_RULES)) {
    tags[category] = Object.entries(rules)
      .filter(([, re]) => re.test(haystack))
      .map(([tag]) => tag);
  }
  return tags;
}

/** Add `delta` to a tag-weight map (creates keys if missing). */
function bumpTags(map, tags, delta) {
  for (const [cat, list] of Object.entries(tags)) {
    if (!map[cat]) map[cat] = {};
    for (const tag of list) {
      map[cat][tag] = (map[cat][tag] || 0) + delta;
    }
  }
}

/** Returns or creates the user's taste bucket in db. */
function bucket(db, userId) {
  if (!db.taste) db.taste = {};
  if (!db.taste[userId]) {
    db.taste[userId] = {
      songs   : {},        // videoId → SongProfile
      artists : {},        // artistKey → ArtistProfile
      contexts: {},        // contextKey → ContextProfile
      tagWeights: {},      // { mood:{}, energy:{}, language:{}, genre:{} }
      events  : [],        // rolling raw events (last MAX_EVENTS)
      journey : {},        // date → { hour → score } emotional arc
      milestones: [],      // earned badge ids
      consecutiveSkips: 0,
      lastDecayAt: 0,
      volatilityHistory: [],  // last 30 days of top-tag changes
      version: 2
    };
  }
  // upgrade v1 → v2
  const t = db.taste[userId];
  if (!t.contexts)         t.contexts = {};
  if (!t.tagWeights)       t.tagWeights = {};
  if (!t.events)           t.events = [];
  if (!t.journey)          t.journey = {};
  if (!t.milestones)       t.milestones = [];
  if (t.consecutiveSkips === undefined) t.consecutiveSkips = 0;
  if (!t.volatilityHistory) t.volatilityHistory = [];
  t.version = 2;
  return t;
}

// ─────────────────────────── event recording ─────────────────────

/**
 * Record one user action.
 *
 * body = {
 *   userId      : string,
 *   type        : 'play'|'skip'|'like'|'dislike'|'replay'|'search',
 *   song        : { videoId, name, artist, duration },
 *   listenedSec : number,   // seconds actually heard (for play/skip)
 *   query       : string,   // for 'search' events
 *   tsMs        : number,   // override timestamp (optional)
 * }
 *
 * Returns true when something was recorded.
 */
export function recordTaste(db, body) {
  const userId   = String(body?.userId || '').slice(0, 80);
  const type     = String(body?.type   || '');
  if (!userId || userId === 'guest') return false;
  if (!['play','skip','like','dislike','replay','search'].includes(type)) return false;

  const song      = body?.song || {};
  const videoId   = cleanId(song.videoId || song.id || '');
  const tsMs      = Number(body?.tsMs) || Date.now();
  const ctx       = getContext(tsMs);

  // — search events only update a search counter, no song required —
  if (type === 'search') {
    const t = bucket(db, userId);
    t.events.push({ type, q: String(body?.query || '').slice(0, 100), tsMs, ctx: ctx.contextKey });
    if (t.events.length > MAX_EVENTS) t.events = t.events.slice(-MAX_EVENTS);
    return true;
  }

  if (videoId.length !== 11) return false;  // non-YT songs ignored for now

  const name    = String(song.name   || '').slice(0, 200);
  const artist  = String(song.artist || '').slice(0, 120);
  const totalSec = Number(song.duration) || 200;
  const listenedSec = Number(body?.listenedSec) || 0;
  const isReplay = type === 'replay';
  const tags     = detectTags(name, artist);

  const t = bucket(db, userId);

  // ── 1. SongProfile ──────────────────────────────────────────────
  const s = t.songs[videoId] || (t.songs[videoId] = {
    name, artist, plays: 0, skips: 0, likes: 0, dislikes: 0, replays: 0,
    totalListenedSec: 0, depthScore: 0, last: 0, tags
  });
  s.name   = name   || s.name;
  s.artist = artist || s.artist;
  s.tags   = tags;
  s.last   = tsMs;

  const depth = listenDepthScore(listenedSec, totalSec, isReplay);

  if (type === 'play')    { s.plays++;    s.totalListenedSec += listenedSec; s.depthScore += depth; }
  if (type === 'skip')    { s.skips++;    s.totalListenedSec += listenedSec; s.depthScore += depth; }
  if (type === 'like')    { s.likes++;    s.depthScore += 4; }
  if (type === 'dislike') { s.dislikes++; s.depthScore -= 3; }
  if (type === 'replay')  { s.replays++;  s.depthScore += 8; }

  // ── 2. ArtistProfile ────────────────────────────────────────────
  const artistKey = artist.toLowerCase().trim();
  if (artistKey && artistKey !== 'unknown artist') {
    const a = t.artists[artistKey] || (t.artists[artistKey] = { name: artist, score: 0, plays: 0, skips: 0, likes: 0 });
    a.name = artist;
    if (type === 'play'   || type === 'replay') { a.plays++; a.score += 1 + depth * 0.5; }
    if (type === 'skip')    { a.skips++; a.score -= 0.5; }
    if (type === 'like')    { a.likes++; a.score += 3; }
    if (type === 'dislike') { a.score  -= 2; }
  }

  // ── 3. ContextProfile (4D matrix) ───────────────────────────────
  const ck = ctx.contextKey;
  const cx = t.contexts[ck] || (t.contexts[ck] = { plays: 0, skips: 0, likes: 0, tagWeights: {}, totalScore: 0 });
  if (type === 'play' || type === 'replay') { cx.plays++; bumpTags(cx.tagWeights, tags, 1 + depth * 0.3); cx.totalScore += 1 + depth * 0.3; }
  if (type === 'skip')    { cx.skips++; bumpTags(cx.tagWeights, tags, -0.5); }
  if (type === 'like')    { cx.likes++; bumpTags(cx.tagWeights, tags, 3); cx.totalScore += 3; }
  if (type === 'dislike') { bumpTags(cx.tagWeights, tags, -2); }

  // ── 4. Global tag weights ────────────────────────────────────────
  const globalDelta =
    type === 'play'    ? 1 + depth * 0.3
    : type === 'replay'  ? 2
    : type === 'like'    ? 3
    : type === 'dislike' ? -2
    : type === 'skip' && listenedSec < DEPTH_IMPLICIT_BAD ? -1
    : 0;
  if (globalDelta !== 0) bumpTags(t.tagWeights, tags, globalDelta);

  // ── 5. Emotional journey (daily arc) ────────────────────────────
  const dateKey = new Date(tsMs).toISOString().slice(0, 10); // YYYY-MM-DD
  if (!t.journey[dateKey]) t.journey[dateKey] = {};
  const hr = String(ctx.hour);
  t.journey[dateKey][hr] = (t.journey[dateKey][hr] || 0) + (globalDelta > 0 ? globalDelta : 0);
  // keep only last 30 days
  const journeyDays = Object.keys(t.journey).sort();
  if (journeyDays.length > 30) delete t.journey[journeyDays[0]];

  // ── 6. Raw event log ────────────────────────────────────────────
  t.events.push({ type, videoId, ctx: ctx.contextKey, hour: ctx.hour, tsMs, depth });
  if (t.events.length > MAX_EVENTS) t.events = t.events.slice(-MAX_EVENTS);

  // ── 7. Consecutive-skip mood-shift detection ────────────────────
  if (type === 'skip') {
    t.consecutiveSkips = (t.consecutiveSkips || 0) + 1;
    if (t.consecutiveSkips >= 3) {
      // signal: user mood shifted — caller should call buildDNA() to refresh
      t._moodShift = true;
      t.consecutiveSkips = 0;
    }
  } else if (type === 'play' || type === 'like' || type === 'replay') {
    t.consecutiveSkips = 0;
    t._moodShift = false;
  }

  // ── 8. Keep profiles small ──────────────────────────────────────
  const sIds = Object.keys(t.songs);
  if (sIds.length > MAX_SONGS) {
    sIds.sort((x, y) => t.songs[x].last - t.songs[y].last)
        .slice(0, sIds.length - MAX_SONGS)
        .forEach(id => delete t.songs[id]);
  }
  const aKeys = Object.keys(t.artists);
  if (aKeys.length > MAX_ARTISTS) {
    aKeys.sort((x, y) => t.artists[x].score - t.artists[y].score)
         .slice(0, aKeys.length - MAX_ARTISTS)
         .forEach(k => delete t.artists[k]);
  }

  return true;
}

// ─────────────────────────── time decay ──────────────────────────

/**
 * Apply daily decay (× 0.95) to all weights for a user.
 * Call once per day (nightly job). Pass daysSinceLast if > 1 day elapsed.
 */
export function applyDecay(tasteProfile, daysSinceLast = 1) {
  const factor = Math.pow(DECAY_RATE, daysSinceLast);

  // song depthScores
  for (const s of Object.values(tasteProfile.songs || {})) {
    s.depthScore = (s.depthScore || 0) * factor;
  }
  // artist scores
  for (const a of Object.values(tasteProfile.artists || {})) {
    a.score = (a.score || 0) * factor;
  }
  // global tag weights
  const tw = tasteProfile.tagWeights || {};
  for (const cat of Object.values(tw)) {
    for (const tag of Object.keys(cat)) {
      cat[tag] = (cat[tag] || 0) * factor;
    }
  }
  // context tag weights
  for (const cx of Object.values(tasteProfile.contexts || {})) {
    for (const cat of Object.values(cx.tagWeights || {})) {
      for (const tag of Object.keys(cat)) cat[tag] = (cat[tag] || 0) * factor;
    }
  }
  tasteProfile.lastDecayAt = Date.now();
}

// ─────────────────────────── DNA card ────────────────────────────

/** Sort a tag-weight category map; returns [[tag, weight], …] descending. */
function sortedTags(map, cat) {
  return Object.entries((map && map[cat]) || {})
    .filter(([, w]) => w > 0)
    .sort((a, b) => b[1] - a[1]);
}

/** Which context keys have the most play activity? */
function topContexts(tasteProfile) {
  return Object.entries(tasteProfile.contexts || {})
    .map(([k, c]) => ({ key: k, score: (c.plays || 0) * 1.5 + (c.likes || 0) * 3 - (c.skips || 0) * 0.5 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

/** Assign a Taste Persona based on the profile. */
function assignPersona(tasteProfile) {
  const tw = tasteProfile.tagWeights || {};

  const moodTop = sortedTags(tw, 'mood');
  const topMood = moodTop[0]?.[0];

  const energyTop = sortedTags(tw, 'energy');
  const topEnergy = energyTop[0]?.[0];

  const contexts = topContexts(tasteProfile);
  const topCtx   = contexts[0]?.key || '';

  const genreTop  = sortedTags(tw, 'genre');
  const topGenre  = genreTop[0]?.[0];

  // Late-night listener?
  const lateEvents = (tasteProfile.events || []).filter(e => e.hour >= 22 || e.hour < 4).length;
  const totalEvents = (tasteProfile.events || []).length || 1;

  if (lateEvents / totalEvents > 0.4) return 'Night Owl 🦉';
  if (topMood === 'romantic')         return 'The Feeling Chaser 💕';
  if (topMood === 'sad')              return 'The Broken Poet 🥀';
  if (topMood === 'hype' || topEnergy === 'high') return 'Energy Bomb ⚡';
  if (topGenre === 'retro')           return 'Old Soul 🎷';
  if (topGenre === 'sufi')            return 'Soul Seeker 🌙';
  if (topGenre === 'lofi')            return 'Chill Wave 🌊';
  if (topMood === 'devotional')       return 'The Devotee 🙏';
  if (topGenre === 'hiphop')          return 'Street Poet 🎤';
  if (topMood === 'party')            return 'Party Animal 🎉';

  // diversity = how many genres/moods with significant weight
  const moods  = moodTop.filter(([, w]) => w > 2).length;
  const genres = genreTop.filter(([, w]) => w > 2).length;
  if (moods + genres >= 5) return 'Explorer 🗺️';

  return 'The Wanderer 🌟';
}

/** Weekly pattern prediction. */
function weeklyPattern(tasteProfile) {
  const events = tasteProfile.events || [];
  const byDay  = Array.from({ length: 7 }, () => ({ score: 0, count: 0 }));
  for (const e of events) {
    const dow = new Date(e.tsMs || 0).getDay(); // 0=Sun
    if (dow >= 0 && dow < 7) {
      byDay[dow].score += e.depth > 0 ? e.depth : 0.5;
      byDay[dow].count++;
    }
  }
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const peaks = byDay
    .map((d, i) => ({ day: days[i], score: d.count > 0 ? d.score / d.count : 0 }))
    .sort((a, b) => b.score - a.score);

  const topDay    = peaks[0];
  const bottomDay = peaks[peaks.length - 1];

  // Named patterns
  let prediction = '';
  if (topDay.day === 'Monday')   prediction = 'Monday Blues Buster 🎧';
  else if (topDay.day === 'Friday' || topDay.day === 'Saturday') prediction = 'Weekend Vibe King 🎉';
  else if (topDay.day === 'Sunday') prediction = 'Sunday Soul Mode ☀️';
  else prediction = `${topDay.day} Listener 🎵`;

  return { topDay: topDay.day, lowDay: bottomDay.day, prediction, dayScores: peaks };
}

/** Taste Volatility — how much does the top tag change day-to-day? */
function volatilityScore(tasteProfile) {
  const history = tasteProfile.volatilityHistory || [];
  if (history.length < 3) return { label: 'STABLE_LOYALIST', score: 0 };

  // Count how many days the top-mood changed
  let changes = 0;
  for (let i = 1; i < history.length; i++) {
    if (history[i] !== history[i - 1]) changes++;
  }
  const ratio = changes / (history.length - 1);

  if (ratio < 0.2) return { label: 'STABLE_LOYALIST',   score: Math.round(ratio * 100) };
  if (ratio < 0.5) return { label: 'FLEXIBLE_LISTENER', score: Math.round(ratio * 100) };
  return               { label: 'MOOD_EXPLORER',       score: Math.round(ratio * 100) };
}

/** Milestones — returns newly earned milestone IDs. */
const MILESTONE_DEFS = [
  { id: 'dil_ka_raja',   emoji: '💕', label: 'Dil Ka Raja',   desc: '50 romantic songs',  check: p => (p.tagWeights?.mood?.romantic || 0) >= 50 },
  { id: 'night_owl',     emoji: '🦉', label: 'Night Owl',      desc: '100 late-night plays',check: p => p.events?.filter(e => e.hour >= 22 || e.hour < 4).length >= 100 },
  { id: 'energy_bomb',   emoji: '⚡', label: 'Energy Bomb',    desc: '30 high-energy songs',check: p => (p.tagWeights?.energy?.high || 0) >= 30 },
  { id: 'old_soul',      emoji: '🎷', label: 'Old Soul',       desc: '20 retro songs',      check: p => (p.tagWeights?.genre?.retro || 0) >= 20 },
  { id: 'party_animal',  emoji: '🎉', label: 'Party Animal',   desc: '30 party songs',      check: p => (p.tagWeights?.mood?.party || 0) >= 30 },
  { id: 'loyal_fan',     emoji: '🌟', label: 'Loyal Fan',      desc: '10 replays',          check: p => Object.values(p.songs||{}).reduce((s,x)=>s+(x.replays||0),0)>=10 },
  { id: 'explorer',      emoji: '🗺️', label: 'Explorer',       desc: '5+ genres explored',  check: p => Object.values(p.tagWeights?.genre||{}).filter(w=>w>=3).length>=5 },
  { id: 'sufi_soul',     emoji: '🌙', label: 'Sufi Soul',      desc: '20 sufi/ghazal songs',check: p => (p.tagWeights?.genre?.sufi || 0) >= 20 },
  { id: 'sad_boi',       emoji: '🥀', label: 'Sad Boi Hours',  desc: '30 sad songs',        check: p => (p.tagWeights?.mood?.sad || 0) >= 30 },
  { id: 'devotee',       emoji: '🙏', label: 'The Devotee',    desc: '15 devotional songs', check: p => (p.tagWeights?.mood?.devotional || 0) >= 15 },
];

function checkMilestones(tasteProfile) {
  const earned = new Set(tasteProfile.milestones || []);
  const newOnes = [];
  for (const m of MILESTONE_DEFS) {
    if (!earned.has(m.id) && m.check(tasteProfile)) {
      earned.add(m.id);
      newOnes.push(m.id);
    }
  }
  tasteProfile.milestones = [...earned];
  return newOnes;
}

/**
 * Build (or refresh) the full Taste DNA Card for a user.
 * Returns the card object and writes it into tasteProfile.dnaCard.
 */
export function buildDNA(db, userId) {
  const t = db.taste && db.taste[userId];
  if (!t) return null;

  const tw = t.tagWeights || {};

  const topMoods    = sortedTags(tw, 'mood').slice(0, 3);
  const topEnergies = sortedTags(tw, 'energy').slice(0, 2);
  const topLanguages= sortedTags(tw, 'language').slice(0, 3);
  const topGenres   = sortedTags(tw, 'genre').slice(0, 4);

  const topArtists  = Object.entries(t.artists || {})
    .filter(([, a]) => a.score > 0)
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, 5)
    .map(([, a]) => ({ name: a.name, score: Math.round(a.score) }));

  const topSongs    = Object.entries(t.songs || {})
    .filter(([, s]) => s.depthScore > 0)
    .sort((a, b) => b[1].depthScore - a[1].depthScore)
    .slice(0, 5)
    .map(([vid, s]) => ({ videoId: vid, name: s.name, artist: s.artist, depthScore: Math.round(s.depthScore) }));

  const obsessions  = Object.entries(t.songs || {})
    .filter(([, s]) => s.replays >= 2)
    .sort((a, b) => b[1].replays - a[1].replays)
    .slice(0, 3)
    .map(([vid, s]) => ({ videoId: vid, name: s.name, replays: s.replays }));

  const ctxs        = topContexts(t);
  const persona     = assignPersona(t);
  const weekly      = weeklyPattern(t);
  const volatility  = volatilityScore(t);
  const newMilestones = checkMilestones(t);

  // Peak engagement hours (listen% > 80% from journey)
  const peakHours = [];
  for (const [, arc] of Object.entries(t.journey || {})) {
    for (const [hr, score] of Object.entries(arc)) {
      if (score > 3) peakHours.push(Number(hr));
    }
  }
  const peakHourCounts = {};
  for (const h of peakHours) peakHourCounts[h] = (peakHourCounts[h] || 0) + 1;
  const topPeakHour = Object.entries(peakHourCounts).sort((a,b)=>b[1]-a[1])[0];

  // Update volatility history
  const todayTopMood = topMoods[0]?.[0] || 'unknown';
  t.volatilityHistory.push(todayTopMood);
  if (t.volatilityHistory.length > 30) t.volatilityHistory = t.volatilityHistory.slice(-30);

  const dnaCard = {
    userId,
    generatedAt : new Date().toISOString(),
    persona,
    topMoods,
    topEnergies,
    topLanguages,
    topGenres,
    topArtists,
    topSongs,
    obsessions,
    contexts    : ctxs,
    weeklyPattern: weekly,
    volatility,
    milestones  : MILESTONE_DEFS.filter(m => t.milestones.includes(m.id))
                    .map(m => ({ id: m.id, emoji: m.emoji, label: m.label, desc: m.desc })),
    newMilestones,
    peakHour    : topPeakHour ? { hour: Number(topPeakHour[0]), days: topPeakHour[1] } : null,
    moodShift   : Boolean(t._moodShift),
    totalEvents : (t.events || []).length,
    totalSongs  : Object.keys(t.songs || {}).length,
  };

  t.dnaCard = dnaCard;
  return dnaCard;
}

// ─────────────────────────── nightly job ─────────────────────────

/**
 * Process daily decay and rebuild DNA cards for all users.
 * Call at ~2 AM IST (8:30 PM UTC previous day) or via setInterval.
 * Returns { processed, skipped } counts.
 */
export function processDailyDecay(db) {
  const now = Date.now();
  let processed = 0, skipped = 0;

  if (!db.taste) return { processed, skipped };

  for (const [userId, profile] of Object.entries(db.taste)) {
    // Days since last decay
    const lastDecay = profile.lastDecayAt || 0;
    const daysSince = Math.max(1, Math.floor((now - lastDecay) / 86400000));

    // Skip if profile is empty or stale > 60 days
    const hasActivity = Object.keys(profile.songs || {}).length > 0 ||
                        (profile.events || []).length > 0;
    if (!hasActivity) { skipped++; continue; }

    applyDecay(profile, daysSince);
    buildDNA(db, userId);
    processed++;
  }

  return { processed, skipped };
}

// ─────────────────────────── for-you seeds ───────────────────────

function tasteSeeds(db, userId) {
  const seeds = new Map(); // videoId → weight
  const add   = (id, weight) => {
    id = cleanId(id);
    if (id.length === 11 && weight > 0) seeds.set(id, (seeds.get(id) || 0) + weight);
  };

  // liked songs
  for (const [i, s] of ((db.likes && db.likes[userId]) || []).slice(0, 8).entries()) {
    add(s.videoId || s.id, 4 - i * 0.25);
  }

  const profile = db.taste && db.taste[userId];
  if (profile) {
    const now = Date.now();
    for (const [id, s] of Object.entries(profile.songs)) {
      const days    = (now - s.last) / 86400000;
      const recency = days < 2 ? 1.5 : days < 14 ? 1 : 0.5;
      add(id, ((s.plays || 0) + 3 * (s.likes || 0) + 5 * (s.replays || 0)
               - 2 * (s.skips || 0) - 3 * (s.dislikes || 0)) * recency
              + (s.depthScore || 0) * 0.2);
    }
  }
  return seeds;
}

/**
 * Songs this user is likely to enjoy, or [] when there is nothing to go on yet.
 * getRelated(client, videoId) → [{ videoId, title, artist, duration, image }]
 */
export async function forYou(db, userId, client, getRelated, toSong) {
  if (!userId || userId === 'guest') return [];
  const seeds = [...tasteSeeds(db, userId).entries()].sort((a, b) => b[1] - a[1]);
  if (!seeds.length) return [];

  const pool   = seeds.slice(0, 8);
  const picked = [];
  while (picked.length < 4 && pool.length) {
    picked.push(pool.splice(Math.floor(Math.random() * Math.min(pool.length, 5)), 1)[0]);
  }

  const lists = await Promise.all(
    picked.map(([id]) => Promise.resolve(getRelated(client, id)).catch(() => []))
  );

  const profile = db.taste && db.taste[userId];
  const skipped = new Set(
    Object.entries(profile?.songs || {})
      .filter(([, s]) => (s.skips + (s.dislikes || 0)) >= 2 && s.plays <= s.skips)
      .map(([id]) => id)
  );
  const seedIds = new Set(picked.map(([id]) => id));

  const scored = new Map();
  lists.forEach((list, i) => {
    (list || []).forEach((v, rank) => {
      if (!v?.videoId || seedIds.has(v.videoId) || skipped.has(v.videoId) || !v.title) return;
      const dur = Number(v.duration) || 0;
      if (dur && (dur < 60 || dur > 600)) return;
      if (isVariantTitle(v.title)) return;
      const entry = scored.get(v.videoId) || { v, score: 0 };
      entry.score += picked[i][1] * (1 - rank / ((list.length || 1) + 1));
      scored.set(v.videoId, entry);
    });
  });

  return [...scored.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 20)
    .map(x => toSong(x.v));
}

// Same shape as a search result.
export function toSong(v) {
  return {
    id      : 'yt_' + v.videoId,
    videoId : v.videoId,
    name    : v.title,
    artist  : v.artist  || 'Unknown Artist',
    album   : 'YouTube Music Single',
    duration: Number(v.duration) || 200,
    image   : v.image || `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
    url     : `/api/yt/stream?id=${v.videoId}&q=${encodeURIComponent(v.title || '')}`,
    genre   : 'Music',
    year    : new Date().getFullYear().toString(),
    source  : 'AuraMusic For You'
  };
}
