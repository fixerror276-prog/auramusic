const fs = require('fs');
const js = fs.readFileSync('C:/Users/pankaj/.gemini/antigravity/scratch/auramusic-rea/original_bundle.js', 'utf8');

// Match backtick strings
const backticks = js.match(/`([^`\\]{3,100})`/g) || [];
console.log('Sample backtick strings:', backticks.slice(0, 30));

// Match single quotes
const singles = js.match(/'([^'\\]{3,100})'/g) || [];
console.log('Sample single quotes:', singles.slice(0, 30));
