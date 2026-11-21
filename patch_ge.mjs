import { readFileSync, writeFileSync } from 'fs';
const code = readFileSync('public/assets/index-aura3.js', 'utf8');
// Locate Ge definition
const geStart = code.indexOf('Ge=()=>{');
if (geStart === -1) { console.error('Ge not found'); process.exit(1); }
const before = code.slice(0, geStart);
const after = code.slice(geStart);
// Replace the inner logic of Ge (simple regex for the old structure)
const oldPattern = /let e=ae\+1,cur=p\|\|A\[ae\],R=window\.__auraRelated;\s*if\(R&&cur\){while\(e<A\.length&&\(R.same\(A\[e\]\.name,cur\.name\)\|\|R.wasPlayed\(A\[e\]\)\)\)e++;if\(e>=A\.length\){R.playRelated\(cur,l=>Te\(l\[0\],R.merge\(cur,A,l\.map\(M\)\)\),\(\)=>{ye\?Je\(\):Te\(A\[0\]\)}\);return}}if\(e>=A\.length\){if\(ye\){Je\(\);return}e=0}Te\(A\[e\]\)/s;
const replacement = `let e=ae+1,cur=p||A[ae];
  // Prefer next distinct track; avoid alt‑versions (same name)
  while (e<A.length && (A[e].name && cur.name && A[e].name.toLowerCase()===cur.name.toLowerCase())) {
    e++;
  }
  // If still out of range, fall back to popular tracks (N) if available
  if (e>=A.length) {
    if (typeof N !== 'undefined') {
      for (const pop of N) {
        const idx = A.findIndex(s=>s.id===pop.id);
        if (idx>ae) { e=idx; break; }
      }
    }
    // final fallback to queue start
    if (e>=A.length) { e = ye? (Je(),0) : 0; }
  }
  Te(A[e]);`;
const newAfter = after.replace(oldPattern, replacement);
writeFileSync('public/assets/index-aura3.js', before + newAfter);
console.log('Ge patched');
