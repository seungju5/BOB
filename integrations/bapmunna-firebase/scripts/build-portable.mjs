import {mkdirSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {extname} from 'node:path';

const file=path=>new URL(path,import.meta.url);
const read=path=>readFileSync(file(path),'utf8');
const mime={'.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2','.ttf':'font/ttf'};
const embedded=new Map();
for(const name of readdirSync(file('../docs/assets/'))){
  const type=mime[extname(name)];if(!type)continue;
  embedded.set(`./assets/${name}`,`data:${type};base64,${readFileSync(file(`../docs/assets/${name}`)).toString('base64')}`);
}
const embed=source=>{for(const [path,data] of embedded)source=source.replaceAll(path,data);return source;};
const sources=['shared/config/detection.mjs','shared/lib/judge/time.mjs','shared/lib/judge/detectEvents.mjs','shared/lib/judge/resolveMealSlots.mjs','shared/lib/judge/evaluateAlerts.mjs','shared/lib/data/view.mjs','parity.mjs','power.mjs','engine.mjs','worksheet.mjs','family.mjs','presentation.mjs','checks.mjs','editions.mjs','experience.mjs','bunny-greeting.mjs','app.mjs'].map(name=>read(`../docs/${name}`).replace(/^import .*;\n/gm,'').replace(/^export /gm,''));
const script=embed(sources.join('\n')).replace(/<\/script/gi,'<\\/script');
let html=embed(read('../docs/index.html')).replace(/^\s*<meta name="bapmunna-cloud" content="enabled">\n/m,'');
html=html.replace('href="./manage/"','href="https://impact-series.web.app/bapmunna/manage/"');
for(const name of ['style.css','brand.css','interface.css','refinement.css','editions.css','worksheet.css','character.css','experience.css','connection.css','bunny-greeting.css'])html=html.replace(`<link rel="stylesheet" href="./${name}">`,`<style>${embed(read(`../docs/${name}`))}</style>`);
html=html.replace('<script type="module" src="./app.mjs"></script>',`<script type="module">${script}</script>`);
const licenseText=['OFL-Pretendard.txt','OFL-NanumPenScript.txt'].map(name=>read(`../docs/assets/${name}`)).join('\n\n');
const escapedLicense=licenseText.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
html=html.replace('</body>',`<template id="font-license-notices"><pre>${escapedLicense}</pre></template></body>`);
if(html.includes('./assets/'))throw Error('An asset reference was not embedded.');
const output=file('../workshop/bapmunna.html');
mkdirSync(file('../workshop/'),{recursive:true});writeFileSync(output,html);
console.log(`Portable workshop app: ${fileURLToPath(output)} (${(Buffer.byteLength(html)/1024/1024).toFixed(1)} MiB)`);
