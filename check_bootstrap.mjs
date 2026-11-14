import fs from 'node:fs';

const html = fs.readFileSync('C:/Users/pankaj/.gemini/antigravity/scratch/auramusic-rea/freefy_login.html', 'utf8');

// Check bootstrap data / config in the html
const jsonMatches = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)];
console.log('Total inline scripts:', jsonMatches.length);
jsonMatches.forEach((m, idx) => {
  const content = m[1].trim();
  if (content.length > 50 && (content.includes('bootstrap') || content.includes('window.') || content.includes('auth'))) {
    console.log(`Script ${idx} snippet:`, content.slice(0, 300));
  }
});
