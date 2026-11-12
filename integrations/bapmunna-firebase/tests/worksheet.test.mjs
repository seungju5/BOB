import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {emptyPower,samplePower} from '../docs/power.mjs';
import {createState,ingestDevice,advance,evaluate,setDeviceOnline,setConsent,setAway,cancelAway,confirmMeal,mealStreak,report,status,DAY} from '../docs/engine.mjs';
import {setupDraft,validateSetup,applySetup,readSetupForm,patternComparison,dateInput,parseDateInput} from '../docs/worksheet.mjs';
const run=(s,w,n)=>{let result;for(let i=0;i<=n;i++){if(i)advance(s,1);result=ingestDevice(s,'cooker','power',w);}return result;};
const complete=s=>({...setupDraft(s),plug:true,wifi:true});
test('v1.1 defaults are two slots, 48h, 72h and household quantities',()=>{
  const s=createState();assert.equal(s.rules.consecutiveMissed,2);assert.equal(s.rules.inactiveHours,48);assert.equal(s.rules.followupHours,72);assert.equal(s.profile.residents,1);assert.equal(s.profile.pets,0);
});
test('800W is inclusive but 799W is not cooking; five one-minute readings match the canonical interval convention',()=>{
  for(const watts of [799,800,900]){const s=createState(false);run(s,watts,3);assert.equal(report(s,1)[0].cook,0);advance(s,1);ingestDevice(s,'cooker','power',watts);assert.equal(report(s,1)[0].cook,watts>=800?1:0);}
});
test('sustained high power is one confirmed cooking slot without a manual record',()=>{
  const s=createState(false);run(s,900,15);assert.equal(report(s,1)[0].cook,1);assert.equal(report(s,1)[0].confirmed,1);assert.equal(s.records['0:lunch'].manual,false);assert.equal(s.lastLidAt,null);
});
test('both 30W and 60W keep-warm boundaries are excluded from usage',()=>{
  for(const watts of [30,45,60]){const s=createState(false);run(s,watts,9);assert.equal(s.power.mode,'keep-warm');assert.equal(report(s,1)[0].cook,0);assert.equal(report(s,1)[0].signals,0);assert.equal(s.devices.cooker.lastActivity,null);}
});
test('a one-minute high-power spike does not count',()=>{
  const s=createState(false);run(s,900,1);advance(s,1);ingestDevice(s,'cooker','power',0);assert.equal(report(s,1)[0].cook,0);
});
test('more than the canonical maximum gap restarts observation',()=>{
  const s=createState(false);run(s,900,2);advance(s,5);ingestDevice(s,'cooker','power',900);assert.equal(report(s,1)[0].cook,0);run(s,900,5);assert.equal(report(s,1)[0].cook,1);
});
test('repeated or out-of-order sample times do not inflate duration',()=>{
  const first=samplePower(emptyPower(),900,10);for(const t of [10,9]){const next=samplePower(first.meter,900,t);assert.equal(next.ignored,true);assert.deepEqual(next.meter,first.meter);}
});
test('invalid samples are atomic',()=>{
  const s=createState(false),before=structuredClone(s);for(const w of [-1,3501,NaN,Infinity])assert.throws(()=>ingestDevice(s,'cooker','power',w));assert.deepEqual(s,before);
});
test('ten minutes of warm baseline then a rebound creates a canonical lid event',()=>{
  const s=createState(false);run(s,45,9);advance(s,1);ingestDevice(s,'cooker','power',180);assert.equal(s.power.possibleOpeningAt,s.now);assert.equal(report(s,1)[0].lid,1);assert.equal(report(s,1)[0].signals,1);assert.equal(s.lastLidAt,s.now);
});
test('a confirmed simulated opening resets the opening timer; cooking does not',()=>{
  const s=createState(false);ingestDevice(s,'cooker','lid');const opened=s.now;advance(s,1);run(s,900,5);assert.equal(s.lastLidAt,opened);advance(s,1);ingestDevice(s,'cooker','lid');assert.equal(s.lastLidAt,s.now);
});
test('48h and 72h boundaries are precise and acknowledgement does not hide escalation',()=>{
  const s=createState(false);ingestDevice(s,'cooker','lid');const start=s.now;s.now=start+48*60-1;evaluate(s);assert.equal(s.careAlerts.inactive,undefined);s.now++;evaluate(s);assert.equal(s.careAlerts.inactive.level,'attention');s.careAlerts.inactive.handled=true;s.now=start+72*60-1;evaluate(s);assert.equal(s.careAlerts.inactive.handled,true);s.now++;evaluate(s);assert.equal(s.careAlerts.emergency.level,'followup');assert.equal(s.careAlerts.emergency.handled,false);assert.match(s.careAlerts.emergency.detail,/자동 신고하지/);
});
test('couples and pets retain household-level warnings, not multiplied meals',()=>{
  const s=createState(false),d=complete(s);d.residents=2;d.pets=2;applySetup(s,d);ingestDevice(s,'cooker','lid');s.now+=48*60;evaluate(s);assert.ok(s.careAlerts.inactive);assert.match(s.careAlerts.inactive.detail,/가구/);assert.equal(s.profile.meals.length,3);assert.equal(s.profile.household,'together');
});
test('offline and reconnect restart observation instead of retroactive danger',()=>{
  const s=createState(false);run(s,900,4);setDeviceOnline(s,'cooker',false);s.now+=72*60;evaluate(s);assert.equal(s.careAlerts.inactive,undefined);assert.ok(s.careAlerts.offline);setDeviceOnline(s,'cooker',true);assert.equal(s.careAlerts.inactive,undefined);run(s,900,1);assert.equal(report(s,1)[0].cook,0);
});
test('away and return do not cause immediate inactivity escalation',()=>{
  const s=createState(false);setAway(s,s.now,s.now+4*DAY);s.now+=3*DAY;evaluate(s);assert.equal(s.careAlerts.inactive,undefined);cancelAway(s);assert.equal(s.careAlerts.inactive,undefined);
});
test('senior away and back actions reset the shared last-activity timer',()=>{
  const s=createState(false);ingestDevice(s,'cooker','lid');s.now+=48*60;setAway(s,s.now+DAY,s.now+2*DAY);assert.equal(s.careAlerts.inactive,undefined);cancelAway(s);assert.equal(s.lastActivityAt,s.now);
});
test('replacement travel dates clear obsolete future exclusions',()=>{
  const s=createState(false);setAway(s,DAY+420,DAY+900);assert.ok(s.records['1:breakfast'].exempt);setAway(s,2*DAY+420,2*DAY+900);assert.equal(s.records['1:breakfast'].exempt,false);assert.ok(s.records['2:breakfast'].exempt);
});
test('travel date limits are atomic and date conversions use the demo clock',()=>{
  const s=createState(false),before=structuredClone(s);for(const [a,b]of [[s.now-1,s.now+60],[s.now,s.now],[s.now,s.now+8*DAY],[s.now+31*DAY,s.now+31*DAY+60]])assert.throws(()=>setAway(s,a,b));assert.deepEqual(s,before);assert.equal(parseDateInput(dateInput(s.now)),s.now);assert.throws(()=>parseDateInput('2026-02-30T10:00'));assert.throws(()=>parseDateInput('bad'));
});
test('sharing withdrawal clears classifier and opening evidence',()=>{
  const s=createState();run(s,45,5);advance(s,1);ingestDevice(s,'cooker','power',180);setConsent(s,false);assert.equal(s.lastLidAt,null);assert.deepEqual(s.power,emptyPower());assert.deepEqual(s.deviceDays,{});s.now+=72*60;setConsent(s,true);assert.equal(s.careAlerts.inactive,undefined);
});
test('six missed slots work even with one planned meal per day',()=>{
  const s=createState(false),d=complete(s);d.meals=['lunch'];d.consecutiveMissed=6;applySetup(s,d);s.now+=6*DAY+120;evaluate(s);assert.equal(mealStreak(s),6);assert.ok(s.careAlerts.meals);
});
test('device evidence confirms a slot and stops consecutive no-news',()=>{
  const s=createState();advance(s,480);assert.equal(mealStreak(s),1);ingestDevice(s,'cooker','lid');advance(s,30);assert.equal(mealStreak(s),0);assert.equal(report(s,1)[0].confirmed,2);
});
test('unselected slots are neutral while existing self-reported evidence is preserved',()=>{
  const s=createState(false),d=complete(s);d.meals=['breakfast','dinner'];applySetup(s,d);advance(s,120);assert.equal(status(s,0,'lunch'),'unplanned');assert.equal(mealStreak(s),0);confirmMeal(s,'lunch');assert.equal(status(s,0,'lunch'),'confirmed');
});
test('setup requires both simulated connection checks',()=>{
  const s=createState(false),d=setupDraft(s);assert.throws(()=>validateSetup(d,0));d.plug=true;validateSetup(d,0);assert.throws(()=>validateSetup(d,1));d.wifi=true;validateSetup(d,1);
});
test('setup commits all values together and preserves records',()=>{
  const s=createState(),before=structuredClone(s.records),d=complete(s);Object.assign(d,{residents:2,pets:1,meals:['breakfast','dinner'],eatOutWeekly:1,keepWarm:false,cookWeekly:3,consecutiveMissed:3,inactiveHours:36,followupHours:60});applySetup(s,d);assert.equal(s.setup.complete,true);assert.equal(s.profile.pets,1);assert.equal(s.profile.cookWeekly,3);assert.equal(s.profile.keepWarm,false);assert.equal(s.rules.inactiveHours,36);assert.deepEqual(s.records,before);
});
test('invalid final setup never partially replaces existing settings',()=>{
  const s=createState(),before=structuredClone(s),d=complete(s);d.residents=2;d.followupHours=12;assert.throws(()=>applySetup(s,d));assert.deepEqual(s,before);
});
test('completing simulated connection after an outage resets the observation baseline',()=>{
  const s=createState(false);setDeviceOnline(s,'cooker',false);s.now+=3*DAY;applySetup(s,complete(s));assert.equal(s.online,true);assert.equal(s.devices.cooker.onlineSince,s.now);assert.equal(s.careAlerts.inactive,undefined);
});
test('invalid household, empty meal choices, excess eating out, overlap and habits are rejected',()=>{
  const s=createState();for(const [field,value,step]of [['residents',0,2],['pets',-1,2],['meals',[],3],['eatOutWeekly',22,3],['cookWeekly',22,4],['keepWarm','yes',4]]){const d=complete(s);d[field]=value;assert.throws(()=>validateSetup(d,step));}const d=complete(s);d.windows[0].end=700;assert.throws(()=>validateSetup(d,3));
});
test('returning to an earlier setup page can retain a draft without applying it',()=>{
  const s=createState(),d=complete(s);d.step=2;const next=readSetupForm(d,new Map([['residents','2'],['pets','1']]));assert.equal(next.residents,2);assert.equal(s.profile.residents,1);assert.equal(d.residents,1);
});
test('pattern compares recent seven days against the preceding twenty-eight days',()=>{
  const s=createState();const p=patternComparison(s);assert.equal(p.ready,true);s.records['-1:breakfast']={};const next=patternComparison(s);assert.equal(next.ready,true);assert.ok(next.after<p.after);assert.equal(next.before,p.before);
});
test('empty and private histories have no rates; away slots leave the denominator',()=>{
  assert.equal(patternComparison(createState(false)).ready,false);const s=createState();const total=patternComparison(s).recent.total;s.records['-1:lunch']={exempt:true};assert.equal(patternComparison(s).recent.total,total-1);setConsent(s,false);assert.equal(patternComparison(s).days,0);
});
test('worksheet controls are simulator-only and Senior has exactly three main choices',async()=>{
  const app=await readFile(new URL('../docs/app.mjs',import.meta.url),'utf8');const senior=app.slice(app.indexOf('function senior(){'),app.indexOf('function alertEntries(){'));for(const label of ['외식했어요','놀러가요','도움 요청'])assert.ok(senior.includes(label));const primary=senior.match(/<div class="senior-three"[\s\S]*?<\/div>/)?.[0]||'';assert.equal((primary.match(/<button/g)||[]).length,3);assert.ok(!senior.includes('data-action="confirm"'));assert.match(senior,/aria-label="확인 안내 닫기"/);
  const alerts=app.slice(app.indexOf('function alertEntries(){'),app.indexOf('function guardian(){'));assert.ok(!alerts.includes('state.alerts'));
  for(const name of ['power','worksheet','engine']){const code=await readFile(new URL('../docs/'+name+'.mjs',import.meta.url),'utf8');assert.doesNotMatch(code,/fetch\(|localStorage|sessionStorage|indexedDB/);}
});
test('portable build embeds the new modules and parses without duplicate identifiers',async()=>{
  const html=await readFile(new URL('../workshop/bapmunna.html',import.meta.url),'utf8');
  const script=html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];assert.ok(script);assert.ok(script.includes('function samplePower'));assert.ok(script.includes('function setupContent'));assert.doesNotMatch(html,/<link[^>]+href="\.\/worksheet.css"/);const result=spawnSync(process.execPath,['--check','--input-type=module'],{input:script,encoding:'utf8'});assert.equal(result.status,0,result.stderr);
});
