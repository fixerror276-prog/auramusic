const fs = require('fs');
const js = fs.readFileSync('C:/Users/pankaj/.gemini/antigravity/scratch/auramusic-rea/original_bundle.js', 'utf8');

// Find JSX elements: js uses React.createElement or _jsx or jsxDEV or direct minified calls like e.jsxs( or e.jsx(
// Let's find strings passed into children
const stringMatches = js.match(/"([^"\\]{3,40})"/g) || [];
const uniqueStrings = [...new Set(stringMatches.map(s => s.slice(1, -1)))];
console.log('Total unique strings:', uniqueStrings.length);

const uiKeywords = ['Trending', 'Search', 'Library', 'Home', 'Playlist', 'Favorites', 'Recently Played', 'Top Artists', 'Songs', 'Albums', 'Settings', 'Download', 'Quality', 'Volume', 'Lyrics', 'Queue', 'Next', 'Previous', 'Shuffle', 'Repeat', 'Install', 'Login', 'Sign In', 'Sign Out', 'Profile'];

const foundKeywords = uniqueStrings.filter(s => uiKeywords.some(k => s.toLowerCase() === k.toLowerCase() || s.includes(k)));
console.log('Found UI keywords:', foundKeywords);
