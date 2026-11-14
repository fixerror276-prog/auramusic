const fs = require('fs');
const js = fs.readFileSync('C:/Users/pankaj/.gemini/antigravity/scratch/auramusic-rea/original_bundle.js', 'utf8');

// Find all occurrences of "AuraMusic" and surrounding 200 characters
let pos = 0;
while ((pos = js.indexOf('AuraMusic', pos)) !== -1) {
  console.log('--- Context around AuraMusic at', pos, '---');
  console.log(js.slice(Math.max(0, pos - 150), Math.min(js.length, pos + 250)));
  pos += 9;
}
