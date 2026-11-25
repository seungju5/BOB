import test from 'node:test';
import assert from 'node:assert/strict';
import {advancePowerNotice, MEAL_RECORD_CONSENT, POWER_NOTICE_CONSENT, publicMealRecords} from '../power-notice.mjs';
import {pruneMealRecords, recentCookDate, rememberMealTarget} from '../meal-records.mjs';

const min = 60000, day = 24 * 60 * min;
const at = (date, hm) => Date.parse(date + 'T' + hm + ':00+09:00');
const anchor = at('2026-11-25','00:00');
const windows = [
  {slot:'breakfast',start:'00:00',end:'06:00'}, {slot:'lunch',start:'06:00',end:'10:00'},
  {slot:'dinner',start:'10:00',end:'14:00'}, {slot:'fourth',start:'14:00',end:'18:00'},
  {slot:'fifth',start:'18:00',end:'23:59'},
];
const prefs = {windows, updatedAt:new Date(anchor-2*day)};
function initial(grant = anchor) {
  return {stage:'connected',deviceIsVirtual:false,powerNotice:{version:POWER_NOTICE_CONSENT,
    component:'main',enabledAt:anchor-day,lastObservedAt:null,...(grant && {mealRecords:{version:MEAL_RECORD_CONSENT,enabledAt:grant,days:{}}})},
    powerChecks:{enabledAt:anchor-day,nextAt:anchor}};
}
function event(c, time, {arrival=time, high=true, source='webhook', settings=prefs, component='main'}={}) {
  const next = advancePowerNotice(c,{kind:'power',component,high,time},arrival,source,settings);
  if (next) c.powerNotice = next;
}
const days = (c, time) => publicMealRecords(c,time)?.days;

test('stores genuine runs per KST day and configured half-open slots, and exports only aggregates', () => {
  const c = initial();
  for (const h of ['05:59','06:00','06:21','06:40','10:00','14:00','18:00','23:59'])
    event(c,at('2026-11-25',h));
  const row = days(c,anchor+day-1)[0];
  assert.deepEqual(row,{date:'2026-11-25',windows,confirmed:windows.map(w => w.slot),cook:7});
  assert.equal(c.powerNotice.mealRecords.days[row.date].counts.lunch,2);
  const projection = JSON.stringify(days(c,anchor+day-1));
  for (const field of ['watts','lastHighAt','lastObservedAt','active','deviceId','enabledAt','counts'])
    assert(!projection.includes(field));
});

test('a poll arriving after midnight merges two starts across KST dates; replay and low signals add no meal', () => {
  const c = initial();
  const start = at('2026-11-25','23:52');
  event(c,start);
  event(c,start+18*min);
  assert.deepEqual(days(c,start+18*min).map(d=>[d.date,d.cook]),[['2026-11-25',1],['2026-11-26',1]]);
  event(c,start+9*min,{source:'poll',arrival:start+19*min});
  event(c,start+9*min,{source:'poll',arrival:start+19*min});
  event(c,start+20*min,{high:false});
  assert.deepEqual(days(c,start+20*min).map(d=>[d.date,d.cook,d.confirmed]),[['2026-11-25',1,['fifth']]]);
  assert.deepEqual(c.powerNotice.mealRecords.active,{date:'2026-11-25',slot:'fifth'});
});

test('two already-delivered notifications follow a later bridge into the previous day and expire independently', () => {
  const c = initial();
  const first = at('2026-11-25','23:52'), second = first + 18*min;
  const firstKey = 'local-receipt-a', secondKey = 'local-receipt-b';
  function delivered(key, observedAt) {
    const notice = c.powerNotice;
    notice.mealRecords = rememberMealTarget(notice.mealRecords,key,observedAt,observedAt);
  }
  event(c,first);
  delivered(firstKey,first);
  event(c,second);
  delivered(secondKey,second);
  delivered(secondKey,second);
  assert.deepEqual(c.powerNotice.mealRecords.activeRefs,[secondKey]);
  event(c,first+9*min,{source:'poll',arrival:second+min});
  for (const [key,expiry] of [[firstKey,first+day],[secondKey,second+day]])
    assert.deepEqual(c.powerNotice.mealRecords.targets[key],{date:'2026-11-25',slot:'fifth',until:expiry});
  assert.deepEqual(recentCookDate(c.powerNotice,second),{date:'2026-11-25'});
  assert.deepEqual(c.powerNotice.mealRecords.activeRefs,[firstKey,secondKey]);
  event(c,second+25*min);
  assert.deepEqual(c.powerNotice.mealRecords.activeRefs,[]);
  const records = c.powerNotice.mealRecords;
  const firstExpired = pruneMealRecords(records,first+day);
  assert.deepEqual(Object.keys(firstExpired.targets),[secondKey]);
  assert.equal(firstExpired.nextPurgeAt,second+day);
  const allExpired = pruneMealRecords(firstExpired,second+day);
  assert.deepEqual(allExpired.targets,{});
  assert.deepEqual(Object.keys(allExpired.days),['2026-11-25','2026-11-26']);
  assert.equal(allExpired.nextPurgeAt,anchor+35*day);
  assert.ok(!JSON.stringify(publicMealRecords(c,second+25*min)).includes(secondKey));
});

