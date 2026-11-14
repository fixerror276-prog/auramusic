import fs from 'node:fs';

const code = fs.readFileSync('C:/Users/pankaj/.gemini/antigravity/scratch/auramusic-rea/freefy_main.js', 'utf8');

// Mn is the container card: heading, message, children!
function findAround(str, len = 1500) {
  const p = code.indexOf(str);
  if (p === -1) return 'Not found';
  return code.slice(p, p + len);
}

console.log('--- Mn definition ---');
console.log(findAround('function Mn('));

console.log('--- rm definition (social buttons / divider) ---');
console.log(findAround('function rm('));
