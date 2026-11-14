import fs from 'node:fs';

const html = fs.readFileSync('C:/Users/pankaj/.gemini/antigravity/scratch/auramusic-rea/freefy_login.html', 'utf8');

// Find the <div id="root"> or whatever container holds the SSR / rendered page
const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
if (bodyMatch) {
  const bodyContent = bodyMatch[1];
  // Strip out <script> tags to see pure HTML structure
  const cleanHtml = bodyContent.replace(/<script[\s\S]*?<\/script>/gi, '').trim();
  console.log('Clean body length:', cleanHtml.length);
  fs.writeFileSync('C:/Users/pankaj/.gemini/antigravity/scratch/auramusic-rea/freefy_login_body.html', cleanHtml);
  console.log('Preview:');
  console.log(cleanHtml.slice(0, 1500));
}
