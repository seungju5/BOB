import {cp,mkdir,readFile,writeFile,rm,readdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..'),source=path.join(root,'docs'),destination=path.join(root,'tmp/firebase-hosting');
async function fingerprints(directory){const result={};async function walk(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())await walk(file);else result[path.relative(directory,file)]=createHash('sha256').update(await readFile(file)).digest('hex');}}await walk(directory);return result;}
const before=await fingerprints(source);
await rm(destination,{recursive:true,force:true});
async function variant(target,provider,base){
  await mkdir(target,{recursive:true});
  await cp(source,target,{recursive:true,filter:filename=>path.basename(filename)!=='.nojekyll'});
  const main=path.join(target,'index.html'),crm=path.join(target,'manage/index.html');
  await writeFile(main,(await readFile(main,'utf8')).replace('<head>',`<head>\n  <base href="${base}">`));
  await writeFile(crm,(await readFile(crm,'utf8')).replace('<head>',`<head><base href="${base}manage/">`));
  for(const edition of ['senior','carer','share']){
    const entry=path.join(target,edition,'index.html');
    await writeFile(entry,(await readFile(entry,'utf8')).replace('<base href="../">',`<base href="${base}">`));
  }
  await writeFile(path.join(target,'cloud-config.mjs'),`export const cloudConfig = {provider: '${provider}'};\n`);
}
await variant(destination,'firebase','/bapmunna/');
await variant(path.join(destination,'supabase'),'supabase','/bapmunna/supabase/');
await cp(path.join(root,'LICENSE'),path.join(destination,'LICENSE'));
let count=0;async function inspect(dir){for(const item of await readdir(dir,{withFileTypes:true})){if(item.name.startsWith('.')||/\.env|\.sql|\.docx/.test(item.name))throw Error('Unexpected private/source artifact in public bundle.');if(item.isDirectory())await inspect(path.join(dir,item.name));else count++;}}
await inspect(destination);
const after=await fingerprints(source);
if(JSON.stringify(before)!==JSON.stringify(after))throw Error('Frontend source changed during staging. Build again from a stable revision.');
await mkdir(path.join(root,'tmp/firebase'),{recursive:true});
await writeFile(path.join(root,'tmp/firebase/stage-proof.json'),JSON.stringify({createdAt:new Date().toISOString(),sources:after,files:await fingerprints(destination)},null,2)+'\n');
console.log(`Staged ${count} public frontend files for Firebase and Supabase, with explicit base URLs.`);
