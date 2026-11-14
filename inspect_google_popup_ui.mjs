import fs from 'node:fs';

const js = fs.readFileSync('C:/Users/pankaj/.gemini/antigravity/scratch/auramusic-rea/original_bundle.js', 'utf8');

// Find Google account popup JSX inside Zr
const p = js.indexOf('r===`google-popup`');
console.log('google-popup branch:');
console.log(js.slice(p, p + 3000));
