// Scope: two UI files only. Preserve every other live file and all hosting settings.
import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url),rootPath=fileURLToPath(root);
const require=createRequire(new URL('package.json',root));
const auth=require('firebase-tools/lib/auth'),{requireAuth}=require('firebase-tools/lib/requireAuth'),{Client}=require('firebase-tools/lib/apiv2');
const options={project:'ku-gpa',projectRoot:rootPath,nonInteractive:true};
const account=auth.getProjectDefaultAccount(rootPath);
if(!account)throw Error('Existing Firebase CLI sign-in required.');
auth.setActiveAccount(options,account);await requireAuth(options);
const api=new Client({urlPrefix:'https://firebasehosting.googleapis.com',apiVersion:'v1beta1',auth:true});
const quiet=()=>({skipLog:{body:true,resBody:true}});
const current=async()=>(await api.get('/sites/ku-gpa/releases',{queryParams:{pageSize:1},...quiet()})).body.releases[0];
async function files(version){const result={};let token;do{const page=(await api.get('/'+version+'/files',{queryParams:{pageSize:1000,...(token?{pageToken:token}:{})},...quiet()})).body;for(const f of page.files||[])result[f.path]=f.hash;token=page.nextPageToken;}while(token);return result;}
const hash=data=>createHash('sha256').update(data).digest('hex');
const before=await current(),baseline=await files(before.version.name),hashes={...baseline},blobs=new Map();
// Prior UI has already been published alongside another task. Only accept its known
// app version (or the same source) so this final polish cannot overwrite another edit.
const app=await readFile(new URL('docs/app.mjs',root),'utf8');
const response=await fetch('https://ku-gpa.web.app/bapmunna/app.mjs');
if(!response.ok)throw Error('Cannot inspect the current public app.');
const live=await response.text();
if(hash(gzipSync(Buffer.from(live),{level:9}))!==baseline['/bapmunna/app.mjs'])throw Error('CDN/version mismatch; retry after inspecting release.');
if(live!==app&&live.replace(' aria-label="밥솥 소식 · 기기 상태 자세히 보기"','')!==app)throw Error('Another app edit is live; reconcile before publishing.');
const paths=['app.mjs','refinement.css'];
const evidence=new URL('tmp/ui-polish/',root);await mkdir(evidence,{recursive:true});
await writeFile(new URL('baseline.json',evidence),JSON.stringify({release:before,hashes:baseline},null,2));
for(const name of paths){const data=gzipSync(await readFile(new URL('docs/'+name,root)),{level:9}),digest=hash(data);hashes['/bapmunna/'+name]=digest;blobs.set(digest,data);}
if((await current()).version.name!==before.version.name)throw Error('Concurrent release; stopped.');
const version=(await api.post('/sites/ku-gpa/versions',{config:before.version.config},quiet())).body;
const entries=Object.entries(hashes);
for(let i=0;i<entries.length;i+=1000){const populated=(await api.post('/'+version.name+':populateFiles',{files:Object.fromEntries(entries.slice(i,i+1000))},quiet())).body;
 for(const digest of populated.uploadRequiredHashes||[]){if(!blobs.has(digest))throw Error('Existing production blob unavailable; no release.');const url=new URL(populated.uploadUrl+'/'+digest);await new Client({urlPrefix:url.origin,auth:true}).post(url.pathname,blobs.get(digest),{headers:{'Content-Type':'application/octet-stream'},...quiet()});}}
await api.patch('/'+version.name,{status:'FINALIZED'},{queryParams:{updateMask:'status'},...quiet()});
const staged=await files(version.name);
if(Object.keys(staged).length!==Object.keys(hashes).length||Object.entries(hashes).some(([name,value])=>staged[name]!==value))throw Error('Preservation check failed; no release.');
if((await current()).version.name!==before.version.name)throw Error('Concurrent release; no release.');
const release=(await api.post('/sites/ku-gpa/releases',{message:'Polish home, records and progressive settings; narrow-screen and accessibility fixes'},{queryParams:{versionName:version.name},...quiet()})).body;
const result={url:'https://ku-gpa.web.app/bapmunna/',version:version.name,release:release.name,changed:paths,preservedPaths:Object.keys(baseline).length-paths.length};
await writeFile(new URL('release.json',evidence),JSON.stringify(result,null,2));
console.log(JSON.stringify(result));
