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
test('the inclusive ten-minute interval rolls forward from each high, never from a low',()=>{
  const c=initial();
  for (const m of [0,0,3,6]) report(c,m);
  report(c,7,{high:false}); report(c,9);
  assert.equal(c.powerNotice.lastObservedAt,start);
  report(c,14);
  assert.equal(c.powerNotice.lastObservedAt,start);
  for (const m of [15,16,17,18]) report(c,m,{high:false});
  report(c,24);
  assert.equal(c.powerNotice.lastObservedAt,start);
  const time=start+34*60000+1;
  const next=advancePowerNotice(c,{kind:'power',component:'main',high:true,time},time);
  assert.equal(next.lastObservedAt,time);
});
test('a scheduled snapshot can bridge on original time and rejects expired or pre-consent status',()=>{
  const window = 10*60000;
  const c = {...initial(),stage:'connected',powerChecks:{enabledAt:start,nextAt:start+window}};
  const event = {kind:'power',component:'main',high:true,time:start};
  assert.equal(advancePowerNotice(c,event,start+window,'poll').lastObservedAt,start);
  assert.equal(advancePowerNotice(c,event,start+window+1,'poll'),null);
  assert.equal(advancePowerNotice(c,{...event,time:start-1},start,'poll'),null);
  assert.equal(advancePowerNotice({...c,powerChecks:null},event,start,'poll'),null);
  report(c,0); report(c,18);
  const bridge = advancePowerNotice(c,{...event,time:start+9*60000},start+19*60000,'poll');
  assert.equal(bridge.lastObservedAt,start);
  assert.equal(bridge.lastHighAt,start+18*60000);
});
test('a fresh high delivered after a newer low counts once and a replay never rolls the notice back',()=>{
  const c=initial();
  report(c,2,{high:false});
  report(c,1,{},60000);
  assert.equal(c.powerNotice.lastObservedAt,start+60000);
  assert.equal(c.powerNotice.lastPowerAt,start+2*60000);
  assert.equal(report(c,1,{},60000),null);
  report(c,0,{},2*60000);
  assert.equal(c.powerNotice.lastObservedAt,start);
});

test('a fresh late measurement that bridges two groups restores the first instant; an expired event cannot',()=>{
  const c=initial();report(c,0);report(c,11);
  assert.equal(c.powerNotice.lastObservedAt,start+11*60000);
  report(c,9,{},2*60000);
  assert.equal(c.powerNotice.lastObservedAt,start);
  assert.equal(c.powerNotice.lastHighAt,start+11*60000);
  assert.equal(c.powerNotice.previousRun,undefined);
  report(c,22);report(c,26,{high:false});
  assert.equal(c.powerNotice.previousRun,undefined);
  assert.equal(report(c,20,{},6*60000),null);
});

test('an existing v2 notice with a missing last high can use its known qualifying time',()=>{
  const c=initial();
  Object.assign(c.powerNotice,{lastObservedAt:start,lastPowerAt:start+5*60000,lastHighAt:null});
  report(c,10);
  assert.equal(c.powerNotice.lastObservedAt,start);
});
