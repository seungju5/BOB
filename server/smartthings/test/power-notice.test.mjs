import assert from 'node:assert/strict';
import test from 'node:test';
import { advancePowerNotice, highReading, POWER_NOTICE_CONSENT } from '../power-notice.mjs';

const start=1_800_000_000_000;
const initial=()=>({powerNotice:{version:POWER_NOTICE_CONSENT,enabledAt:start,component:'main',lastObservedAt:null}});
function report(connection, minute, extras={}, delay=0) {
  const time=start+minute*60000;
  const result=advancePowerNotice(connection,{kind:'power',component:'main',time,high:true,...extras},time+delay);
  if (result) connection.powerNotice=result;
  return result;
}
test('one high sample, virtual, delayed, wrong component or energy-only signals cannot create a notice',()=>{
  assert.equal(highReading(700),true);assert.equal(highReading(699),false);
  const c=initial();report(c,0);
  for (const extras of [{kind:'energy'},{component:'outlet2'},{high:null}]) assert.equal(report(c,15,extras),null);
  assert.equal(report(c,15,{},4*60000),null);
  assert.equal(report(c,-1),null);
  assert.equal(report({...c,deviceIsVirtual:true},15),null);
  const off={powerNotice:null};assert.equal(report(off,15),null);
  assert.equal(c.powerNotice.lastObservedAt,null);
});
test('gaps and low samples restart a run; only distinct recent measurements can complete it',()=>{
  const c=initial();
  for (const m of [0,3,6,12,15,18]) report(c,m);
  assert.equal(c.powerNotice.highSince,start+12*60000);
  report(c,18);report(c,17,{high:false},2*60000);
  assert.equal(c.powerNotice.highSince,null);
  for (const m of [19,22,25,28,31,34]) report(c,m);
  assert.equal(c.powerNotice.lastObservedAt,start+34*60000);
  report(c,35);assert.equal(c.powerNotice.lastObservedAt,start+34*60000);
  report(c,36,{high:false});
  for (const m of [37,40,43,46,49,52]) report(c,m);
  assert.equal(c.powerNotice.lastObservedAt,start+52*60000);
});
