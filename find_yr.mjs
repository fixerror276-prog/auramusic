import fs from 'node:fs';

const js = fs.readFileSync('C:/Users/pankaj/.gemini/antigravity/scratch/auramusic-rea/original_bundle.js', 'utf8');

// Find Yr definition
const yrPos = js.indexOf('Yr=');
console.log('Yr definition:');
console.log(js.slice(Math.max(0, yrPos - 100), yrPos + 300));
