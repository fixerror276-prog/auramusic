import fs from 'node:fs';

const js = fs.readFileSync('C:/Users/pankaj/.gemini/antigravity/scratch/auramusic-rea/original_bundle.js', 'utf8');

// Let's find where r === 'main' is handled in Zr
const p = js.indexOf('function Zr(');
const zrEnd = js.indexOf('function Qr(', p);
const zrCode = js.slice(p, zrEnd > p ? zrEnd : p + 25000);

console.log('Total Zr length:', zrCode.length);
// Find main dialog rendered in Zr
const mainPos = zrCode.indexOf('r===`google-popup`');
console.log('google-popup branch pos:', mainPos);

// Search for "Continue with Google"
const googleBtnPos = zrCode.indexOf('Continue with Google');
console.log('Continue with Google context:');
console.log(zrCode.slice(Math.max(0, googleBtnPos - 400), Math.min(zrCode.length, googleBtnPos + 600)));
