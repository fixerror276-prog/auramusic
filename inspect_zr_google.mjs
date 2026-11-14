import fs from 'node:fs';

const js = fs.readFileSync('C:/Users/pankaj/.gemini/antigravity/scratch/auramusic-rea/original_bundle.js', 'utf8');

// Find where fe is called (fe is open Google popup in Zr)
const p = js.indexOf('function Zr(');
console.log('Zr function start:', p);
console.log(js.slice(p, p + 1200));
