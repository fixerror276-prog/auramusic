import fs from 'node:fs';

async function fetchMain() {
  const url = 'https://freefy.app/build/assets/main-tbZxH_YD.js';
  console.log('Fetching', url);
  const res = await fetch(url);
  const code = await res.text();
  console.log('Length:', code.length);
  fs.writeFileSync('C:/Users/pankaj/.gemini/antigravity/scratch/auramusic-rea/freefy_main.js', code);

  // Search for login form, register form, labels, inputs
  const loginMentions = code.match(/["'](\/api\/v1\/auth\/[^"']+|login|register|forgot-password)["']/gi) || [];
  console.log('Auth API / Route mentions:', [...new Set(loginMentions)]);
}

fetchMain();
