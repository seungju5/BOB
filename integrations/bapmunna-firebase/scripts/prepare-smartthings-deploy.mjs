// Make a reviewable, secret-free source package. No remote operations.
import {readFile,writeFile,mkdir,lstat,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {serverBuildFiles,validateDeploymentTargets} from './smartthings-deployment.mjs';
import {firebaseConfig} from '../docs/firebase-config.mjs';

const root=new URL('../',import.meta.url);
const plan=JSON.parse(await readFile(new URL('server/deployment-config.json',root),'utf8'));
const targets=validateDeploymentTargets(plan,{firebaseProjectId:firebaseConfig.projectId});
const files={};
for(const name of serverBuildFiles){
  const from=new URL('server/'+name,root);
  if(!(await lstat(from)).isFile())throw Error('Build inputs must be regular files: '+name);
  files[name]=createHash('sha256').update(await readFile(from)).digest('hex');
}
const sourceHash=createHash('sha256').update(JSON.stringify(files)).digest('hex');
const folder=new URL('tmp/smartthings-deployment/'+sourceHash.slice(0,16)+'/',root);
const source=new URL('source/',folder);await mkdir(source,{recursive:true});
for(const name of serverBuildFiles)await copyFile(new URL('server/'+name,root),new URL(name,source));
const report={preparedAt:new Date().toISOString(),deploymentDecision:plan.state,targets,sourceHash,files,
  runtime:plan.runtime,redirectUri:plan.redirectUri,webhookUrl:plan.webhookUrl,
  publicApiDeployed:false,containerBuilt:false,billingChanged:false,secretsIncluded:false,
  outstanding:['Owner activation of billing for the disclosed projects','Current Samsung app permissions and API plan','Build and deploy the pinned container','Verify production IAM, retention and log filtering','Confirm Samsung webhook and actual user/device OAuth'],
};
await writeFile(new URL('manifest.json',folder),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({sourceDirectory:fileURLToPath(source),manifest:fileURLToPath(new URL('manifest.json',folder)),...report},null,2));