test('a later edit to the household schedule does not reorder the first known schedule of the same KST day', () => {
  const c = initial();
  const original = at('2026-11-25','09:00');
  event(c,original);
  const revised = {windows:[{slot:'dinner',start:'00:00',end:'23:59'}],updatedAt:new Date(original+10*min)};
  event(c,original+40*min,{settings:revised});
  event(c,original+day,{settings:revised});
  assert.deepEqual(days(c,original+day),[
    {date:'2026-11-25',windows,confirmed:['lunch'],cook:2},
    {date:'2026-11-26',windows:revised.windows,confirmed:['dinner'],cook:1},
  ]);
});

test('a delayed earlier first moves the confirmation, preserving other runs in its former slot', () => {
  const c = initial();
  event(c,at('2026-11-25','09:56'));
  event(c,at('2026-11-25','10:12'));
  // Bridge, then a different session crosses the next configured boundary backwards.
  event(c,at('2026-11-25','10:04'),{source:'poll',arrival:at('2026-11-25','10:13')});
  event(c,at('2026-11-25','14:01'));
  event(c,at('2026-11-25','13:59'),{arrival:at('2026-11-25','14:02')});
  assert.deepEqual(days(c,anchor+day-1).map(d=>[d.cook,d.confirmed]),[[2,['lunch','dinner']]]);
});

test('permits one to five windows, keeps each recorded date’s order and never reassigns an earlier day from newer settings', () => {
  for (let n=1;n<=5;n++) {
    const c = initial(), selected = windows.slice(-n);
    event(c,at('2026-11-25','18:00'),{settings:{...prefs,windows:selected}});
    const updated = {windows:[{slot:'lunch',start:'00:00',end:'19:00'}],updatedAt:new Date(anchor+day)};
    event(c,at('2026-11-26','18:00'),{settings:updated});
    const [old,today] = days(c,at('2026-11-26','18:01'));
    assert.deepEqual(old.windows,selected);
    assert.deepEqual(old.confirmed,['fifth']);
    assert.deepEqual(today.windows,updated.windows);
    assert.deepEqual(today.confirmed,['lunch']);
  }
  const c = initial();
  event(c,anchor+day-min,{arrival:anchor+day+min,settings:{windows,updatedAt:new Date(anchor+day)}});
  assert.deepEqual(days(c,anchor+day+min)[0],{date:'2026-11-25',cook:1,windows:[],confirmed:[]});
});

test('no guessed entries for old grants, stale samples, other components, virtual devices, or days without new evidence', () => {
  const previous = initial(null);
  event(previous,anchor);
  assert.equal(publicMealRecords(previous,anchor),null);
  previous.powerNotice.mealRecords={version:MEAL_RECORD_CONSENT,enabledAt:anchor+min,days:{}};
  event(previous,anchor+2*min);
  assert.deepEqual(days(previous,anchor+2*min),[]);
  for (const [opts,time] of [[{component:'other'},20],[{arrival:anchor+25*min},20],[{high:false},40]])
    event(previous,anchor+time*min,opts);
  assert.deepEqual(days(previous,anchor+day),[]);
  event(previous,anchor+day);
  assert.deepEqual(days(previous,anchor+35*day).map(d => d.date),['2026-11-26']);
  assert.deepEqual(days(previous,anchor+36*day),[]);
  const cleaned=pruneMealRecords(previous.powerNotice.mealRecords,anchor+36*day);
  assert.deepEqual(cleaned.days,{});
  assert.equal(cleaned.active,null);
  assert.equal(cleaned.nextPurgeAt,null);
  assert.equal(publicMealRecords({...previous,deviceIsVirtual:true},anchor+day),null);
  assert.equal(publicMealRecords({...previous,stage:'reconnect_required'},anchor+day),null);
});
