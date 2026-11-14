import {test} from 'node:test';import assert from 'node:assert/strict';
import {guardianAppTarget} from '../docs/guardian-entry.mjs';
const input={basePath:'/bapmunna/',edition:'carer',view:'guardian',cloud:true};
test('existing guardian and QR entries reach the complete app',()=>{
 assert.equal(guardianAppTarget(input),'/bapmunna/app/start/');
 assert.equal(guardianAppTarget({...input,view:'account'}),'/bapmunna/app/login/');
 assert.equal(guardianAppTarget({...input,view:'settings'}),'/bapmunna/app/settings/');
});
test('preserve OAuth return, privacy, device connection and separate edition routes',()=>{
 for(const view of ['connect','privacy','family','about'])assert.equal(guardianAppTarget({...input,view}),null);
 for(const search of ['?code=sample','?state=sample','?flow=sample','?oobCode=sample','?error=denied'])assert.equal(guardianAppTarget({...input,search}),null);
 for(const patch of [{demo:true},{cloud:false},{basePath:'/bapmunna/supabase/'},{edition:'senior'}])assert.equal(guardianAppTarget({...input,...patch}),null);
});
