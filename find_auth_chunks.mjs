import fs from 'node:fs';

const code = fs.readFileSync('C:/Users/pankaj/.gemini/antigravity/scratch/auramusic-rea/freefy_main.js', 'utf8');

// Search for dynamic imports: import("./auth-...") or chunk references
const chunks = [...code.matchAll(/import\((["'][^"']+["'])\)/g)].map(m => m[1]);
console.log('Dynamic import chunks:');
console.log([...new Set(chunks)]);

// Also check all asset urls
const assets = [...code.matchAll(/\/build\/assets\/[^"']+\.js/g)].map(m => m[0]);
console.log('Assets list:', [...new Set(assets)]);
