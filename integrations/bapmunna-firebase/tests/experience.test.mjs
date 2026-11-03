import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createState,ingestDevice,confirmMeal,setConsent,setAway,cancelAway,setDeviceOnline,requestHelp,resolveHelp,status,evaluate,advance} from '../docs/engine.mjs';
import {riceState} from '../docs/presentation.mjs';
import {mealEvidence,careHeadline,journeyScene,JOURNEY_SCENARIOS,reportDayAfterKey,awayPresetRange} from '../docs/experience.mjs';
import {editionView,editionFromLocation,initialEditionView} from '../docs/editions.mjs';

test('a new journey begins without lunch evidence; sending the signal fills its bowl',()=>{
  const before=journeyScene(0),after=journeyScene(1);
  assert.equal(status(before,0,'lunch'),'waiting');assert.equal(riceState(before,'lunch').level,'empty');
  assert.equal(status(after,0,'lunch'),'confirmed');assert.equal(riceState(after,'lunch').level,'full');assert.equal(after.devices.cooker.lastActivity,702);
});
test('today-only absence ends at midnight and starts now, never retroactively',()=>{
  assert.deepEqual(awayPresetRange(750,1),{start:750,end:1440});assert.deepEqual(awayPresetRange(1439,1),{start:1439,end:1440});
});
test('calendar-day shortcuts include today and remain within seven days',()=>{
  for(const days of [1,2,3,7]){const r=awayPresetRange(3*1440+750,days);assert.equal(r.end,(3+days)*1440);assert.ok(r.end-r.start<=7*1440);}
});
test('invalid absence presets cannot enter form state',()=>{
  for(const days of [0,4,8,1.5,'2',NaN])assert.throws(()=>awayPresetRange(750,days));
  for(const now of [-1,1.5,Infinity,NaN,Number.MAX_SAFE_INTEGER])assert.throws(()=>awayPresetRange(now,1));
});
test('absence preset uses the existing engine and early return keeps previous evidence',()=>{
  const s=journeyScene(1),range=awayPresetRange(s.now,2);setAway(s,range.start,range.end);
  assert.equal(status(s,0,'lunch'),'confirmed');assert.equal(status(s,0,'dinner'),'away');
  cancelAway(s);assert.equal(status(s,0,'lunch'),'confirmed');assert.equal(status(s,0,'dinner'),'upcoming');
});
test('report keyboard navigation moves chronologically and stays within the period',()=>{
  const days=[-3,-2,-1,0];assert.equal(reportDayAfterKey(days,-2,'ArrowRight'),-1);assert.equal(reportDayAfterKey(days,-2,'ArrowLeft'),-3);
  assert.equal(reportDayAfterKey(days,-3,'ArrowLeft'),-3);assert.equal(reportDayAfterKey(days,0,'ArrowRight'),0);
});
test('report keyboard Home and End jump to period boundaries with one tab stop',()=>{
  assert.equal(reportDayAfterKey([-2,-1,0],-1,'Home'),-2);assert.equal(reportDayAfterKey([-2,-1,0],-1,'End'),0);
  assert.equal(reportDayAfterKey([0],0,'ArrowLeft'),0);assert.equal(reportDayAfterKey([],0,'End'),null);assert.equal(reportDayAfterKey([0],0,'Escape'),null);
});
test('guardian story retains the same event and confirmation rather than fabricating new activity',()=>{
  assert.deepEqual(journeyScene(1),journeyScene(2));
});
test('scenario variations use the actual canonical outcomes',()=>{
  assert.equal(status(journeyScene(3,'ordinary'),0,'lunch'),'confirmed');
  assert.equal(status(journeyScene(3,'eatout'),0,'lunch'),'eat_out');
  assert.equal(status(journeyScene(3,'away'),0,'lunch'),'away');
  assert.equal(status(journeyScene(3,'offline'),0,'lunch'),'offline');
  assert.ok(journeyScene(3,'help').careAlerts.help);
});
test('offline scenario only surfaces a device problem, never an inactivity alert',()=>{
  const s=journeyScene(3,'offline');assert.ok(s.careAlerts.offline);assert.equal(s.careAlerts.inactive,undefined);assert.equal(s.careAlerts.emergency,undefined);assert.equal(careHeadline(s).tone,'quiet');
});
test('each scene is independent and repeatable, without mutating other demo data',()=>{
  const original=createState(),snapshot=structuredClone(original),one=journeyScene(1);one.records['0:lunch'].sensor=false;
  for(const scene of JOURNEY_SCENARIOS)journeyScene(3,scene.id);
  assert.deepEqual(original,snapshot);assert.equal(journeyScene(1).records['0:lunch'].sensor,true);
});
test('journey rejects invalid steps and scenarios',()=>{
  for(const value of [-1,4,1.5,NaN])assert.throws(()=>journeyScene(value));assert.throws(()=>journeyScene(3,'unknown'));
});
test('meal evidence explains device and direct reports separately',()=>{
  const s=createState(false);ingestDevice(s,'cooker','lid');confirmMeal(s,'lunch',true);
  const e=mealEvidence(s,0,'lunch');assert.equal(e.sources.length,2);assert.match(e.sources[0].label,/밥솥/);assert.match(e.sources[1].label,/외식/);assert.equal(e.window,'11:00–14:30');assert.equal(e.kind,'confirmed','canonical device evidence has priority, but both sources remain explainable');
});
test('meal evidence never invents exact eating time, portion or raw telemetry',()=>{
  const s=journeyScene(1),e=mealEvidence(s,0,'lunch');assert.deepEqual(Object.keys(e).sort(),['day','detail','kind','label','meal','sources','window']);assert.match(e.detail,/실제 섭취량/);
});
test('sharing withdrawal makes all evidence neutral',()=>{
  const s=journeyScene(1);setConsent(s,false);const e=mealEvidence(s,0,'lunch');assert.equal(e.kind,'private');assert.equal(e.sources.length,0);assert.equal(careHeadline(s).confirmed,0);
});
test('already confirmed evidence remains accessible while the device is offline',()=>{
  const s=journeyScene(1);setDeviceOnline(s,'cooker',false);advance(s,180);assert.equal(mealEvidence(s,0,'lunch').kind,'confirmed');assert.equal(mealEvidence(s,0,'lunch').sources.length,1);assert.match(careHeadline(s).title,/연결/);
});
test('unknown and future slots have meaningful neutral copy',()=>{
  const s=createState(false);assert.equal(mealEvidence(s,0,'dinner').kind,'upcoming');assert.equal(mealEvidence(s,-1,'lunch').kind,'unobserved');assert.throws(()=>mealEvidence(s,0,'snack'));assert.throws(()=>mealEvidence(s,0.5,'lunch'));
});
test('missing evidence does not claim an actual skipped meal',()=>{
  const s=createState(false);s.sharedFrom=0;s.now=900;evaluate(s);const e=mealEvidence(s,0,'lunch');assert.equal(e.kind,'missing');assert.match(e.detail,/실제 식사 여부는 직접/);assert.equal(e.sources.length,0);
});
test('help is the highest priority; acknowledgement removes the request headline',()=>{
  const s=journeyScene(3,'offline');requestHelp(s);assert.equal(careHeadline(s).tone,'attention');assert.match(careHeadline(s).title,/가족의 연락/);resolveHelp(s,'acknowledged');assert.match(careHeadline(s).title,/연결/);
});
test('sharing and absence suppress ordinary reassuring activity headlines',()=>{
  const s=journeyScene(1);setAway(s,s.now,s.now+100);assert.equal(careHeadline(s).tone,'away');setConsent(s,false);assert.match(careHeadline(s).title,/공유/);
});
test('a direct report without device evidence never claims a device movement',()=>{
  const s=createState(false);confirmMeal(s,'lunch',true);const headline=careHeadline(s);
  assert.equal(headline.confirmed,1);assert.match(headline.detail,/직접 남긴 소식/);assert.doesNotMatch(headline.detail,/움직임/);
});
test('headline and evidence selectors are read-only',()=>{
  const s=journeyScene(3,'help'),snapshot=structuredClone(s);careHeadline(s);mealEvidence(s,0,'lunch');assert.deepEqual(s,snapshot);
});
test('journey deep links work before role selection and in both editions',()=>{
  for(const role of [null,'senior','carer'])assert.equal(editionView(role,'journey'),'journey');
  const url=new URL('https://example.test/#journey');assert.equal(editionFromLocation(url),null);assert.equal(initialEditionView(url,null),'journey');
});
test('experience is network-free and cannot persist or notify',async()=>{
  const source=await readFile(new URL('../docs/experience.mjs',import.meta.url),'utf8');assert.doesNotMatch(source,/fetch\(|localStorage|sessionStorage|indexedDB|Notification|navigator|supabase|firebase/);
});
test('new screens preserve labels, touch controls, focus restoration and reduced motion',async()=>{
  const app=await readFile(new URL('../docs/app.mjs',import.meta.url),'utf8'),css=await readFile(new URL('../docs/experience.css',import.meta.url),'utf8');
  for(const text of ['밥 한 끼로 전하는 안부','안부가','폴짝,','나의 작은','data-meal-detail','aria-pressed','setup-welcome-next','wasModal&&focusReturn'])assert.ok(app.includes(text));
  assert.match(css,/prefers-reduced-motion:reduce/);assert.match(css,/max-width:360px/);assert.match(css,/min-height:44px/);
  assert.ok(app.includes("link?.classList.contains('skip-link')"));assert.ok(app.includes("main?.focus({preventScroll:true})"));
  assert.ok(!app.includes("setAttribute('href',routeHref('main'))"),'skip target is a document anchor, not a portable role route');
});
test('both generated editions and portable bundle include the experience layer',async()=>{
  for(const entry of ['senior/index.html','carer/index.html']){const html=await readFile(new URL('../docs/'+entry,import.meta.url),'utf8');assert.match(html,/experience.css/);}
  const html=await readFile(new URL('../workshop/bapmunna.html',import.meta.url),'utf8');assert.match(html,/function journeyScene/);assert.doesNotMatch(html,/<link[^>]+href="\.\/experience.css"/);
});
test('existing bunny decorates signal areas while preserving original artwork and evidence bowls',async()=>{
  const app=await readFile(new URL('../docs/app.mjs',import.meta.url),'utf8');
  const css=await readFile(new URL('../docs/character.css',import.meta.url),'utf8');
  assert.match(app,/companion:'\.\/assets\/bunny-natural\.png'/);
  for(const asset of ['bunny.png','bunny-natural.png','rice-logo.png','rice-companion.svg','rice-cooker-companion.png']){
    assert.ok((await readFile(new URL('../docs/assets/'+asset,import.meta.url))).length>0);
  }
  assert.match(app,/const bunnyCompanion=.*aria-hidden="true".*art\('companion',1254,1254\)/);
  assert.ok(app.includes("art(evidence.level,800,534,'','care-rice')"));
  assert.ok(app.includes("art(riceState(state,selected).level,120,80,'','quiet-rice')"));
  assert.ok(app.includes("art(evidence.level,800,534,'기록에 따라 달라지는 안부 밥그릇')"));
  assert.match(css,/\.care-hero-top \.bunny-portrait>img/);
  assert.match(css,/prefers-reduced-motion:reduce.*\.bunny-portrait\{animation:none/);
});
test('portable version embeds the bunny asset without an external request',async()=>{
  const png=await readFile(new URL('../docs/assets/bunny-natural.png',import.meta.url));
  assert.equal(png.toString('ascii',1,4),'PNG');
  const portable=await readFile(new URL('../workshop/bapmunna.html',import.meta.url),'utf8');
  assert.ok(portable.includes(`data:image/png;base64,${png.toString('base64')}`));
});
test('cooker brand and bunny companion remain distinct across entry pages and auth',async()=>{
  for(const path of ['index.html','senior/index.html','carer/index.html','manage/index.html']){
    const source=await readFile(new URL('../docs/'+path,import.meta.url),'utf8');
    assert.match(source,/rice-logo\.png/);assert.match(source,/brand-symbol/);
  }
  const app=await readFile(new URL('../docs/app.mjs',import.meta.url),'utf8');
  assert.match(app,/logo:'\.\/assets\/rice-logo\.png'/);
  assert.equal((app.match(/\$\{brandSymbol\(\)\}/g)||[]).length,4);
  assert.match(app,/const brandSymbol=.*aria-hidden="true"/);
  const css=await readFile(new URL('../docs/brand.css',import.meta.url),'utf8');
  assert.match(css,/\.brand-symbol>img\{[^}]*width:100%/);
  assert.doesNotMatch(css,/\.brand-symbol[^}]*animation:/,'the logo stays still');
});
