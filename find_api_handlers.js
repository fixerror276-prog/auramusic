const fs = require('fs');
const js = fs.readFileSync('C:/Users/pankaj/.gemini/antigravity/scratch/auramusic-rea/original_bundle.js', 'utf8');

// Find all occurrences of /api/
const endpoints = js.match(/\/api\/[a-zA-Z0-9_\-\/]+/g) || [];
console.log('Distinct API endpoints:');
console.log([...new Set(endpoints)]);
