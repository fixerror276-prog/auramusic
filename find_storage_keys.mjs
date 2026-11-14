import fs from 'node:fs';

const js = fs.readFileSync('C:/Users/pankaj/.gemini/antigravity/scratch/auramusic-rea/original_bundle.js', 'utf8');

// Find localStorage keys used in auth
const storageMatches = js.match(/localStorage\.(getItem|setItem)\([^)]+\)/g);
console.log('localStorage calls:');
console.log([...new Set(storageMatches)]);
