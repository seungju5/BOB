'use client';

import Link from 'next/link';
import { PRIVACY_SUPPORT_EMAIL } from '@/lib/privacy/notice';
import {useCallback,useEffect,useRef,useState} from 'react';
import {PhoneSteps} from '@bapmunna/phone-steps';
import {Logo} from '@/components/Mascot';
import {HEART_ITEMS,HEART_LEAGUE_TIERS,advanceHearts,createHeartState,heartDate,heartSummary,type HeartLeague} from '@/packages/walking-hearts/core.mjs';
import {HEARTS_CONSENT,heartsError,validateHeartsSnapshot,type HeartAction,type HeartMessage,type HeartsSnapshot,type HeartTransport} from '@/lib/hearts/client';
import {actHeartsDemo,createHeartsDemo,demoLeague,readHeartsDemo,readStoredHeartsDemo,saveHeartsDemo,type HeartsDemo} from '@/lib/hearts/demo';
import {applyHeartOutfit,heartOutfitPlan,saveWithWardrobeLock,type LookChanges} from '@/lib/walking/wardrobe';
import {WarmingWardrobe} from './WarmingWardrobe';
import {HeartIcon,HeartsGarden} from './HeartsScene';
import {validateHeartsLeague} from '@/lib/hearts/presentation';
import {unlockDemoMessages} from '@/lib/hearts/demo';
import {linkedOutfit,setOutfitLink} from './OutfitLookbook';
import './hearts.css';

type Tab='today'|'family'|'closet'|'league';
type League=HeartLeague&{myPublicId?:string;practice?:boolean;minimumForPromotion?:number;promotion?:unknown};
const terminalConnectionError=(reason:unknown)=>/device_expired|device_revoked|unauthorized|login_required|auth\/user-changed|participation_required|not_joined|confirmation_required|revocation_pending/.test(String(reason&&typeof reason==='object'&&'code'in reason?reason.code:reason instanceof Error?reason.message:''));
type Props={mode:'demo'|'web'|'native';transport?:HeartTransport;embedded?:boolean};
const EMPTY:HeartsSnapshot={enabled:false,joined:false,state:null,messages:[],leagueEnabled:false,region:''};
const num=(n:number)=>n.toLocaleString('ko-KR');

