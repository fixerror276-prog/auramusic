const fs = require('fs');
const js = fs.readFileSync('C:/Users/pankaj/.gemini/antigravity/scratch/auramusic-rea/original_bundle.js', 'utf8');

// Find the <main> block inside the root component around 730300
console.log('--- Main content area ---');
console.log(js.slice(730292, 731780));
