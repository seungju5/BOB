import {test} from 'node:test';
import assert from 'node:assert/strict';
import {summarize,recentDays,filterCustomers,mergeCustomers,dayOf} from '../docs/manage/metrics.mjs';
const now=new Date('2026-10-16T15:01:00Z');
const people=[
 {id:'a',displayName:'김봄',email:'spring@example.test',stage:'new',createdAt:'2026-10-16T15:00:00Z',lastLoginAt:'2026-10-17T00:00:00+09:00'},
 {id:'b',displayName:'이여름',email:'SUMMER@example.test',stage:'contacted',createdAt:'2026-10-10T15:00:00Z',lastLoginAt:'2026-10-15T10:00:00+09:00'},
 {id:'c',displayName:'박가을',email:'fall@example.test',stage:'active',createdAt:{toDate:()=>new Date('2026-10-10T14:59:59Z')},lastLoginAt:null},
 {id:'d',displayName:'최겨울',email:'winter@example.test',stage:'paused',createdAt:null,lastLoginAt:null},
 {id:'e',displayName:'미래',email:'future@example.test',stage:'new',createdAt:'2026-10-18T00:00:00+09:00',lastLoginAt:null}
];
test('Korean calendar boundaries agree across ISO and Firestore timestamps',()=>{assert.equal(dayOf(people[0].createdAt),'2026-10-17');assert.equal(dayOf(people[2].createdAt),'2026-10-10');assert.equal(dayOf('invalid'),null);assert.equal(dayOf(null),null);});
test('seven and thirty day periods cross month boundaries correctly',()=>{assert.deepEqual(recentDays(3,new Date('2026-10-01T03:00:00Z')),['2026-09-29','2026-09-30','2026-10-01']);assert.equal(recentDays(30,now).length,30);});
test('new-member figures exclude future dates, missing dates and days before the period',()=>{const stats=summarize(people,7,now);assert.equal(stats.total,5);assert.equal(stats.newWeek,2);assert.equal(stats.periodTotal,2);assert.deepEqual(stats.stages,{new:2,contacted:1,active:1,paused:1});assert.equal(stats.trend.at(-1).count,1);});
test('empty dataset produces real zero counts rather than sample or percentage values',()=>{const stats=summarize([],30,now);assert.equal(stats.total,0);assert.equal(stats.periodTotal,0);assert.equal(stats.trend.length,30);assert.ok(stats.trend.every(item=>item.count===0));});
test('filters combine exact day, stage and case-insensitive name or email search',()=>{assert.deepEqual(filterCustomers(people,{query:'SUMMER',stage:'contacted',day:'2026-10-11'},now).map(p=>p.id),['b']);assert.equal(filterCustomers(people,{query:'SUMMER',stage:'active'},now).length,0);assert.equal(filterCustomers(people,{recent:true},now).length,2);});
test('sort has stable id tie breaking and handles unavailable login dates',()=>{const tie=[{...people[0],id:'x'},{...people[0],id:'y'}];assert.deepEqual(filterCustomers(tie).map(p=>p.id),['y','x']);assert.equal(filterCustomers(people,{sort:'login'})[0].id,'a');});
test('additional pages update duplicates without double-counting them',()=>{const merged=mergeCustomers(people,[{...people[0],stage:'active'},{id:'f',stage:'new'}]);assert.equal(merged.length,6);assert.equal(merged.find(p=>p.id==='a').stage,'active');});
test('changing an operational stage updates distribution without changing registrations',()=>{const updated=people.map(person=>person.id==='a'?{...person,stage:'active'}:person);assert.equal(summarize(updated,7,now).stages.active,2);assert.deepEqual(summarize(updated,7,now).trend,summarize(people,7,now).trend);});
