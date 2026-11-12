// Static Next.js edition for the existing shared Firebase Hosting site.
// This script builds only; publication is a separate explicit operation.
import {spawnSync} from 'node:child_process';
import {cp,mkdir,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');
const basePath='/bapmunna/app';
const destination=path.join(root,'tmp/impact-final/next');
const env={...process.env,BAPMUNNA_STATIC_EXPORT:'1',NEXT_PUBLIC_APP_BASE_PATH:basePath};
for(const args of [['scripts/sync-design.mjs','--check'],['node_modules/next/dist/bin/next','build','--webpack']]){
  const result=spawnSync(process.execPath,args,{cwd:root,env,stdio:'inherit'});
  if(result.error)throw result.error;
  if(result.status!==0)process.exit(result.status??1);
}
// In export mode Next uses distDir as the export directory (its intermediate cache is .next).
const exported=path.join(root,'tmp/impact-final/build');
const routes=['','login','auth/callback','start','tutorial','onboarding','home','records','report','alerts','settings','more','s'];
for(const route of routes){
  const html=await readFile(path.join(exported,route,'index.html'),'utf8');
  if(!html.includes('name="viewport"'))throw Error('Missing mobile viewport: '+route);
  for(const match of html.matchAll(/(?:src|href)="(\/(?!\/)[^"]+)"/g)){
    if(!match[1].startsWith(basePath+'/'))throw Error('Unscoped asset or link in '+route+': '+match[1]);
  }
}
const manifest=JSON.parse(await readFile(path.join(exported,'manifest.webmanifest'),'utf8'));
const manifestURL='https://impact-series.web.app'+basePath+'/manifest.webmanifest';
if(new URL(manifest.scope,manifestURL).pathname!==basePath+'/'||new URL(manifest.start_url,manifestURL).pathname!==basePath+'/')throw Error('PWA scope does not match the app mount');
await rm(destination,{recursive:true,force:true});
await mkdir(path.dirname(destination),{recursive:true});
await cp(exported,destination,{recursive:true});
const files={};
async function walk(directory){
  for(const entry of await readdir(directory,{withFileTypes:true})){
    const file=path.join(directory,entry.name);
    if(entry.isDirectory())await walk(file);
    else if(entry.isFile())files[path.relative(destination,file).split(path.sep).join('/')]=createHash('sha256').update(await readFile(file)).digest('hex');
    else throw Error('Unsupported export entry: '+file);
  }
}
await walk(destination);
await writeFile(path.join(root,'tmp/impact-final/next-build.json'),JSON.stringify({basePath,routes,files},null,2)+'\n');
console.log(JSON.stringify({basePath,output:'tmp/impact-final/next',routes:routes.length,files:Object.keys(files).length,publication:'not performed'}));
