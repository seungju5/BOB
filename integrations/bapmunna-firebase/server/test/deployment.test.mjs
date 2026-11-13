import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {serverBuildFiles,validateDeploymentTargets} from '../../scripts/smartthings-deployment.mjs';

const plan=JSON.parse(await readFile(new URL('../deployment-config.json',import.meta.url),'utf8'));
const live={firebaseProjectId:'ku-gpa',hostingSiteName:'projects/634921658163/sites/impact-series'};
test('deployment separates the Hosting runtime from the existing Firebase identity and data',()=>{
  const result=validateDeploymentTargets(plan,live);
  assert.equal(result.runtimeProjectId,'impact-series');assert.equal(result.firebaseProjectId,'ku-gpa');
  assert.equal(result.dataMigration,false);assert.deepEqual(result.billingRequiredFor,['impact-series','ku-gpa']);
});
test('deployment rejects a wrong site owner, runtime project or migrated identity',()=>{
  assert.throws(()=>validateDeploymentTargets({...plan,runtimeProjectId:'ku-gpa'},live));
  assert.throws(()=>validateDeploymentTargets(plan,{...live,hostingSiteName:'projects/344037918070/sites/impact-series'}));
  assert.throws(()=>validateDeploymentTargets({...plan,projectId:'impact-series'},live));
});
test('deployment preserves Samsung callback, read-only scope and explicit billing boundary',()=>{
  assert.throws(()=>validateDeploymentTargets({...plan,redirectUri:'https://other.test/callback'},live));
  assert.throws(()=>validateDeploymentTargets({...plan,scope:['x:devices:*']},live));
  assert.throws(()=>validateDeploymentTargets({...plan,billing:{...plan.billing,automaticUpgrade:true}},live));
  assert.throws(()=>validateDeploymentTargets({...plan,billing:{...plan.billing,requiredProjects:['impact-series']}},live));
});
test('container build context only includes the reviewed runtime, never local credentials',async()=>{
  const ignore=await readFile(new URL('../.dockerignore',import.meta.url),'utf8');
  const allowed=ignore.split('\n').filter(x=>x.startsWith('!')).map(x=>x.slice(1)).sort();
  assert.deepEqual(allowed,[...serverBuildFiles].sort());
  const dockerfile=await readFile(new URL('../Dockerfile',import.meta.url),'utf8');
  assert.doesNotMatch(dockerfile,/COPY\s+\*|COPY\s+\.\s/);
  assert.ok(!allowed.some(x=>/secret|\.env|private|node_modules|test\//.test(x)));
});
