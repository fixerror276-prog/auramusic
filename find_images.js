const fs = require('fs');
const js = fs.readFileSync('C:/Users/pankaj/.gemini/antigravity/scratch/auramusic-rea/original_bundle.js', 'utf8');

// Find all image references in the bundle
const imgMatches = js.match(/\/avatars\/[a-zA-Z0-9_\-\.]+|\/artists\/[a-zA-Z0-9_\-\.]+|\/[a-zA-Z0-9_\-\.]+\.(png|jpg|jpeg|svg|webp|ico)/gi) || [];
console.log('Local images referenced:', [...new Set(imgMatches)]);
