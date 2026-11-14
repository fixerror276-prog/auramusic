import fs from 'node:fs';

const html = fs.readFileSync('C:/Users/pankaj/.gemini/antigravity/scratch/auramusic-rea/freefy_login.html', 'utf8');

const m = html.match(/window\.bootstrapData\s*=\s*(\{[\s\S]*?\});/);
if (m) {
  try {
    const data = JSON.parse(m[1]);
    console.log('Keys in bootstrapData:', Object.keys(data));
    console.log('Auth config:', data.settings?.auth);
    console.log('Themes / colors:', data.settings?.themes);
    console.log('Registration enabled:', data.settings?.registration);
    console.log('Social auth providers:', data.settings?.social);
  } catch (e) {
    console.log('JSON parse error, slice:', m[1].slice(0, 500));
  }
}
