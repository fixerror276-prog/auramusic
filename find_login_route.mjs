import fs from 'node:fs';

const code = fs.readFileSync('C:/Users/pankaj/.gemini/antigravity/scratch/auramusic-rea/freefy_main.js', 'utf8');

// Search for login routes: path: "login" or path: "/login"
const pos = code.indexOf('"login"');
let p = 0;
while ((p = code.indexOf('login', p)) !== -1) {
  const slice = code.slice(Math.max(0, p - 60), Math.min(code.length, p + 120));
  if (slice.includes('path') || slice.includes('component') || slice.includes('lazy') || slice.includes('element')) {
    console.log('Match at', p, ':', slice);
  }
  p += 5;
}
