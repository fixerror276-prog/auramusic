import fs from 'node:fs';

const code = fs.readFileSync('C:/Users/pankaj/.gemini/antigravity/scratch/auramusic-rea/freefy_main.js', 'utf8');

// Search for mail or sms or gateway or provider in freefy_main.js
const mailMatches = code.match(/["'](\/api\/v1\/[^"']+|mail|smtp|sms|twilio|postmark|sendgrid|mailgun|ses|resend)["']/gi) || [];
console.log('Mail/SMS matches in Freefy:', [...new Set(mailMatches)]);

// Find bootstrapData settings in freefy_login.html
const html = fs.readFileSync('C:/Users/pankaj/.gemini/antigravity/scratch/auramusic-rea/freefy_login.html', 'utf8');
const m = html.match(/window\.bootstrapData\s*=\s*(\{[\s\S]*?\});/);
if (m) {
  const data = JSON.parse(m[1]);
  console.log('Freefy Settings Keys:', Object.keys(data.settings));
  console.log('Freefy Mail/Auth Settings:', data.settings.mail, data.settings.auth);
}
