const fs = require('fs');
const js = fs.readFileSync('C:/Users/pankaj/.gemini/antigravity/scratch/auramusic-rea/original_bundle.js', 'utf8');

console.log('--- Titles & Strings ---');
const auraMatches = js.match(/AuraMusic[^\s"'`<>]{0,50}/g);
console.log('Aura matches:', auraMatches ? [...new Set(auraMatches)] : 'none');

const apis = js.match(/https?:\/\/[a-zA-Z0-9\.\-\_\:\/]+/g);
if (apis) {
  const filtered = [...new Set(apis)].filter(u => 
    !u.includes('w3.org') && 
    !u.includes('schema.org') &&
    !u.includes('reactjs.org')
  );
  console.log('Filtered URLs/APIs:', filtered);
}

// Check for react router navigation or links
const links = js.match(/href="([^"]+)"/g) || [];
console.log('Hrefs:', [...new Set(links)]);

// Look for component names or nav items
const navMatch = js.match(/(Home|Search|Library|Trending|Top Charts|Settings|Playlist|Album|Favorite|History|Discover)/g);
console.log('Nav terms summary:');
const counts = {};
(navMatch || []).forEach(w => counts[w] = (counts[w]||0) + 1);
console.log(counts);
