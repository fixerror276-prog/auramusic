import fs from 'node:fs';

const js = fs.readFileSync('C:/Users/pankaj/.gemini/antigravity/scratch/auramusic-rea/original_bundle.js', 'utf8');

const p = js.indexOf('function Zr(');
console.log('Zr length context:');
console.log(js.slice(p, p + 2500));
