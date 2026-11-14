import fs from 'node:fs';

const js = fs.readFileSync('C:/Users/pankaj/.gemini/antigravity/scratch/auramusic-rea/original_bundle.js', 'utf8');

// Find Google account picker modal component
// Look for "accounts.google.com/o/oauth2" or "Choose an account"
const p = js.indexOf('accounts.google.com/o/oauth2');
console.log('Context of Google picker:');
console.log(js.slice(Math.max(0, p - 400), Math.min(js.length, p + 1200)));
