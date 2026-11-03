import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createState, ingestDevice, advance, confirmMeal, requestHelp, setConsent, setAway, evaluate, status, setDeviceOnline } from '../docs/engine.mjs';
import { canonicalAlertResult, canonicalDefaults } from '../docs/parity.mjs';
import { emptyPower, samplePower } from '../docs/power.mjs';
test('defaults are taken from canonical code', () => {
  const s=createState();const c=canonicalDefaults();assert.deepEqual(s.config.windows,c.windows);assert.equal(s.config.grace,0);assert.equal(s.rules.inactiveHours,c.fasting);
});
test('cook and lid both confirm the slot and update the activity clock', () => {
  for(const type of ['cook','lid']){const s=createState(false);ingestDevice(s,'cooker',type);assert.equal(status(s,0,'lunch'),'confirmed');assert.equal(s.lastActivityAt,s.now);}
});
test('eating out has its own status and resets activity, not lid time', () => {
  const s=createState(false);confirmMeal(s,'lunch',true);assert.equal(status(s,0,'lunch'),'eat_out');assert.equal(s.lastActivityAt,s.now);assert.equal(s.lastLidAt,null);
});
test('an out-of-window eat-out action goes to the closest canonical slot', () => {
  const s=createState(false);s.now=330;confirmMeal(s,'dinner',true);assert.equal(status(s,0,'breakfast'),'eat_out');assert.equal(status(s,0,'dinner'),'upcoming');
});
test('cooking recognized after a slot boundary belongs to its start time', () => {
  const s=createState(false);s.now=868;for(let i=0;i<5;i++){ingestDevice(s,'cooker','power',900);if(i<4)advance(s,1);}
  assert.equal(status(s,0,'lunch'),'confirmed');assert.equal(s.lastActivityAt,868);assert.equal(s.deviceDays[0].cooker.cook,1);
});
test('help remains visible even though the action resets the activity timer', () => {
  const s=createState(false);ingestDevice(s,'cooker','lid');s.now+=72*60;evaluate(s);assert.ok(s.careAlerts.emergency);requestHelp(s);assert.ok(s.careAlerts.help);assert.equal(s.careAlerts.emergency,undefined);
});
test('empty new history does not invent a last activity', () => {
  const s=createState(false);s.now+=72*60;evaluate(s);assert.equal(s.careAlerts.inactive,undefined);assert.equal(s.careAlerts.emergency,undefined);
});
test('device outage boundary is two hours, not instantaneous', () => {
  const s=createState(false);setDeviceOnline(s,'cooker',false);advance(s,119);assert.equal(s.careAlerts.offline,undefined);advance(s,1);assert.ok(s.careAlerts.offline);assert.deepEqual(canonicalAlertResult(s).create,['device_offline']);
});
test('during an absence incoming cooking evidence still confirms a meal', () => {
  const s=createState(false);setAway(s,s.now,s.now+1440);ingestDevice(s,'cooker','cook');assert.equal(status(s,0,'lunch'),'confirmed');assert.equal(s.careAlerts.inactive,undefined);
});
test('a four-hour cooking session is not repeatedly counted by the rolling buffer', () => {
  let meter=emptyPower(),count=0;for(let at=0;at<240;at++){const result=samplePower(meter,900,at);meter=result.meter;if(result.event==='cook')count++;}
  assert.equal(count,1);assert.ok(meter.samples.length<=90);
});
test('withdrawal removes synthetic samples and domain data', () => {
  const s=createState();ingestDevice(s,'cooker','power',900);setConsent(s,false);assert.deepEqual(s.power,emptyPower());assert.equal(s.lastActivityAt,null);assert.deepEqual(s.careAlerts,{});
});
test('original cooker logo and full bunny character remain selected', async () => {
  for(const name of ['bunny.png','bunny-natural.png','rice-logo.png','rice-companion.svg'])assert.ok((await readFile(new URL('../docs/assets/'+name,import.meta.url))).length>100);
  const app=await readFile(new URL('../docs/app.mjs',import.meta.url),'utf8');assert.ok(app.includes("bunny:'./assets/bunny.png'"));assert.ok(app.includes("logo:'./assets/rice-logo.png'"));
  const css=await readFile(new URL('../docs/character.css',import.meta.url),'utf8');assert.match(css,/prefers-reduced-motion:reduce/);
  assert.match(app,/new URL\(path,document\.baseURI\)\.href/,'assets must resolve before history-based role switching');
});
