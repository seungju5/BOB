// Overlay only /super-members/. Never use a blanket Hosting deploy on this shared site.
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {api,Client,site,root,evidence,quiet,assertFree,save} from './cloud-admin.mjs';
const hosting=api('https://firebasehosting.googleapis.com','v1beta1');
const prefix='/super-members/',stage=path.join(evidence,'site/super-members');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const pack=bytes=>gzipSync(bytes,{level:9});
const read=async name=>JSON.parse(await readFile(path.join(evidence,name),'utf8'));
const current=async()=>(await hosting.get(`/sites/${site}/releases`,{queryParams:{pageSize:1},...quiet()})).body.releases[0];
async function fileMap(version){const files={};let pageToken;do{const page=(await hosting.get('/'+version+'/files',{queryParams:{pageSize:1000,...pageToken?{pageToken}:{}},...quiet()})).body;for(const f of page.files||[])files[f.path]=f.hash;pageToken=page.nextPageToken;}while(pageToken);return files;}
async function walk(dir){const items=[];for(const entry of await readdir(dir,{withFileTypes:true})){const full=path.join(dir,entry.name);if(entry.isDirectory())items.push(...await walk(full));else if(entry.isFile())items.push(full);else throw Error('Unsupported staged entry');}return items;}
const action=process.argv[2]||'plan';
if(action==='plan'){
 await assertFree();const release=await current(),files=await fileMap(release.version.name),overlay={},rawHashes={};
 const frozen=path.join(evidence,'frozen');await mkdir(frozen,{recursive:true});
 for(const filename of await walk(stage)){
  const relative=path.relative(stage,filename);
  if(relative.split(path.sep).some(p=>p.startsWith('.'))||!(/\.(html|css|mjs|js|png|webp|woff2|txt)$/i.test(relative)))throw Error('Non-public staged file: '+relative);
  const bytes=await readFile(filename);const publicPath=prefix+relative.split(path.sep).join('/');
  overlay[publicPath]=hash(pack(bytes));rawHashes[relative]=hash(bytes);
  const dest=path.join(frozen,relative);await mkdir(path.dirname(dest),{recursive:true});await writeFile(dest,bytes);
 }
 if(!overlay[prefix+'index.html']||!overlay[prefix+'app.mjs'])throw Error('Incomplete office build');
 await save('hosting-baseline.json',{release,files});
 const plan={at:new Date().toISOString(),site,before:release.version.name,overlay,rawHashes,preserved:Object.keys(files).filter(p=>!p.startsWith(prefix)).length,totalFiles:Object.keys({...files,...overlay}).length};
 await save('hosting-plan.json',plan);console.log(JSON.stringify({site,version:plan.before,newFiles:Object.keys(overlay).length,preserved:plan.preserved,totalFiles:plan.totalFiles,hostingConfig:'unchanged'},null,2));
}else if(action==='publish'){
 await assertFree();const plan=await read('hosting-plan.json'),baseline=await read('hosting-baseline.json');
 if((await current()).version.name!==plan.before)throw Error('Concurrent release. Re-plan and review.');
 const blobs=new Map();
 for(const [p,h]of Object.entries(plan.overlay)){
  if(!p.startsWith(prefix))throw Error('Out-of-scope path');
  const relative=p.slice(prefix.length),bytes=await readFile(path.join(evidence,'frozen',relative));
  if(hash(bytes)!==plan.rawHashes[relative]||hash(await readFile(path.join(stage,relative)))!==plan.rawHashes[relative])throw Error('Build changed since plan');
  const compressed=pack(bytes);if(hash(compressed)!==h)throw Error('Frozen file changed');blobs.set(h,compressed);
 }
 const next={...baseline.files,...plan.overlay};
 const version=(await hosting.post(`/sites/${site}/versions`,{config:baseline.release.version.config},quiet())).body;
 await save('hosting-staged.json',{version:version.name});
 const entries=Object.entries(next);let uploads=0;
 for(let i=0;i<entries.length;i+=1000){
  const p=(await hosting.post('/'+version.name+':populateFiles',{files:Object.fromEntries(entries.slice(i,i+1000))},quiet())).body;
  for(const h of p.uploadRequiredHashes||[]){if(!blobs.has(h))throw Error('An existing blob is unavailable. Stop before release.');const url=new URL(p.uploadUrl+'/'+h);await new Client({urlPrefix:url.origin,auth:true}).post(url.pathname,blobs.get(h),{headers:{'Content-Type':'application/octet-stream'},...quiet()});uploads++;}
 }
 await hosting.patch('/'+version.name,{status:'FINALIZED'},{queryParams:{updateMask:'status'},...quiet()});
 const actual=await fileMap(version.name);
 if(Object.keys(actual).length!==Object.keys(next).length||Object.entries(next).some(([p,h])=>actual[p]!==h))throw Error('Full file map mismatch; no release.');
 if((await current()).version.name!==plan.before)throw Error('Concurrent release before publication.');
 await assertFree();
 const release=(await hosting.post(`/sites/${site}/releases`,{message:'Warming Up Super Members: animated virtual office and role-based AI chat; Spark preserved'},{queryParams:{versionName:version.name},...quiet()})).body;
 const receipt={at:new Date().toISOString(),url:'https://impact-series.web.app/super-members/',site,version:version.name,release:release.name,previous:plan.before,preserved:plan.preserved,overlayFiles:Object.keys(plan.overlay).length,uploads,hostingConfig:'unchanged',existingAuthDatabase:'unchanged',billingEnabled:false};
 await save('hosting-release.json',receipt);await save('hosting-release-'+version.name.split('/').at(-1)+'.json',receipt);console.log(JSON.stringify(receipt,null,2));
}else if(action==='verify'){
 const plan=await read('hosting-plan.json'),receipt=await read('hosting-release.json');
 if((await current()).version.name!==receipt.version)throw Error('Current version changed');
 for(const [p,h]of Object.entries(plan.overlay)){const response=await fetch('https://'+site+'.web.app'+p,{cache:'no-store'});if(!response.ok||hash(pack(Buffer.from(await response.arrayBuffer())))!==h)throw Error('Public bytes mismatch: '+p);}
 const report={...await assertFree(),version:receipt.version,verifiedPublicFiles:Object.keys(plan.overlay).length,at:new Date().toISOString()};await save('hosting-verified.json',report);console.log(JSON.stringify(report,null,2));
}else if(action==='rollback'){
 await assertFree();const receipt=await read('hosting-release.json');if((await current()).version.name!==receipt.version)throw Error('Live version changed; do not roll back other work.');
 const release=(await hosting.post(`/sites/${site}/releases`,{message:'Restore pre-Super-Members Hosting release'},{queryParams:{versionName:receipt.previous},...quiet()})).body;await save('hosting-rollback.json',{at:new Date().toISOString(),release:release.name,restored:receipt.previous});console.log('Restored '+receipt.previous);
}else throw Error('Use plan, publish, verify or rollback explicitly.');
