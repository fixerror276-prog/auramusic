const fs = require('fs');
const js = fs.readFileSync('C:/Users/pankaj/.gemini/antigravity/scratch/auramusic-rea/original_bundle.js', 'utf8');

// Find gi definition in the component context around 728000
const sub = js.slice(725000, 729000);
// Search for gi = or function gi
const matches = sub.match(/function [a-zA-Z0-9_$]+\([^)]*\)\{[^}]*admin[^}]*\}/g);
console.log('Admin check functions:', matches);

// Also let's check di (the 404 component)
const diPos = js.indexOf('drifted into outer space');
console.log('404 component:', js.slice(Math.max(0, diPos - 200), Math.min(js.length, diPos + 600)));
