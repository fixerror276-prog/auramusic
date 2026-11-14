import fs from 'node:fs';

const code = fs.readFileSync('C:/Users/pankaj/.gemini/antigravity/scratch/auramusic-rea/freefy_main.js', 'utf8');

// ru is Login component, tu is Register component, L4 is ForgotPassword
function findAround(str, len = 2000) {
  const p = code.indexOf(str);
  if (p === -1) return 'Not found';
  return code.slice(Math.max(0, p - 200), p + len);
}

console.log('--- ru definition (Login Component) ---');
console.log(findAround('function ru('));

console.log('--- tu definition (Register Component) ---');
console.log(findAround('function tu('));
