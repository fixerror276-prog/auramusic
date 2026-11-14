import fs from 'node:fs';

const code = fs.readFileSync('C:/Users/pankaj/.gemini/antigravity/scratch/auramusic-rea/freefy_main.js', 'utf8');

// Find F4 (login mutation) and r4 (register mutation)
function findAround(str, len = 1000) {
  const p = code.indexOf(str);
  if (p === -1) return 'Not found';
  return code.slice(p, p + len);
}

console.log('--- F4 definition ---');
console.log(findAround('function F4('));

console.log('--- r4 definition ---');
console.log(findAround('function r4('));
