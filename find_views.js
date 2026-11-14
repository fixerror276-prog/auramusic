const fs = require('fs');
const js = fs.readFileSync('C:/Users/pankaj/.gemini/antigravity/scratch/auramusic-rea/original_bundle.js', 'utf8');

// Find navigation buttons / sidebar items / routing
// Let's find state that tracks current page/view: e.g. "activeTab", "currentView", "view"
const viewRegex = /([a-zA-Z0-9_$]+)\s*===\s*["'](home|search|library|playlist|artist|album|settings|admin|explore|favorites|liked)["']/gi;
let m;
while ((m = viewRegex.exec(js)) !== null) {
  console.log('Match:', m[0]);
}

// Find state setter calls or render branches
const caseMatches = js.match(/case\s+["']([a-zA-Z0-9_\-]+)["']\s*:/g) || [];
console.log('Switch cases:', caseMatches);
