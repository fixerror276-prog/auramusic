import fs from 'node:fs';

const js = fs.readFileSync('C:/Users/pankaj/.gemini/antigravity/scratch/auramusic-rea/original_bundle.js', 'utf8');

// Find in Zr around 551625: localStorage.getItem(
const zrSlice = js.slice(551625, 553000);
console.log(zrSlice);
