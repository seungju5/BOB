import {afterEach,describe,expect,it,vi} from 'vitest';
import {advanceHearts,heartSummary} from '@/packages/walking-hearts/core.mjs';
import {validateHeartsSnapshot,heartsError} from '@/lib/hearts/client';
import {createHeartsDemo,actHeartsDemo,unlockDemoMessages,readHeartsDemo,saveHeartsDemo} from '@/lib/hearts/demo';
import {heartPathFill,validateHeartsLeague} from '@/lib/hearts/presentation';
import {createNativeHeartsTransport} from '@/lib/hearts/native';
import {createWalkingClient} from '@/lib/walking/client';

const now=new Date('2026-11-18T03:00:00Z'),date='2026-11-18';
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
describe('산책 하트 화면 데이터 경계',()=>{
  it('keeps unequal goal thresholds aligned with their five evenly spaced markers',()=>{
    expect([0,25,50,100,200,300].map(heartPathFill)).toEqual([0,25,50,75,100,100]);
    expect(heartPathFill(null)).toBe(0);expect(heartPathFill(75)).toBe(62.5);
  });
  it('retains confirmed zero and never replaces missing data with a synthetic count',()=>{
    const value=createHeartsDemo(now);value.state.days[date].count=null;
    expect(heartSummary(validateHeartsSnapshot(value).state!,date).count).toBeNull();
    value.state.days[date].count=0;
    expect(heartSummary(validateHeartsSnapshot(value).state!,date).count).toBe(0);
    expect(validateHeartsSnapshot({enabled:false,joined:false}).state).toBeNull();
  });
  it('rejects duplicate letters and external image URLs; preserves server redaction and permanent unlock',()=>{
    const value=createHeartsDemo(now);const message=value.messages[0];
    expect(validateHeartsSnapshot(value).messages[0].unlockedAt).toBe(now.toISOString());
    expect(()=>validateHeartsSnapshot({...value,messages:[message,message]})).toThrow();
    expect(()=>validateHeartsSnapshot({...value,messages:[{...message,photo:'https://other.example/track'}]})).toThrow();
    const redacted=validateHeartsSnapshot({...value,messages:[{...message,locked:true,text:null,photo:null,unlockedAt:null}]});
    expect(redacted.messages[0]).toMatchObject({locked:true,text:null,photo:null});
  });
  it('normalizes actual native/server week-score-isMe fields and omits private fields',()=>{
    const row={publicId:'p1',nickname:'햇살',score:200,rank:1,tier:0,isMe:true,uid:'private'};
    const value={enabled:true,week:'2026-11-16',weekEnd:'2026-11-22',region:'세종',total:1,entries:[row],practice:true};
    const result=validateHeartsLeague(value);
    expect(result).toMatchObject({weekStart:'2026-11-16',myPublicId:'p1',entries:[{points:200,region:'세종'}]});
    expect(JSON.stringify(result)).not.toContain('private');
    expect(()=>validateHeartsLeague({...value,total:2,entries:[row,row]})).toThrow();
    expect(()=>validateHeartsLeague({...value,entries:[{...row,score:2101}]})).toThrow();
  });
  it('keeps demo letters unlocked across midnight and step corrections',()=>{
    let value=createHeartsDemo(now);
    value=actHeartsDemo(value,'heartmessage',{text:'응원해요',unlockPercent:100},now);
    const id=value.messages[0].id;expect(value.messages[0].locked).toBe(true);
    expect(()=>actHeartsDemo(value,'heartread',{id},now)).toThrow('message_locked');
    value=unlockDemoMessages({...value,state:advanceHearts(value.state,{date,count:5000,now:now.getTime()+100})},now);
    expect(value.messages[0].unlockedAt).toBe(now.toISOString());
    value=unlockDemoMessages({...value,state:advanceHearts(value.state,{date,count:100,now:now.getTime()+1000})},new Date(now.getTime()+1000));
    expect(value.messages[0].locked).toBe(false);
    value=unlockDemoMessages({...value,state:advanceHearts(value.state,{date:'2026-11-19',count:null,now:'2026-11-19T03:00:00Z'})},new Date('2026-11-19T03:00:00Z'));
    expect(value.messages[0].locked).toBe(false);
  });
  it('persists purchased and equipped demo items without spending twice',()=>{
    const values=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(key:string)=>values.get(key),setItem:(key:string,value:string)=>values.set(key,value)});
    let value=createHeartsDemo(now);const before=value.state.balance;
    value=actHeartsDemo(value,'heartbuy',{itemId:'straw-hat'},now);value=actHeartsDemo(value,'heartequip',{itemId:'straw-hat'},now);
    value=actHeartsDemo(value,'heartbuy',{itemId:'straw-hat'},now);expect(value.state.balance).toBe(before-6);
    expect(saveHeartsDemo(value)).toBe(true);expect(readHeartsDemo(now).state.equipped.hat).toBe('straw-hat');
    expect([...values.keys()]).toEqual(['bapmunna.hearts.demo.v1']);
  });
  it('does not invent public consent for a private family join',async()=>{
    const fetcher=vi.fn<typeof fetch>(async()=>new Response(JSON.stringify({joined:true,nickname:'산책친구',publicId:'public-example',deviceConnected:false,sharingScope:'private'})));
    const client=createWalkingClient({provider:async()=>({getIdToken:async()=>'synthetic-token'}),fetcher});
    const result=await client.joinPrivate('synthetic-owner','산책친구');
    expect(result.sharingScope).toBe('private');
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toEqual({nickname:'산책친구',consentVersion:'2026-11-17-private',shareTodaySteps:true,shareRanking:false});
  });
});
describe('native bridge contention',()=>{
  it('retries only a busy read and never repeats a purchase',async()=>{
    vi.useFakeTimers();const busy=Object.assign(Error('busy'),{code:'request_busy'});
    const invoke=vi.fn().mockRejectedValueOnce(busy).mockResolvedValue({enabled:false,joined:false});
    const work=createNativeHeartsTransport(invoke).request('hearts');await vi.runAllTimersAsync();
    await expect(work).resolves.toMatchObject({joined:false});expect(invoke).toHaveBeenCalledTimes(2);
    const buy=vi.fn().mockRejectedValue(busy);await expect(createNativeHeartsTransport(buy).request('heartbuy',{itemId:'scarf'})).rejects.toBe(busy);expect(buy).toHaveBeenCalledTimes(1);
  });
  it('stops on cancellation, hides arbitrary errors, and rejects guardian writes on the device',async()=>{
    const invoke=vi.fn(),abort=new AbortController();abort.abort();
    await expect(createNativeHeartsTransport(invoke).request('hearts',undefined,abort.signal)).rejects.toMatchObject({name:'AbortError'});
    await expect(createNativeHeartsTransport(invoke).request('heartmessage',{text:'blocked'})).rejects.toThrow('guardian_only');
    expect(invoke).not.toHaveBeenCalled();expect(heartsError({code:'UNIMPLEMENTED'})).toContain('업데이트');
    expect(heartsError({code:'secret-private-error'})).not.toContain('secret');
  });
});
