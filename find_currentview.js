const fs = require('fs');
const js = fs.readFileSync('C:/Users/pankaj/.gemini/antigravity/scratch/auramusic-rea/original_bundle.js', 'utf8');

// Search for currentView rendering
const viewPos = js.indexOf('currentView');
let pos = 0;
while ((pos = js.indexOf('currentView', pos)) !== -1) {
  console.log('--- currentView match at', pos, '---');
  console.log(js.slice(Math.max(0, pos - 50), Math.min(js.length, pos + 250)));
  pos += 11;
}
