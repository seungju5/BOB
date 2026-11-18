import assert from 'node:assert/strict';
import {access,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

const execute=promisify(execFile);
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const repo=path.resolve(root,'../..');
const available=filename=>access(filename).then(()=>true,()=>false);

test('Android hearts policy and private/public consent exclude unapproved sharing, URLs, credentials, steps, and guardian actions',async t=>{
  const java=process.env.BAPMUNNA_JAVA_HOME??path.join(repo,'tmp/java21/jdk-21.0.13+9/Contents/Home');
  if(!await available(path.join(java,'bin/javac'))){t.skip('Local JDK needed; this does not verify a native Android build.');return;}
  await mkdir(path.join(root,'.local'),{recursive:true});const output=await mkdtemp(path.join(root,'.local/hearts-java-'));
  try{
    await execute(path.join(java,'bin/javac'),['-d',output,path.join(root,'android/src/main/java/com/bapmunna/phonesteps/HeartsRequestPolicy.java'),path.join(root,'android/src/main/java/com/bapmunna/phonesteps/WalkingSharingPolicy.java'),path.join(root,'tests/HeartsRequestCheck.java')]);
    const result=await execute(path.join(java,'bin/java'),['-cp',output,'com.bapmunna.phonesteps.HeartsRequestCheck']);
    assert.match(result.stdout,/passed/);
  }finally{await rm(output,{recursive:true,force:true});}
});

test('iOS hearts request and JSON boundary compile against actual Capacitor types',async t=>{
  const types=path.join(repo,'workspaces/bapmunna-mobile/node_modules/@capacitor/ios/Capacitor/Capacitor/JSTypes.swift');
  if(process.platform!=='darwin'||!await available(types)){t.skip('macOS Swift and installed Capacitor sources needed; this is not an iOS build.');return;}
  await mkdir(path.join(root,'.local'),{recursive:true});const output=await mkdtemp(path.join(root,'.local/hearts-swift-'));
  const common=['-swift-version','5','-module-cache-path',path.join(output,'cache')];
  try{
    await execute('/usr/bin/swiftc',[...common,'-emit-library','-emit-module','-module-name','Capacitor',types,path.join(path.dirname(types),'Codable/JSValueDecoder.swift'),'-emit-module-path',path.join(output,'Capacitor.swiftmodule'),'-o',path.join(output,'libCapacitor.dylib')]);
    await execute('/usr/bin/swiftc',[...common,'-I',output,'-L',output,'-lCapacitor',path.join(root,'ios/Sources/PhoneStepsPlugin/WalkingPayload.swift'),path.join(root,'ios/Sources/PhoneStepsPlugin/HeartsPayload.swift'),path.join(root,'tests/HeartsPayloadCheck.swift'),'-o',path.join(output,'check')]);
    const result=await execute(path.join(output,'check'),[],{env:{...process.env,DYLD_LIBRARY_PATH:output}});assert.match(result.stdout,/passed/);
  }finally{await rm(output,{recursive:true,force:true});}
});
