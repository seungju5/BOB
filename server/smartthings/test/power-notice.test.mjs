import assert from 'node:assert/strict';
import test from 'node:test';
import { advancePowerNotice, POWER_NOTICE_CONSENT } from '../power-notice.mjs';
import { isCookingPower } from '../cooking-signal.mjs';

const start=1_800_000_000_000;
const initial=()=>({deviceIsVirtual:false,powerNotice:{version:POWER_NOTICE_CONSENT,enabledAt:start,component:'main',lastObservedAt:null}});
function report(connection, minute, extras={}, delay=0) {
  const time=start+minute*60000;
  const result=advancePowerNotice(connection,{kind:'power',component:'main',time,high:true,...extras},time+delay);
  if (result) connection.powerNotice=result;
  return result;
}
test('a single fresh measurement qualifies exactly at 700 W',()=>{
  for (const watts of [699.99,0,-1,NaN,Infinity,null,'700']) assert.equal(isCookingPower(watts),false);
  assert.equal(isCookingPower(700),true);
  const c=initial();
  report(c,0,{high:isCookingPower(699.99)});
  assert.equal(c.powerNotice.lastObservedAt,null);
  report(c,1,{high:isCookingPower(700)});
  assert.equal(c.powerNotice.lastObservedAt,start+60000);
});
test('opt-out, previous consent, virtual or unknown device, delayed and unrelated signals cannot notify',()=>{
  const c=initial();
  for (const extras of [{kind:'energy'},{component:'outlet2'},{high:null}]) assert.equal(report(c,15,extras),null);
  assert.equal(report(c,15,{},4*60000),null);
  assert.equal(report(c,-1),null);
  assert.equal(report({...c,deviceIsVirtual:true},15),null);
  assert.equal(report({...c,deviceIsVirtual:null},15),null);
  assert.equal(report({...c,powerNotice:{...c.powerNotice,version:'cooker-power-notice-v1'}},15),null);
  const off={powerNotice:null};assert.equal(report(off,15),null);
  assert.equal(c.powerNotice.lastObservedAt,null);
});
test('continuous observations and retries produce one notice; a gap or a long low run starts a new one',()=>{
  const c=initial();
  for (const m of [0,0,3,6]) report(c,m);
  report(c,7,{high:false}); report(c,9);
  assert.equal(c.powerNotice.lastObservedAt,start);
  report(c,14);
  assert.equal(c.powerNotice.lastObservedAt,start+14*60000);
  for (const m of [15,16,17,18]) report(c,m,{high:false});
  report(c,19);
  assert.equal(c.powerNotice.lastObservedAt,start+19*60000);
});
test('a fresh high delivered after a newer low counts once and a replay never rolls the notice back',()=>{
  const c=initial();
  report(c,2,{high:false});
  report(c,1,{},60000);
  assert.equal(c.powerNotice.lastObservedAt,start+60000);
  assert.equal(c.powerNotice.lastPowerAt,start+2*60000);
  assert.equal(report(c,1,{},60000),null);
  assert.equal(report(c,0,{},2*60000),null);
});
