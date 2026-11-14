import fs from 'node:fs';

const code = fs.readFileSync('C:/Users/pankaj/.gemini/antigravity/scratch/auramusic-rea/freefy_main.js', 'utf8');

// Find all occurrences of OTP or 2fa or two-factor or challenge in Freefy's code
const otpMatches = [...code.matchAll(/two_factor|two-factor|otp|challenge|verification/gi)].map(m => m[0]);
console.log('OTP/2FA keywords in Freefy:', [...new Set(otpMatches)]);

// Find B4 (the two factor / OTP challenge screen in Freefy)
const b4Pos = code.indexOf('function B4(');
console.log('Freefy 2FA / OTP Screen (B4):');
console.log(code.slice(b4Pos, b4Pos + 2000));
