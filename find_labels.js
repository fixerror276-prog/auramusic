const fs = require('fs');
const js = fs.readFileSync('C:/Users/pankaj/.gemini/antigravity/scratch/auramusic-rea/original_bundle.js', 'utf8');

// Find navigation buttons or views in the app
// Let's search for SVG icons or bottom nav items or sidebar nav items
// Look for strings like "Home", "Explore", "Search", "Library", "Admin", etc.
const labels = js.match(/children:(`[^`]+`|"[^"]+")/g) || [];
const uniqueLabels = [...new Set(labels.map(l => l.replace(/^children:/, '').replace(/[`"]/g, '')))]
  .filter(l => l.length > 1 && l.length < 35 && !l.startsWith('http') && !l.includes('{') && !l.includes('('));

console.log('Unique children labels count:', uniqueLabels.length);
console.log('Sample labels:', uniqueLabels.slice(0, 100));
