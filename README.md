# auramusic: REA

A faithful, zero-dependency clone of the AuraMusic web application ([https://auramusic-2026.netlify.app/](https://auramusic-2026.netlify.app/)).

## Project Specifications

- **Folder**: `auramusic-rea` (`C:\Users\pankaj\.gemini\antigravity\scratch\auramusic-rea`)
- **Port**: `4550`
- **Branding / Name**: `auramusic: REA` (applied to page title, PWA manifest, and footer credit)
- **Stack**: Plain ES modules (`server.mjs`), zero external npm dependencies, using exclusively Node.js built-in modules (`node:http`, `node:fs`, `node:path`, `node:url`).

## Architecture & Features Cloned

1. **App Structure**:
   - Modern dark UI built with Tailwind CSS, Plus Jakarta Sans font, and custom glassmorphism.
   - PWA support with local manifest and service worker (`sw.js`).
   - All artist images (`/artists/*.jpg`), avatars (`/avatars/*.jpg`), icons, and logos stored locally.

2. **Views & Routing**:
   - **Home**: Aesthetic Vibe Radar, Trending 50, Mood mixes, Popular Artists, Top charts, Player bar.
   - **Search**: Instant live search for artists, songs, and albums.
   - **Artist Profile**: Discography, top hits, and monthly listeners.
   - **Your Library & Liked Songs**: Custom user playlists, liked tracks management.
   - **Super Admin Console**: Accessible via `/admin` or `/adminpanel`, displaying system metrics, user lists, announcements, and cache management.
   - **404 View**: Custom error page ("Looks Like This Melody Got Skipped!") with navigation fallback.

3. **Backend Server (`server.mjs`)**:
   - Zero-dependency HTTP server with SPA fallback routing.
   - Built-in In-Memory DB for playlists, likes, users, and admin announcements.
   - Fallback proxy for live audio stream metadata and synchronized lyrics.

## How to Run

```bash
cd auramusic-rea
node server.mjs
```

Then navigate in your browser to:
[http://localhost:4550](http://localhost:4550)
