import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzePowerHistory} from '../pilot/peak-history.mjs';
import {readMeterHistory} from '../pilot/history-source.mjs';

const start = Date.parse('2026-06-08T08:00:00+09:00');
const minute = 60000;
const now = start + 10 * 3600000;
const rows = Array.from({length: 45}, (_, i) => ({at: start + i * 10 * minute, watts: i % 5 === 0 ? 90 : 2}));
const withPower = changes => rows.map((p, i) => ({...p, watts: changes[i] ?? p.watts}));

test('uses the rise and recovery to detect lower-powered heating intervals and group sustained samples', () => {
  const samples = withPower({7: 350, 18: 255, 19: 270});
  const analysis = analyzePowerHistory([...samples.reverse(), samples[0]], now);
  assert.deepEqual(analysis.peaks, [{start:rows[7].at,end:rows[7].at},{start:rows[18].at,end:rows[19].at}]);
  assert.equal(analysis.observations.length, rows.length);
  assert.ok(analysis.observations.every(p => !p.cooking && !Object.hasOwn(p, 'watts')));
});
test('ignores recurring keep-warm, flat peaks, sparse data, unbounded edges and long gaps', () => {
  for (const items of [rows, rows.map(p => ({...p,watts:230})), rows.slice(0,5),
    withPower({0:450,44:500}), withPower({23:395}).filter((_,i) => i < 20 || i >= 23)]) {
    assert.deepEqual(analyzePowerHistory(items,now).peaks, []);
  }
});
test('700 W is inclusive; a neighboring sub-700 peak in the same run cannot become a second event', () => {
  const {observations,peaks} = analyzePowerHistory(withPower({7:699,19:500,20:700}),now);
  assert.deepEqual(peaks,[{start:rows[7].at,end:rows[7].at}]);
  assert.deepEqual(observations.filter(p => p.cooking),[{measuredAt:rows[20].at,cooking:true}]);
  assert.throws(() => analyzePowerHistory([...rows,{...rows[0],watts:300}],now),/Conflicting/);
  assert.throws(() => analyzePowerHistory([{at:now+1,watts:230}],now),/Invalid/);
});

test('the official history cursor preserves equal-time events and rejects other devices and stalled pages', async () => {
  const outlet = {deviceId:'chosen',locationId:'home',type:'MQTT',components:[{id:'main',categories:[{name:'SmartPlug',categoryType:'manufacturer'}],capabilities:[{id:'powerMeter'}]}]};
  const item = {deviceId:'chosen',component:'main',capability:'powerMeter',attribute:'power',unit:'W',value:250,epoch:start,time:new Date(start).toISOString(),hash:1};
  const calls = [];
  const pages = [[{...item,attribute:'energy',hash:2}], [item,{...item,deviceId:'other',value:450}], []];
  const client = {history:{async devices(params) { calls.push(params); return {items:pages.shift()}; }}};
  assert.deepEqual(await readMeterHistory(client,outlet,start-1000,start+1000),[{at:start,watts:250}]);
  assert.equal(calls[1].before,start); assert.equal(calls[1].beforeHash,2);
  assert.equal(calls[2].beforeHash,1);
  await assert.rejects(readMeterHistory(client,{...outlet,type:'VIRTUAL'},start-1000,start+1000),/physical/);
  await assert.rejects(readMeterHistory({history:{devices:async()=>({items:[item]})}},outlet,start-1000,start+1000),/advance/);
});
