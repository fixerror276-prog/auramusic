import fs from 'node:fs';

async function checkFreefy() {
  const loginHtml = await (await fetch('https://freefy.app/login')).text();
  fs.writeFileSync('C:/Users/pankaj/.gemini/antigravity/scratch/auramusic-rea/freefy_login.html', loginHtml);

  // Find all script tags
  const scripts = [...loginHtml.matchAll(/<script[^>]+src=["']([^"']+)["']/g)].map(m => m[1]);
  console.log('Scripts on freefy login:');
  console.log(scripts);

  // Find stylesheets
  const styles = [...loginHtml.matchAll(/<link[^>]+href=["']([^"']+)["'][^>]*rel=["']stylesheet["']/g)].map(m => m[1]);
  console.log('Styles:');
  console.log(styles);
}

checkFreefy();
