const fs = require('fs');
const js = fs.readFileSync('C:/Users/pankaj/.gemini/antigravity/scratch/auramusic-rea/original_bundle.js', 'utf8');

// Find function gi()
const giPos = js.indexOf('function gi(');
console.log('--- function gi ---');
console.log(js.slice(Math.max(0, giPos - 50), Math.min(js.length, giPos + 350)));
