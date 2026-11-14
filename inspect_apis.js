const fs = require('fs');
const js = fs.readFileSync('C:/Users/pankaj/.gemini/antigravity/scratch/auramusic-rea/original_bundle.js', 'utf8');

// Let's search for API base urls or fetch calls
const fetches = js.match(/fetch\([^\)]+\)/g);
console.log('Fetches sample:', (fetches || []).slice(0, 15));

// Check if there is saavn or jio or youtube api or custom backend
const saavnMatches = js.match(/[^"'\`\s]*saavn[^"'\`\s]*/gi);
console.log('Saavn mentions:', [...new Set(saavnMatches)].slice(0, 20));

// Check for tabs or routes or view states
const viewMatches = js.match(/(activeTab|currentTab|view|page|route)\s*[:=]\s*['"][a-zA-Z0-9_\-]+['"]/g);
console.log('View/tab matches:', [...new Set(viewMatches)]);
