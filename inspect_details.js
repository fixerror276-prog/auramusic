const fs = require('fs');
const js = fs.readFileSync('C:/Users/pankaj/.gemini/antigravity/scratch/auramusic-rea/original_bundle.js', 'utf8');

// Find all fetch `/api/...` endpoints
const apiMatches = js.match(/\/api\/[a-zA-Z0-9_\-\/\?=\${}&`]+/g) || [];
console.log('All API patterns:', [...new Set(apiMatches)]);

// Find all UI tabs or screens or navigation
// Let's search for "Home", "Library", "Search" in JSX
const screenMatches = js.match(/(['"])(home|search|library|playlist|settings|trending|charts|queue|player|lyrics|explore|artists|albums)\1/gi) || [];
console.log('Screen terms:', [...new Set(screenMatches)]);

// Let's check modal or drawer components
const modalMatches = js.match(/([a-zA-Z0-9]+Modal|[a-zA-Z0-9]+Drawer|[a-zA-Z0-9]+Dialog)/g) || [];
console.log('Modals/Drawers:', [...new Set(modalMatches)]);
