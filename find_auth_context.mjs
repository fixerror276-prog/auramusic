import fs from 'node:fs';

const js = fs.readFileSync('C:/Users/pankaj/.gemini/antigravity/scratch/auramusic-rea/original_bundle.js', 'utf8');

const p = js.indexOf('isAuthModalOpen:');
console.log('isAuthModalOpen context:');
console.log(js.slice(Math.max(0, p - 300), Math.min(js.length, p + 500)));
