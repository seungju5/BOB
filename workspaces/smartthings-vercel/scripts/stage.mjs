import {readFile,writeFile,copyFile,mkdir,rename,rm} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {join} from 'node:path';

const workspace=fileURLToPath(new URL('../',import.meta.url));
const repository=fileURLToPath(new URL('../../../',import.meta.url));
const sourceRuntimeFiles=Object.freeze(['index.mjs','http-adapter.mjs','security.mjs','service.mjs','smartthings.mjs','store.mjs','kakao-security.mjs','kakao-store.mjs','kakao-service.mjs','kakao-runtime.mjs']);
export const runtimeFiles=Object.freeze([...sourceRuntimeFiles,'kakao-handler.mjs']);
export const kakaoRoutes=Object.freeze(['config','start','callback','exchange']);
export const portalFiles=Object.freeze(['connect/index.html','connect/connect.mjs','connect/style.css']);

export async function stage({destination=join(workspace,'.stage')}={}){
  const temporary=destination+'.tmp';
  await rm(temporary,{recursive:true,force:true});
  try{
    for(const folder of ['api/smartthings','api/kakao','runtime','public/connect'])await mkdir(join(temporary,folder),{recursive:true});
    const server=join(repository,'integrations/bapmunna-firebase/server');
    for(const name of sourceRuntimeFiles)await copyFile(join(server,name),join(temporary,'runtime',name));
    await copyFile(join(workspace,'template/runtime/kakao-handler.mjs'),join(temporary,'runtime/kakao-handler.mjs'));
    for(const name of portalFiles)await copyFile(join(workspace,'public',name),join(temporary,'public',name));
    await copyFile(join(repository,'integrations/bapmunna-firebase/docs/assets/rice-cooker-companion.png'),join(temporary,'public/connect/bunny.png'));
    await copyFile(join(workspace,'template/api/smartthings/[...path].mjs'),join(temporary,'api/smartthings/[...path].mjs'));
    // Fixed routes keep Vercel's dynamic "...path" metadata out of OAuth query input.
    for(const route of kakaoRoutes)await copyFile(join(workspace,'template/api/kakao',route+'.mjs'),join(temporary,'api/kakao',route+'.mjs'));
    await copyFile(join(workspace,'template/vercel.json'),join(temporary,'vercel.json'));
    const source=JSON.parse(await readFile(join(workspace,'package.json'),'utf8'));
    const manifest={name:source.name,private:true,type:source.type,version:source.version,engines:source.engines,dependencies:source.dependencies};
    const lock=JSON.parse(await readFile(join(server,'package-lock.json'),'utf8'));
    if(JSON.stringify(lock.packages[''].dependencies)!==JSON.stringify(manifest.dependencies))throw Error('Pinned server dependencies do not match the deployment manifest.');
    lock.name=manifest.name;lock.version=manifest.version;
    lock.packages['']={...lock.packages[''],name:manifest.name,version:manifest.version,engines:manifest.engines};
    await writeFile(join(temporary,'package.json'),JSON.stringify(manifest,null,2)+'\n');
    await writeFile(join(temporary,'package-lock.json'),JSON.stringify(lock,null,2)+'\n');
    // Never include .env, service-account files, local CLI state or source tests.
    await writeFile(join(temporary,'.vercelignore'),'.env*\n.vercel/\nnode_modules/\n');
    await rm(destination,{recursive:true,force:true});await rename(temporary,destination);
    return {destination,runtimeFiles:[...runtimeFiles],portalFiles:[...portalFiles]};
  }catch(error){await rm(temporary,{recursive:true,force:true});throw error;}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{await stage();console.log('SmartThings Vercel package staged locally; no deployment, credentials or billing changed.');}
  catch{console.error('SmartThings staging failed. Check the explicit runtime, portal and asset file list.');process.exitCode=1;}
}
