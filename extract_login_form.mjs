import fs from 'node:fs';

const code = fs.readFileSync('C:/Users/pankaj/.gemini/antigravity/scratch/auramusic-rea/freefy_main.js', 'utf8');

// q4 is the login form component! Let's extract q4
function findAround(str, len = 2500) {
  const p = code.indexOf(str);
  if (p === -1) return 'Not found';
  return code.slice(p, p + len);
}

console.log('--- q4 definition (Login Form Component) ---');
console.log(findAround('function q4('));
