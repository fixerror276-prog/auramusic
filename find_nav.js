const fs = require('fs');
const js = fs.readFileSync('C:/Users/pankaj/.gemini/antigravity/scratch/auramusic-rea/original_bundle.js', 'utf8');

// Find active tab or main navigation
const tabMatches = js.match(/(?:activeTab|tab|view|currentView)\s*===\s*['"]([^'"]+)['"]/g) || [];
console.log('Tab comparison expressions:', [...new Set(tabMatches)]);

// Find buttons or nav links with label texts
const textMatches = js.match(/>([A-Z][a-zA-Z0-9\s&]{2,30})</g) || [];
console.log('Sample button/heading texts:', [...new Set(textMatches)].slice(0, 50));
