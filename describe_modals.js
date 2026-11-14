const fs = require('fs');
const js = fs.readFileSync('C:/Users/pankaj/.gemini/antigravity/scratch/auramusic-rea/original_bundle.js', 'utf8');

function findFn(name) {
  const p = js.indexOf(`function ${name}(`);
  if (p === -1) return `${name} not found`;
  return js.slice(p, p + 500);
}

['Ir', 'Hr', 'Wr', 'Zr', 'Qr', '$r', 'ni'].forEach(n => {
  console.log(`=== ${n} ===`);
  console.log(findFn(n));
});
