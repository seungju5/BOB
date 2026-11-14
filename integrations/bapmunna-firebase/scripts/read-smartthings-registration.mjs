// Current readback with CLI 3+ (/v1/smartapps). Never print OAuth secrets.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,readFile,rm,chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
const run=promisify(execFile);
const appId='f1b8149d-45c5-4f4b-8136-2ad518faf4ec';
const cli=process.env.BAPMUNNA_SMARTTHINGS_CLI||'smartthings';
const args=cli.endsWith('.js')?[cli]:[];
const executable=args.length?process.execPath:cli;
const directory=await mkdtemp(path.join(tmpdir(),'bapmunna-registration-'));await chmod(directory,0o700);
try{
  const version=(await run(executable,[...args,'--version'],{timeout:15000})).stdout.trim();
  if(!/^3\./.test(version))throw Error('CLI 3.x is required. Install the official @smartthings/cli@3.0.1.');
  const results=[];
  for(const command of ['smartapps','smartapps:oauth']){
    const file=path.join(directory,command.replace(':','-')+'.json');
    await run(executable,[...args,command,appId,'--json','--output',file],{timeout:30000,maxBuffer:1048576});
    results.push(JSON.parse(await readFile(file,'utf8')));
  }
  const [app,oauth]=results;
  if(app.appId!==appId)throw Error('Unexpected SmartThings app.');
  console.log(JSON.stringify({checkedAt:new Date().toISOString(),cliVersion:version,appId,appType:app.appType,targetUrl:app.apiOnly?.subscription?.targetUrl,targetStatus:app.apiOnly?.subscription?.targetStatus,scope:oauth.scope,redirectUris:oauth.redirectUris,actualOAuthVerified:false},null,2));
}catch{
  // CLI errors can contain request details; keep the public error deliberately small.
  console.error('Registration readback failed. Check CLI 3.x installation and its existing authorized login. No settings were changed.');process.exitCode=1;
}finally{await rm(directory,{recursive:true,force:true});}
