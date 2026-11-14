const fs = require('fs');
const path = require('path');

const baseDir = 'C:/Users/pankaj/.gemini/antigravity/scratch/auramusic-rea';

const files = [
  '/logo.png',
  '/icon-192.png',
  '/icon-512.png',
  '/sw.js',
  '/manifest.json',
  '/avatars/p1.jpg',
  '/avatars/p2.jpg',
  '/avatars/p3.jpg',
  '/avatars/p4.jpg',
  '/avatars/p5.jpg',
  '/artists/arijit-singh.jpg',
  '/artists/karan-aujla.jpg',
  '/artists/diljit-dosanjh.jpg',
  '/artists/shreya-ghoshal.jpg',
  '/artists/ap-dhillon.jpg',
  '/artists/sidhu-moose-wala.jpg',
  '/artists/the-weeknd.jpg',
  '/artists/taylor-swift.jpg',
  '/artists/badshah.jpg',
  '/artists/neha-kakkar.jpg',
  '/artists/atif-aslam.jpg',
  '/artists/honey-singh.jpg',
  '/artists/shubh.jpg',
  '/artists/anuv-jain.jpg',
  '/artists/king.jpg',
  '/artists/guru-randhawa.jpg',
  '/artists/jubin-nautiyal.jpg',
  '/artists/ed-sheeran.jpg',
  '/artists/drake.jpg',
  '/artists/bruno-mars.jpg',
  '/artists/dua-lipa.jpg',
  '/artists/billie-eilish.jpg',
  '/artists/justin-bieber.jpg',
  '/artists/harry-styles.jpg',
  '/artists/kishore-kumar.jpg',
  '/artists/lata-mangeshkar.jpg',
  '/artists/mohammed-rafi.jpg',
  '/artists/mukesh.jpg',
  '/artists/rd-burman.jpg',
  '/artists/jagjit-singh.jpg',
  '/artists/asha-bhosle.jpg'
];

async function downloadAll() {
  for (const f of files) {
    const url = 'https://auramusic-2026.netlify.app' + f;
    const dest = path.join(baseDir, 'public', f);
    const dir = path.dirname(dest);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    
    try {
      const res = await fetch(url);
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        fs.writeFileSync(dest, buf);
        console.log(`[OK ${res.status}] ${f} (${buf.length} bytes)`);
      } else {
        console.log(`[FAIL ${res.status}] ${f}`);
      }
    } catch (e) {
      console.log(`[ERR] ${f}: ${e.message}`);
    }
  }
}

downloadAll();