export function HeartsExperience({mode,transport,embedded=false}:Props){
  const [snapshot,setSnapshot]=useState<HeartsSnapshot>(EMPTY),[loaded,setLoaded]=useState(false),[busy,setBusy]=useState(false);
  const [error,setError]=useState(''),[notice,setNotice]=useState(''),[tab,setTab]=useState<Tab>('today');
  const [today,setToday]=useState(''),[league,setLeague]=useState<League|null>(null),[settings,setSettings]=useState(false);
  const [openMessage,setOpenMessage]=useState<HeartMessage|null>(null);
  const [demoFamily,setDemoFamily]=useState(false);
  const current=useRef(snapshot),life=useRef({active:true,revision:0,busy:false,abort:new AbortController()});
  const demo=mode==='demo',guardian=mode==='web'||demo&&demoFamily;
  const date=today||'2026-01-01';
  const state=snapshot.state??createHeartState({date});
  const summary=heartSummary(state,date);
  const visibleMessages=snapshot.messages;
  const unread=visibleMessages.filter(m=>!m.readAt).length;

  const refresh=useCallback(async()=>{
    const run=life.current;if(!run.active||run.busy)return;
    const revision=run.revision;
    if(!transport)return;
    try{
      const next=validateHeartsSnapshot(await transport.request('hearts',undefined,run.abort.signal));
      if(run.active&&run.revision===revision){current.current=next;setSnapshot(next);setError('');}
    }catch(reason){if(run.active&&run.revision===revision){if(terminalConnectionError(reason)){life.current.revision++;life.current.abort.abort();life.current.abort=new AbortController();setBusy(false);setLoaded(true);current.current=EMPTY;setSnapshot(EMPTY);setOpenMessage(null);setLeague(null);setSettings(false);}setError(heartsError(reason));}}
    finally{if(run.active&&run.revision===revision)setLoaded(true);}
  },[transport]);

  useEffect(()=>{
    const live={active:true,revision:0,busy:false,abort:new AbortController()};life.current=live;
    function openLinkedFitting() {
      const style = linkedOutfit(window.location.search, true);
      if (!style) return;
      setTab('closet');
    }
    window.addEventListener('popstate',openLinkedFitting);
    const initial=setTimeout(()=>{
      openLinkedFitting();
      setToday(heartDate(new Date()));
      if(demo){const next=readHeartsDemo();current.current=next;setSnapshot(next);setLoaded(true);}else if(transport)void refresh();else setLoaded(true);
    },0);
    const tick=()=>{if(document.visibilityState!=='visible')return;setToday(heartDate(new Date()));if(!demo)void refresh();};
    const timer=setInterval(tick,60000);window.addEventListener('focus',tick);document.addEventListener('visibilitychange',tick);
    return()=>{live.active=false;live.revision++;live.abort.abort();clearTimeout(initial);clearInterval(timer);window.removeEventListener('focus',tick);window.removeEventListener('popstate',openLinkedFitting);document.removeEventListener('visibilitychange',tick);};
  },[demo,refresh,transport]);

  async function run(action:HeartAction,body:Record<string,unknown>={},success='저장했어요.'){
    const live=life.current;if(!live.active||live.busy)return;
    live.busy=true;const revision=++live.revision;setBusy(true);setError('');setNotice('');
    try{
      if(demo){const next=actHeartsDemo(current.current as HeartsDemo,action,body);current.current=next;setSnapshot(next);if(!saveHeartsDemo(next))setNotice('이 브라우저에 저장하지 못했어요. 지금 화면에서 체험할 수 있어요.');else setNotice(success);}
      else if(transport){
        const result=await transport.request(action,body,live.abort.signal);
        const next=action==='heartleave'?EMPTY:validateHeartsSnapshot(result);
        if(live.active&&live.revision===revision){current.current=next;setSnapshot(next);setNotice(success);}
      }
      else return false;
      return live.active && life.current===live && live.revision===revision;
    }catch(reason){if(live.active&&live.revision===revision){if(terminalConnectionError(reason)){life.current.revision++;life.current.abort.abort();life.current.abort=new AbortController();setBusy(false);setLoaded(true);current.current=EMPTY;setSnapshot(EMPTY);setOpenMessage(null);setLeague(null);setSettings(false);}setError(heartsError(reason));}return false;}
    finally{live.busy=false;if(live.active&&live.revision===revision)setBusy(false);}
  }
  useEffect(()=>{
    if(!settings&&!openMessage)return;
    const originalOverflow=document.body.style.overflow;document.body.style.overflow='hidden';
    const key=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){setSettings(false);setOpenMessage(null);return;}
      if(event.key!=='Tab')return;
      const dialog=document.querySelector<HTMLElement>('.hearts-dialog');
      const controls=dialog?Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary')).filter(el=>el.getClientRects().length):[];
      const first=controls[0],last=controls.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    };
    document.addEventListener('keydown',key);
    return()=>{document.body.style.overflow=originalOverflow;document.removeEventListener('keydown',key);document.querySelector<HTMLElement>('.hearts-tabs [aria-current="page"]')?.focus();};
  },[settings,openMessage]);
  function updateDemo(count:number|null,cooking?:boolean){
    if(!demo||busy||!snapshot.enabled)return;
    const next=unlockDemoMessages({...snapshot,state:advanceHearts(state,{date,count,...(cooking!==undefined?{cooking}:{}),now:new Date()})} as HeartsDemo,new Date());
    current.current=next;setSnapshot(next);saveHeartsDemo(next);
  }
  useEffect(()=>{
    if(tab!=='league')return;
    const live=life.current,revision=live.revision;let active=true;
    void Promise.resolve().then(async()=>{
      if(!active||!live.active)return;
      if(!snapshot.leagueEnabled){setLeague(null);return;}
      if(demo){setLeague(demoLeague(current.current as HeartsDemo,date));return;}
      if(!transport)return;
      setLeague(null);
      try{const value=await transport.request('heartleague',undefined,live.abort.signal);if(active&&live.active&&live.revision===revision)setLeague(validateHeartsLeague(value));}
      catch(reason){if(active&&live.active)setError(heartsError(reason));}
    });
    return()=>{active=false;};
  },[tab,snapshot.leagueEnabled,snapshot.region,demo,date,transport]);
  function switchTab(next:Tab){if(next!=='closet')setOutfitLink(null);setTab(next);}
  async function saveOutfit(changes: LookChanges) {
    const live = life.current;
    const activeState = current.current.state;
    if (!live.active || live.busy || !activeState) return false;
    try {
      if (demo) {
        const saved = await saveWithWardrobeLock('demo', () => {
          if (!live.active || life.current !== live) return false;
          const latest = readStoredHeartsDemo() ?? current.current as HeartsDemo;
          current.current = latest;
          setSnapshot(latest);
          const next = { ...latest, state: applyHeartOutfit(latest.state, changes) };
          current.current = next;
          setSnapshot(next);
          setError('');
          setNotice(saveHeartsDemo(next) ? '예시 산책에 고른 차림을 입혔어요.' : '이번 방문 동안 예시 차림을 입어요. 브라우저에 저장하지 못했어요.');
          return true;
        });
        if (!saved || !live.active) return false;
      } else {
        if (!transport) return false;
        for (const action of heartOutfitPlan(activeState, changes)) {
          if (!live.active || life.current !== live) return false;
          if (action.buy && !await run('heartbuy', { itemId: action.buy }, '')) return false;
          if (!live.active || life.current !== live) return false;
          if (!await run('heartequip', { itemId: action.equip }, '')) return false;
        }
        if (!live.active || life.current !== live) return false;
        setNotice('산책에 고른 차림을 입혔어요.');
      }
      setTab('today');
      return true;
    } catch (reason) {
      if (live.active) setError(heartsError(reason));
      return false;
    }
  }
  const heading=tab==='family'?'가족의 응원':tab==='closet'?'워밍이의 하트 옷장':tab==='league'?'밥심 리그':'오늘의 산책';
  const content=<>
    {!embedded?<header className="hearts-header"><Logo/><div><Link href="/more" className="hearts-header-link">메뉴</Link><button onClick={()=>setSettings(true)} aria-label="산책 하트 설정">⚙<span className="sr-only">설정</span></button></div></header>:<div className="hearts-embedded-heading"><h2>산책 하트</h2><button onClick={()=>setSettings(true)}>설정</button></div>}
    {demo?<aside className="hearts-demo-label"><strong>예시 체험</strong><span>가상 걸음·가상 가족이에요</span></aside>:null}
    {error?<div className="hearts-status is-error" role="alert"><p>{error}</p>{!demo?<button disabled={busy} onClick={()=>void refresh()}>다시 확인</button>:null}</div>:null}
    {notice?<p className="hearts-status" role="status">{notice}</p>:null}
    {tab==='today'?<HeartsGarden summary={summary}/>:<h1 className="hearts-page-title">{heading}</h1>}

    {!loaded?<p className="hearts-card" role="status">오늘의 산책을 준비하고 있어요…</p>:null}
    {loaded&&!snapshot.joined?<section className="hearts-card hearts-setup">
      <span className="hearts-eyebrow">원하는 분만, 가볍게 시작해요</span><h2>내 걸음으로 하트를 채워요</h2>
      {transport&&!error?<HeartsConsent busy={busy} native={mode==='native'} onJoin={body=>void run('heartjoin',body,'산책 하트를 켰어요. 오늘 기록이 도착하면 자동으로 채워져요.')}/>:<>
        <p>취사 소식과 오늘의 걸음으로 하트가 채워지고, 가족의 응원이 도착해요.</p>
        {mode==='native'?<a className="hearts-primary" href="#native-ranking-title">휴대폰 연결부터 확인하기</a>:<Link className="hearts-primary" href="/walking/connect">계정·휴대폰 연결하기</Link>}
        {mode==='native'?<button className="hearts-secondary" onClick={()=>void PhoneSteps.openWalkingWebApp().catch(reason=>setError(heartsError(reason)))}>웹앱에서 산책 체험·연결 안내</button>:<Link className="hearts-secondary" href="/walking/demo">산책 하트 먼저 체험하기</Link>}
      </>}
    </section>:null}
    {snapshot.joined&&!snapshot.enabled?<section className="hearts-card"><h2>산책 하트를 쉬고 있어요</h2><p>새 기록과 하트는 모으지 않아요. 모아 둔 하트와 옷은 남아 있어요.</p><button className="hearts-primary" disabled={busy} onClick={()=>void run('heartsettings',{enabled:true},'산책 하트를 다시 켰어요.')}>다시 켜기</button></section>:null}

    {snapshot.joined?<>
      <nav className="hearts-tabs" aria-label="산책 메뉴">{([{key:'today',label:'산책',icon:'☀'},{key:'family',label:'가족 응원',icon:'✉'},{key:'closet',label:'꾸미기',icon:'♧'},{key:'league',label:'주간 리그',icon:'♜'}] as const).map(item=><button key={item.key} aria-current={tab===item.key?'page':undefined} onClick={()=>switchTab(item.key)}><span aria-hidden="true">{item.icon}</span>{item.label}{item.key==='family'&&unread?<i aria-label={`새 응원 ${unread}개`}>{unread}</i>:null}</button>)}</nav>
      {tab==='today'?<>
        <section className="hearts-today-stats"><div><HeartIcon filled/><span>이번 달 모은 하트<strong>{num(summary.monthEarned)}개</strong></span></div><div><span aria-hidden="true">🍚</span><span>밥솥·외식 소식<strong>{summary.streak?`${num(summary.streak)}일 이어졌어요`:'소식을 기다려요'}</strong></span></div></section>
        {guardian&&summary.percent!==null&&summary.percent>=50?<section className="hearts-card"><h2>오늘 {summary.percent>=200?'200':summary.percent>=100?'100':'50'}%까지 걸으셨어요</h2><p>작은 산책이 반가운 안부가 됐어요. 칭찬 한마디를 남겨볼까요?</p><button className="hearts-primary" onClick={()=>switchTab('family')}>가족에게 응원 남기기</button></section>:null}
        <button className="hearts-letter-card" onClick={()=>switchTab('family')}><span className="hearts-letter-illustration" aria-hidden="true">💌</span><span><strong>{unread?`가족 응원 ${unread}개가 왔어요`:'가족의 마음을 담는 곳'}</strong><small>{unread?'산책길에 따뜻한 마음을 열어봐요':'작은 칭찬 한마디를 나눠요'}</small></span><span aria-hidden="true">›</span></button>
        <button className="hearts-wardrobe-link" onClick={()=>switchTab('closet')}><span>워밍이의 하트 옷장 열기</span><strong><HeartIcon filled/>{num(summary.balance)} <span aria-hidden="true">›</span></strong></button>
        {summary.percent!==null&&summary.percent>=100?<p className="hearts-rest-note">목표를 채웠어요. 더 걷지 않아도 충분해요.<br/>불편한 날은 편하게 쉬세요.</p>:null}
        <details className="hearts-explainer"><summary>하트는 어떻게 채워지나요?</summary><p>취사 소식과 25%·50%·100%·200% 단계를 저절로 표시해요. 취사는 실제 식사 완료를 뜻하지 않아요. 취사 소식이 없어도 산책 하트는 받을 수 있어요.</p><p>50%까지 꾸미기 하트 1개, 100%까지 총 3개, 200%까지 총 5개예요. 같은 기록으로 두 번 받지 않아요. 오늘의 진행은 한국 시간 자정에 새로 시작하고 모은 하트와 옷은 남아요.</p><p>목표는 내가 정한 걸음 수예요. 식사량·칼로리를 추정하지 않으며, 몸 상태에 맞게 설정해 주세요.</p></details>
      </>:null}
      {tab==='family'?<section className="hearts-family">
        <p className="hearts-intro">멀리 있어도, 마음은 가까이.<br/>오늘의 작은 응원을 열어봐요.</p>
        {!visibleMessages.length?<div className="hearts-card"><span className="hearts-empty-icon" aria-hidden="true">💌</span><h2>응원을 기다리고 있어요</h2><p>연결된 가족이 편지를 남기면 이곳에 도착해요.</p></div>:<ul className="hearts-letter-list">{visibleMessages.map(message=><li key={message.id}><button onClick={()=>{if(message.locked){setNotice(`${message.unlockPercent}% 산책 단계에서 열리는 선물상자예요. 바로 볼 수 있는 응원은 아래에서 따로 받아볼 수 있어요.`);return;}setOpenMessage(message);void run('heartread',{id:message.id},'가족의 응원을 열었어요.');}}><span aria-hidden="true">{message.locked?'🎁':message.type==='gift'?'🧣':'💌'}</span><span><strong>{message.locked?`${message.unlockPercent}%에 열리는 선물상자`:message.type==='gift'?'토끼에게 선물이 왔어요':'가족의 응원이 도착했어요'}</strong><small>{new Date(message.createdAt).toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric'})} · {message.locked?'아직 닫혀 있어요':message.readAt?'다시 읽기':'새 응원'}</small></span><span aria-hidden="true">›</span></button></li>)}</ul>}
        {demo?<label className="hearts-check hearts-card"><input type="checkbox" checked={demoFamily} onChange={event=>setDemoFamily(event.target.checked)}/><span>가상 보호자 화면도 체험하기</span></label>:null}
        {guardian?<FamilyComposer busy={busy} onSend={body=>run('heartmessage',body,demo?'가상 가족 응원함에 담았어요. 실제로 전송하지 않았어요.':'연결된 휴대폰의 가족 응원함에 담았어요. 앱을 열면 볼 수 있어요.')} onGift={id=>run('heartgift',{itemId:id},'모은 하트로 선물을 담았어요.')} balance={summary.balance} owned={summary.owned}/>:null}
        <p className="hearts-small">가족 응원은 연결된 계정과 휴대폰 안에서만 보여요. 별도 잠금화면 푸시 발송을 뜻하지 않아요.</p>
      </section>:null}
      {tab==='closet'?<section className="ward-hearts-closet">
        <WarmingWardrobe equipped={summary.equipped} items={HEART_ITEMS} wallet={{balance:summary.balance,owned:summary.owned}}
          busy={busy} onSave={saveOutfit} onCancel={()=>switchTab('today')}/>
        {!embedded && <Link className="hearts-text-button" href="/walking/wardrobe">무료 기본 옷장 열기</Link>}
      </section>:null}
      {tab==='league'?<section className="hearts-league"><p className="hearts-intro">함께 걷는 즐거움, 선택해서 나눠요.</p>
        {!snapshot.leagueEnabled?<div className="hearts-card"><h2>순위 없이 걸어도 좋아요</h2><p>주간 리그는 별도로 참여한 분끼리 별명·하트 점수·선택한 지역을 나눠요.</p><button className="hearts-primary" onClick={()=>setSettings(true)}>주간 리그 참여 설정</button></div>:league?<>
          <div className="hearts-league-head"><span aria-hidden="true">🌾 🍙 🍚 🍱 👑</span><h2>밥심 리그</h2><p>{league.weekStart} ~ {league.weekEnd}</p><span>{league.total}명과 함께해요 · {league.total<10?'천천히 모이는 연습 리그':'같은 지역의 작은 리그'}</span></div>
          <ol className="hearts-league-list">{league.entries.filter((entry,index,rows)=>entry.rank<=3||entry.publicId===league.myPublicId||Math.abs(index-rows.findIndex(e=>e.publicId===league.myPublicId))<=1).map(entry=><li key={entry.publicId} className={entry.publicId===league.myPublicId?'is-me':''}><span className="hearts-rank">{entry.rank<=3?['🥇','🥈','🥉'][entry.rank-1]:'🌱'}</span><span><strong>{entry.nickname}{entry.publicId===league.myPublicId?' · 나':''}</strong><small>{HEART_LEAGUE_TIERS[entry.tier]??HEART_LEAGUE_TIERS[0]} · {entry.region||'함께 걷는 동네'}</small></span><strong>{num(Math.floor(entry.points))}<small>하트 점수</small></strong></li>)}</ol>
          <p className="hearts-small">월요일부터 일요일까지 하루 최대 300점이 모여요. 10명 이상인 리그의 상위 3명은 다음 주에 올라가요. 등급이 내려가지는 않아요.</p><p className="hearts-rest-note">순위보다 내 몸이 편한 속도가 먼저예요.<br/>이번 주도 잘하고 계세요.</p>
        </>:<p role="status" className="hearts-card">같이 걷는 분들을 확인하고 있어요…</p>}
        {mode==='native'?<a className="hearts-text-button" href="#native-ranking-title">걸음수 공유·연결 확인하기</a>:<Link className="hearts-text-button" href={demo?'/walking/ranking-demo':'/walking/connect'}>기존 오늘 걸음수 순위도 보기</Link>}
      </section>:null}
    </>:null}
    {demo&&snapshot.joined?<details className="hearts-demo-controls"><summary>예시 걸음·취사 소식 바꿔보기</summary><label htmlFor="hearts-demo-count">가상 걸음 {num(summary.count??0)}걸음</label><input id="hearts-demo-count" type="range" min="0" max="20000" step="100" value={summary.count??0} disabled={!snapshot.enabled} onChange={event=>updateDemo(Number(event.target.value))}/><div className="hearts-demo-presets">{[25,50,100,200,300].map(percent=><button disabled={!snapshot.enabled} key={percent} onClick={()=>updateDemo(Math.floor(summary.goal*percent/100))}>{percent}%</button>)}</div><button className="hearts-secondary" disabled={!snapshot.enabled||summary.cooking} onClick={()=>updateDemo(summary.count,true)}>{summary.cooking?'오늘 취사 소식 예시가 있어요':'취사 소식 예시 도착'}</button><button className="hearts-text-button" onClick={()=>{const fresh=createHeartsDemo();current.current=fresh;setSnapshot(fresh);saveHeartsDemo(fresh);setNotice('가상 기록과 꾸미기를 처음으로 돌렸어요.');}}>체험 기록 처음으로</button></details>:null}
    {!demo&&snapshot.joined?<button className="hearts-text-button" disabled={busy} onClick={()=>void refresh()}>오늘 기록 다시 확인</button>:null}
    {!embedded?<footer className="hearts-footer"><Link href={demo?'/walking':'/walking/demo'}>{demo?'워밍이의 산책으로 돌아가기':'예시로 먼저 체험하기'}</Link><Link href="/more">기존 메뉴로 돌아가기</Link></footer>:null}
    {settings?<SettingsDialog error={error} snapshot={snapshot} summaryGoal={summary.configuredGoal} busy={busy} demo={demo} onClose={()=>setSettings(false)} onSave={async body=>{if(await run('heartsettings',body,'설정을 저장했어요. 목표 변경은 내일부터 적용해요.'))setSettings(false);}} onDelete={async()=>{if(await run('heartleave',{},demo?'체험을 처음으로 돌렸어요.':'하트 기록과 응원을 삭제했어요. 휴대폰 건강 기록은 그대로예요.'))setSettings(false);}}/>:null}
    {openMessage?<div className="hearts-dialog-shade"><section className="hearts-dialog hearts-open-letter" role="dialog" aria-modal="true" aria-label="가족의 응원 편지"><span aria-hidden="true">💌</span><h2>가족의 마음이 도착했어요</h2><p>{openMessage.text}</p>{openMessage.photo?<img src={openMessage.photo} alt="가족이 함께 보낸 사진"/>:null}<button autoFocus className="hearts-primary" onClick={()=>setOpenMessage(null)}>잘 읽었어요</button></section></div>:null}
  </>;
  return embedded?<section className="bapmunna-hearts is-embedded">{content}</section>:<main className="bapmunna-hearts">{content}</main>;
}

function HeartsConsent({busy,native,onJoin}:{busy:boolean;native:boolean;onJoin:(body:Record<string,unknown>)=>void}){
  const [agreed,setAgreed]=useState(false),[goal,setGoal]=useState(5000);
  return <form onSubmit={event=>{event.preventDefault();if(agreed)onJoin({consentVersion:HEARTS_CONSENT,enabled:true,goal,leagueEnabled:false,region:''});}}>
    <p>{native?'내 휴대폰의 걸음과 가족 응원을':'연결한 휴대폰의 걸음과 가족 응원을'} 하트로 함께 모아요. 주간 순위 공개는 따로 선택해요.</p>
    <label className="hearts-field">내가 정한 하루 목표<input type="number" min="500" max="20000" step="100" value={goal} required onChange={event=>setGoal(Number(event.target.value))}/><small>예시 기본값이에요. 몸 상태에 맞게 정해요.</small></label>
    <details className="hearts-explainer"><summary>저장·공유 내용을 확인해 주세요</summary><p>하루 걸음·달성 요약은 최대 35일, 응원·사진은 30일 동안 저장해요. 모은 하트·구매 차림은 이용하는 동안 유지돼요. 연결된 가족 계정과 휴대폰에서만 응원을 볼 수 있어요.</p><p>설정에서 끄거나 하트 기록을 삭제할 수 있어요. 건강 앱의 원본은 지우지 않아요. 문의는 <a href={`mailto:${PRIVACY_SUPPORT_EMAIL}`}>{PRIVACY_SUPPORT_EMAIL}</a>로 보내 주세요.</p></details>
    <label className="hearts-check"><input type="checkbox" checked={agreed} onChange={event=>setAgreed(event.target.checked)}/><span>걸음 요약과 하트·가족 응원 이용에 동의해요.</span></label>
    <button className="hearts-primary" disabled={busy||!agreed} type="submit">동의하고 산책 하트 켜기</button>
  </form>;
}

function SettingsDialog({error,snapshot,summaryGoal,busy,demo,onClose,onSave,onDelete}:{error:string;snapshot:HeartsSnapshot;summaryGoal:number;busy:boolean;demo:boolean;onClose:()=>void;onSave:(body:Record<string,unknown>)=>Promise<void>;onDelete:()=>Promise<void>}){
  const [goal,setGoal]=useState(summaryGoal),[enabled,setEnabled]=useState(snapshot.enabled),[leagueEnabled,setLeagueEnabled]=useState(snapshot.leagueEnabled),[region,setRegion]=useState(snapshot.region),[deleting,setDeleting]=useState(false);
  return <div className="hearts-dialog-shade"><section className="hearts-dialog" role="dialog" aria-modal="true" aria-label="산책 하트 설정"><button autoFocus className="hearts-dialog-close" onClick={onClose}>닫기</button><h2>산책 하트 설정</h2>{error?<p role="alert" className="hearts-status is-error">{error}</p>:null}
    {snapshot.joined?<form onSubmit={event=>{event.preventDefault();void onSave({goal,enabled,leagueEnabled,region:region.trim()});}}>
      <label className="hearts-check"><input type="checkbox" checked={enabled} onChange={event=>setEnabled(event.target.checked)}/><span>산책 하트 켜기</span></label><p className="hearts-small">끄면 새 기록·하트를 모으지 않아요. 기존 하트와 차림은 남아요.</p>
      <label className="hearts-field">내일부터의 하루 목표<input type="number" min="500" max="20000" step="100" required value={goal} onChange={event=>setGoal(Number(event.target.value))}/><small>오늘 목표는 그대로예요. 식사량·칼로리로 정하지 않아요.</small></label>
      <label className="hearts-check"><input type="checkbox" checked={leagueEnabled} onChange={event=>setLeagueEnabled(event.target.checked)}/><span>별명·주간 하트 점수·선택한 지역을 리그 참여자와 공유해요.</span></label>
      {leagueEnabled?<label className="hearts-field">같이 걷는 지역 · 선택<input value={region} maxLength={30} placeholder="예: 세종 조치원" onChange={event=>setRegion(event.target.value)}/><small>시·구 정도만 적어요. 상세 주소는 적지 않아요.</small></label>:null}
      <button className="hearts-primary" disabled={busy} type="submit">설정 저장</button>
    </form>:<p>계정과 휴대폰을 연결하고 하트 이용을 켠 뒤 설정할 수 있어요.</p>}
    <Link className="hearts-secondary" href="/health">걸음수 연결·산책 알림 설정</Link>
    {snapshot.joined?<div className="hearts-delete">{deleting?<><p>{demo?'가상 체험을 처음으로 돌릴까요?':'모은 하트·차림·하트 기록·가족 응원을 모두 지울까요? 건강 앱 원본과 기존 랭킹 연결은 유지돼요.'}</p><button className="hearts-secondary" disabled={busy} onClick={()=>void onDelete()}>{demo?'체험 초기화':'네, 하트 기록 삭제'}</button><button className="hearts-text-button" onClick={()=>setDeleting(false)}>그대로 둘게요</button></>:<button className="hearts-text-button" onClick={()=>setDeleting(true)}>{demo?'체험 기록 초기화':'하트 이용 종료·기록 삭제'}</button>}</div>:null}
  </section></div>;
}

async function preparePhoto(file:File):Promise<string>{
  if(!/^image\/(jpeg|png|webp)$/.test(file.type)||file.size>10*1024*1024)throw Error('photo_type');
  const image=await createImageBitmap(file);const ratio=Math.min(1,720/Math.max(image.width,image.height));
  const canvas=document.createElement('canvas');canvas.width=Math.round(image.width*ratio);canvas.height=Math.round(image.height*ratio);
  const ctx=canvas.getContext('2d');if(!ctx){image.close();throw Error('photo_canvas');}ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);image.close();
  for(const quality of [0.8,0.65,0.45,0.3]){const value=canvas.toDataURL('image/jpeg',quality);if(value.length<210000)return value;}
  throw Error('photo_too_large');
}
function FamilyComposer({busy,onSend,onGift,balance,owned}:{busy:boolean;onSend:(body:Record<string,unknown>)=>Promise<unknown>;onGift:(id:string)=>Promise<unknown>;balance:number;owned:string[]}){
  const requestId=useRef<string|null>(null);
  const [text,setText]=useState(''),[photo,setPhoto]=useState<string|null>(null),[photoBusy,setPhotoBusy]=useState(false),[photoError,setPhotoError]=useState(''),[unlock,setUnlock]=useState(0);
  return <section className="hearts-card hearts-composer"><span className="hearts-eyebrow">보호자 · 가족에게 마음 전하기</span><h2>칭찬 한마디 남겨요</h2><form onSubmit={async event=>{event.preventDefault();requestId.current??=crypto.randomUUID();if(await onSend({text:text.trim(),unlockPercent:unlock,requestId:requestId.current,...(photo?{photo}:{})})){setText('');setPhoto(null);requestId.current=null;}}}>
    <label className="hearts-field">따뜻한 응원<textarea rows={4} maxLength={280} minLength={1} required value={text} onChange={event=>{setText(event.target.value);requestId.current=null;}} placeholder="오늘도 어머니의 하루를 응원해요."/></label><span className="hearts-small">{text.length}/280</span>
    <label className="hearts-photo-picker">사진도 함께 보내기 · 선택<input type="file" accept="image/jpeg,image/png,image/webp" disabled={photoBusy||busy} onChange={async event=>{const file=event.target.files?.[0];if(!file)return;setPhotoBusy(true);setPhotoError('');try{setPhoto(await preparePhoto(file));requestId.current=null;}catch{setPhotoError('10MB 이하의 JPG·PNG·WebP 사진을 골라 주세요.');}finally{setPhotoBusy(false);event.target.value='';}}}/></label>
    {photo?<div className="hearts-photo-preview"><img src={photo} alt="보낼 가족 사진 미리보기"/><button type="button" onClick={()=>{setPhoto(null);requestId.current=null;}}>사진 빼기</button></div>:null}{photoError?<p role="alert">{photoError}</p>:null}
    <label className="hearts-field">응원을 여는 때<select value={unlock} onChange={event=>{setUnlock(Number(event.target.value));requestId.current=null;}}><option value="0">바로 읽는 응원</option><option value="25">25%에 열리는 산책 선물상자</option><option value="50">50%에 열리는 산책 선물상자</option></select></label>
    <p className="hearts-small">연결된 가족 휴대폰으로 보내요. 사진은 크기와 위치 메타데이터를 줄여 준비해요. 민감한 사진은 보내지 마세요.</p>
    <button className="hearts-primary" disabled={busy||photoBusy||!text.trim()} type="submit">{photoBusy?'사진 준비 중…':'가족 응원함에 담기'}</button>
  </form><details className="hearts-explainer"><summary>토끼 차림도 선물해볼까요?</summary><p>함께 모은 하트 {num(balance)}개 안에서 선물해요. 돈은 결제하지 않아요.</p><div className="hearts-gift-items">{HEART_ITEMS.filter(item=>item.category==='accessory'||item.category==='hat').slice(0,4).map(item=><button key={item.id} disabled={busy||owned.includes(item.id)||balance<item.price} onClick={()=>void onGift(item.id)}><span aria-hidden="true">{item.icon}</span>{item.name}<small>{owned.includes(item.id)?'이미 가진 차림':`하트 ${item.price}개`}</small></button>)}</div></details></section>;
}
