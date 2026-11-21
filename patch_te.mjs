import { readFileSync, writeFileSync } from 'fs';

const code = readFileSync('public/assets/index-aura3.js', 'utf8');

const oldTe = '},[p]);let Te=async(e,n=null)=>{if(!e)return;window.__auraTok=(window.__auraTok||0)+1;let i=M(e);d.current=!0;window.__auraRelated&&window.__auraRelated.played(i);';

const offlineModal = [
  "window.__auraPlaySong=Te;",
  "if(!navigator.onLine&&e&&!((e.url&&e.url.startsWith('blob:'))||(e.streamUrl&&e.streamUrl.startsWith('blob:')))){",
  "  const _om=document.createElement('div');",
  "  _om.style.cssText='position:fixed;top:0;left:0;width:100%;height:100%;z-index:99999999;background:rgba(0,0,0,0.85);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;';",
  "  _om.innerHTML='<div style=\"background:#0e1320;border:1px solid rgba(239,68,68,0.5);border-radius:24px;padding:24px 20px;max-width:300px;width:90%;text-align:center;color:#fff\"><div style=\"font-size:40px;margin-bottom:12px\">\\u{1F4F6}</div><h3 style=\"font-size:16px;font-weight:900;margin-bottom:8px;color:#ef4444\">No Internet Connection</h3><p style=\"font-size:12px;color:#94a3b8;line-height:1.5;margin-bottom:16px\">This song is not downloaded for offline play.<br>Open <b>Offline Songs</b> tab to play downloaded tracks.</p><button onclick=\"this.closest(\\'.fixed\\').remove()\" style=\"width:100%;padding:10px;background:linear-gradient(to right,#10b981,#14b8a6);color:#000;font-weight:900;font-size:12px;border:none;border-radius:12px;cursor:pointer\">Got it</button></div>';",
  "  _om.onclick=function(ev){if(ev.target===_om)_om.remove();};",
  "  document.body.appendChild(_om);",
  "  return;",
  "}",
].join('');

const newTe = `},[p]);let Te=async(e,n=null)=>{if(!e)return;${offlineModal}window.__auraTok=(window.__auraTok||0)+1;let i=M(e);d.current=!0;window.__auraRelated&&window.__auraRelated.played(i);`;

if (code.includes(oldTe)) {
  console.log('Te FOUND, patching...');
  writeFileSync('public/assets/index-aura3.js', code.replace(oldTe, newTe));
  console.log('Te patched successfully!');
} else {
  const idx = code.indexOf('},[p]);let Te=');
  console.log('Te NOT FOUND exactly, context:', JSON.stringify(code.substring(idx, idx + 300)));
}
