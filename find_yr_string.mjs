import fs from 'node:fs';

const js = fs.readFileSync('C:/Users/pankaj/.gemini/antigravity/scratch/auramusic-rea/original_bundle.js', 'utf8');

// Find Yr assignment before 551625
const p = js.lastIndexOf('Yr=', 551625);
console.log('Yr assignment at', p);
console.log(js.slice(p - 100, p + 200));
