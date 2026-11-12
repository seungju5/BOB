// Preserve the complete current Hosting file map. Only reviewed changed app files are overlaid.
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import path from 'node:path';
import {api,quiet,assertFree,Client,site,root} from '../../super-members/scripts/cloud-admin.mjs';
const hosting=api('https://firebasehosting.googleapis.com','v1beta1');
const evidence=path.join(root,'tmp/impact-final/release'),stage=path.join(root,'tmp/impact-final/site');
await mkdir(evidence,{recursive:true});
const save=(name,data)=>writeFile(path.join(evidence,name),JSON.stringify(data,null,2)+'\n');
const read=async name=>JSON.parse(await readFile(path.join(evidence,name),'utf8'));
const hash=data=>createHash('sha256').update(data).digest('hex');
const pack=bytes=>gzipSync(bytes,{level:9});
const current=async()=>(await hosting.get('/sites/'+site+'/releases',{queryParams:{pageSize:1},...quiet()})).body.releases[0];
async function fileMap(version){const files={};let pageToken;do{const page=(await hosting.get('/'+version+'/files',{queryParams:{pageSize:1000,...pageToken?{pageToken}:{}},...quiet()})).body;for(const f of page.files||[])files[f.path]=f.hash;pageToken=page.nextPageToken;}while(pageToken);return files;}
async function localMap(dir,prefix){const map={};for(const entry of await readdir(dir,{withFileTypes:true})){const full=path.join(dir,entry.name),name=prefix+'/'+entry.name;if(entry.isDirectory())Object.assign(map,await localMap(full,name));else if(entry.isFile())map[name]=hash(pack(await readFile(full)));else throw Error('Unexpected symbolic link');}return map;}
const action=process.argv[2]||'plan';
if(action==='plan'){
 await assertFree();
 const before=await current(),baseline=await fileMap(before.version.name);
 const previous=process.env.BAPMUNNA_PREVIOUS_STAGE;if(!previous)throw Error('Set BAPMUNNA_PREVIOUS_STAGE to the pre-edit staged Firebase app.');
 const old=await localMap(previous,'/bapmunna'),incoming=await localMap(stage,''),overlay={},conflicts=[];
 for(const [p,h] of Object.entries(incoming)){
  if(!p.startsWith('/bapmunna/'))throw Error('Unexpected deployment prefix');
  if(baseline[p]===h||(old[p]===h&&baseline[p]))continue;
  if(baseline[p]&&baseline[p]!==old[p]){conflicts.push(p);continue;}
  overlay[p]=h;
 }
 if(conflicts.length)throw Error('Live edits require reconciliation: '+JSON.stringify(conflicts));
 const proof=JSON.parse(await readFile(path.join(root,'tmp/impact-final/stage.json'),'utf8'));
 const frozen=path.join(evidence,'frozen');await mkdir(frozen,{recursive:true});
 for(const [p,h]of Object.entries(overlay)){const bytes=await readFile(path.join(stage,p));if(hash(bytes)!==proof.files[p])throw Error('Stage changed: '+p);const dest=path.join(frozen,p);await mkdir(path.dirname(dest),{recursive:true});await writeFile(dest,bytes);if(hash(pack(bytes))!==h)throw Error('Frozen mismatch');}
 await save('baseline.json',{release:before,files:baseline});
 const plan={at:new Date().toISOString(),site,before:before.version.name,overlay,source:proof.commit,preserved:Object.keys(baseline).filter(p=>!Object.hasOwn(overlay,p)).length,totalFiles:Object.keys({...baseline,...overlay}).length};
 await save('plan.json',plan);console.log(JSON.stringify({site,before:plan.before,changed:Object.keys(overlay).length,preserved:plan.preserved,totalFiles:plan.totalFiles,hostingConfig:'unchanged'},null,2));
}else if(action==='publish'){
 await assertFree();const plan=await read('plan.json'),baseline=await read('baseline.json');
 if((await current()).version.name!==plan.before)throw Error('Concurrent release; re-plan before publishing');
 const blobs=new Map();for(const [p,h]of Object.entries(plan.overlay)){if(!p.startsWith('/bapmunna/'))throw Error('Out of scope');const bytes=await readFile(path.join(evidence,'frozen',p)),compressed=pack(bytes);if(hash(compressed)!==h||hash(pack(await readFile(path.join(stage,p))))!==h)throw Error('Stage changed');blobs.set(h,compressed);}
 const desired={...baseline.files,...plan.overlay};
 const version=(await hosting.post('/sites/'+site+'/versions',{config:baseline.release.version.config},quiet())).body;
 await save('staged.json',{version:version.name});let uploads=0;
 const entries=Object.entries(desired);for(let i=0;i<entries.length;i+=1000){const result=(await hosting.post('/'+version.name+':populateFiles',{files:Object.fromEntries(entries.slice(i,i+1000))},quiet())).body;for(const digest of result.uploadRequiredHashes||[]){if(!blobs.has(digest))throw Error('Existing production blob unavailable; not releasing');const url=new URL(result.uploadUrl+'/'+digest);await new Client({urlPrefix:url.origin,auth:true}).post(url.pathname,blobs.get(digest),{headers:{'Content-Type':'application/octet-stream'},...quiet()});uploads++;}}
 await hosting.patch('/'+version.name,{status:'FINALIZED'},{queryParams:{updateMask:'status'},...quiet()});
 const verified=await fileMap(version.name);if(Object.keys(verified).length!==Object.keys(desired).length||Object.entries(desired).some(([p,h])=>verified[p]!==h))throw Error('Full preservation verification failed');
 if((await current()).version.name!==plan.before)throw Error('Concurrent release before publication');await assertFree();
 const release=(await hosting.post('/sites/'+site+'/releases',{message:'Bapmunna complete mobile app, accessible account entry and final release hub'},{queryParams:{versionName:version.name},...quiet()})).body;
 const receipt={at:new Date().toISOString(),site,url:'https://impact-series.web.app/bapmunna/final/',version:version.name,previous:plan.before,release:release.name,source:plan.source,changed:Object.keys(plan.overlay).length,preserved:plan.preserved,totalFiles:plan.totalFiles,uploads,hostingConfig:'unchanged',billingEnabled:false};await save('release.json',receipt);console.log(JSON.stringify(receipt,null,2));
}else if(action==='verify'){
 const plan=await read('plan.json'),receipt=await read('release.json');if((await current()).version.name!==receipt.version)throw Error('Another release is now live');
 const baseline=await read('baseline.json'),live=await fileMap(receipt.version);const missing=Object.keys(baseline.files).filter(p=>!live[p]);if(missing.length)throw Error('Missing existing paths');
 for(const [p,h]of Object.entries(plan.overlay)){const r=await fetch('https://impact-series.web.app'+p,{cache:'no-store'});if(!r.ok||hash(pack(Buffer.from(await r.arrayBuffer())))!==h)throw Error('Public bytes differ: '+p);}
 const result={at:new Date().toISOString(),version:receipt.version,publicFilesVerified:Object.keys(plan.overlay).length,existingPathsMissing:missing.length,...await assertFree()};await save('verified.json',result);console.log(JSON.stringify(result,null,2));
}else if(action==='rollback'){
 const receipt=await read('release.json');if((await current()).version.name!==receipt.version)throw Error('A newer release exists; do not replace it');await assertFree();const release=(await hosting.post('/sites/'+site+'/releases',{message:'Restore previous Bapmunna release'},{queryParams:{versionName:receipt.previous},...quiet()})).body;await save('rollback.json',{at:new Date().toISOString(),release:release.name,restored:receipt.previous});console.log('Restored '+receipt.previous);
}else throw Error('Use plan, publish, verify or rollback');
