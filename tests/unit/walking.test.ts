import {describe,it,expect,vi} from 'vitest';
import {validateWalkingBoard,validateWalkingPairing,validateWalkingProfile,walkingDate,walkingDemo} from '@/lib/walking/model';
import {createWalkingClient,walkingError,WALKING_API_ORIGIN} from '@/lib/walking/client';

const now=new Date('2026-11-17T05:00:00Z');
describe('walking rank data boundaries',()=>{
  it('uses one KST day across UTC midnight boundaries',()=>{
    expect(walkingDate(new Date('2026-11-17T14:59:59Z'))).toBe('2026-11-17');
    expect(walkingDate(new Date('2026-11-17T15:00:00Z'))).toBe('2026-11-18');
  });
  it('preserves competition ties and moves the explicit demo rank without affecting another result',()=>{
    const before=walkingDemo(2400,now),tied=walkingDemo(4800,now),first=walkingDemo(7000,now);
    expect(before.me.rank).toBe(4);expect(tied.entries.map(row=>row.rank)).toEqual([1,2,2,4]);expect(first.me.rank).toBe(1);
    expect(before.me.count).toBe(2400);expect(validateWalkingBoard(tied)).toEqual(tied);
  });
  it('distinguishes missing records from a confirmed zero and retains an exact rank below the first page',()=>{
    const noData={...walkingDemo(0,now),entries:[],total:0,me:{publicId:'demo-myself',nickname:'나의 예시',count:null,rank:null,lastSyncedAt:null}};
    expect(validateWalkingBoard(noData).me.count).toBeNull();
    expect(validateWalkingBoard(walkingDemo(0,now)).me.count).toBe(0);
    const outside={...walkingDemo(0,now),entries:walkingDemo(0,now).entries.slice(0,3),total:120,me:{...walkingDemo(0,now).me,rank:119}};
    expect(validateWalkingBoard(outside).me.rank).toBe(119);
  });
  it.each([-1,1.5,Number.NaN,Infinity,1_000_001])('rejects an invalid live step count %s',(count)=>{
    const bad=walkingDemo(2400,now);bad.entries[0].count=count;expect(()=>validateWalkingBoard(bad)).toThrow();
  });
  it('rejects unsorted records, duplicate identities, invented tie places and mismatched own totals',()=>{
    const a=walkingDemo(4800,now);a.entries[2].rank=3;expect(()=>validateWalkingBoard(a)).toThrow();
    const b=walkingDemo(2400,now);b.entries[1].publicId=b.entries[0].publicId;expect(()=>validateWalkingBoard(b)).toThrow();
    const c=walkingDemo(2400,now);[c.entries[0],c.entries[1]]=[c.entries[1],c.entries[0]];expect(()=>validateWalkingBoard(c)).toThrow();
    const d=walkingDemo(2400,now);d.me.count=2700;expect(()=>validateWalkingBoard(d)).toThrow();
    const e=walkingDemo(2400,now);e.me.count=null;expect(()=>validateWalkingBoard(e)).toThrow();
  });
  it('projects only expected public fields and never revives an inactive profile',()=>{
    const input=walkingDemo(2400,now);Object.assign(input.entries[0],{uid:'private-owner',email:'hidden@example.test'});
    const output=validateWalkingBoard(input);expect(JSON.stringify(output)).not.toContain('private-owner');expect(JSON.stringify(output)).not.toContain('hidden@');
    expect(validateWalkingProfile({joined:false,nickname:'previous user',count:5000})).toEqual({joined:false});
  });
  it('requires the declared timezone and a bounded pairing code',()=>{
    expect(()=>validateWalkingBoard({...walkingDemo(2400,now),timeZone:'America/New_York'})).toThrow();
    expect(validateWalkingPairing({code:'01234567',expiresAt:'2026-11-17T05:10:00Z'}).code).toBe('01234567');
    for(const code of ['123456','012345678','abcdefgh'])expect(()=>validateWalkingPairing({code,expiresAt:'2026-11-17T05:10:00Z'})).toThrow();
  });
});

describe('walking web authenticated client',()=>{
  const response=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
  it('binds a call to the expected account and carries its token only in the authorization header',async()=>{
    const getIdToken=vi.fn(async()=> 'synthetic-private-token');
    const fetcher=vi.fn<typeof fetch>(async()=>response({joined:false}));
    const client=createWalkingClient({provider:async()=>({getIdToken}),fetcher});
    await expect(client.profile('owner-A')).resolves.toEqual({joined:false});
    expect(getIdToken).toHaveBeenCalledWith('owner-A');
    const [url,options]=fetcher.mock.calls[0];expect(url).toBe(WALKING_API_ORIGIN+'/api/walking/profile');
    expect(options?.headers).toMatchObject({Authorization:'Bearer synthetic-private-token'});expect(options?.credentials).toBe('omit');expect(options?.redirect).toBe('error');
    expect(String(url)+String(options?.body)).not.toContain('synthetic-private-token');
  });
  it('does not dispatch a request after account-proof acquisition was cancelled',async()=>{
    let resolve!:(value:string)=>void;const token=new Promise<string>(yes=>{resolve=yes;});
    const fetcher=vi.fn<typeof fetch>();const abort=new AbortController();
    const client=createWalkingClient({provider:async()=>({getIdToken:async()=>token}),fetcher});
    const work=client.profile('old-owner',abort.signal);await Promise.resolve();await Promise.resolve();abort.abort();resolve('old-token');
    await expect(work).rejects.toMatchObject({name:'AbortError'});expect(fetcher).not.toHaveBeenCalled();
  });
  it('sends a separate explicit sharing consent and no household or health record on join',async()=>{
    const fetcher=vi.fn<typeof fetch>(async()=>response({joined:true,nickname:'햇살산책',publicId:'public-synthetic',deviceConnected:false}));
    const client=createWalkingClient({provider:async()=>({getIdToken:async()=> 'synthetic-token'}),fetcher});
    await client.join('owner',' 햇살산책 ');
    expect(JSON.parse(fetcher.mock.calls[0][1]!.body as string)).toEqual({nickname:'햇살산책',consentVersion:'2026-11-17',shareTodaySteps:true});
  });
  it('surfaces authorization errors without converting failures into empty success or demo data',async()=>{
    const client=createWalkingClient({provider:async()=>({getIdToken:async()=> 'synthetic-token'}),fetcher:async()=>response({error:'consent_required'},403)});
    await expect(client.board('owner')).rejects.toMatchObject({code:'consent_required'});
    expect(walkingError({code:'consent_required'})).toContain('동의');
    expect(walkingError({code:'raw-secret-must-not-be-shown'})).not.toContain('raw-secret');
  });
  it('rejects an unsuccessful withdrawal acknowledgement',async()=>{
    const client=createWalkingClient({provider:async()=>({getIdToken:async()=> 'synthetic-token'}),fetcher:async()=>response({ok:false})});
    await expect(client.leave('owner')).rejects.toThrow('invalid_response');
  });
});
