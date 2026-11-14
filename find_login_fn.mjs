import fs from 'node:fs';

const js = fs.readFileSync('C:/Users/pankaj/.gemini/antigravity/scratch/auramusic-rea/original_bundle.js', 'utf8');

const p = js.indexOf('async function x({provider:e');
console.log('Context around login function:');
console.log(js.slice(p, p + 800));
