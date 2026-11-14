const fs = require('fs');
const js = fs.readFileSync('C:/Users/pankaj/.gemini/antigravity/scratch/auramusic-rea/original_bundle.js', 'utf8');

// Find all occurrences of "Aura Smart Radio" or "Live Synced Lyrics" or "Aesthetic Vibe Radar"
const radarPos = js.indexOf('Aesthetic Vibe Radar');
console.log('--- Context around Aesthetic Vibe Radar ---');
console.log(js.slice(Math.max(0, radarPos - 400), Math.min(js.length, radarPos + 600)));

// Let's find sidebar / header / footer
const sidebarPos = js.indexOf('ZERO ADS • UNLIMITED');
console.log('--- Context around ZERO ADS ---');
console.log(js.slice(Math.max(0, sidebarPos - 400), Math.min(js.length, sidebarPos + 600)));
