'use client';

import Link from 'next/link';
import {useCallback,useEffect,useRef,useState} from 'react';
import {Logo,Mascot} from '@/components/Mascot';
import {refreshFirebaseAccount,useFirebaseAccount} from '@/lib/data/firebase';
import {WALKING_SHARING_READY} from '@/lib/walking/availability';
import {createWalkingClient,walkingError} from '@/lib/walking/client';
import {walkingDate,type WalkingProfile,type WalkingBoard as Board,type WalkingPairing} from '@/lib/walking/model';
import {WalkingBoard} from './WalkingBoard';
import './walking.css';

export function WalkingPage(){
  const account=useFirebaseAccount(WALKING_SHARING_READY);
  return <main className="bapmunna-walking">
    <header className="walking-header"><Logo/><Link href="/more" className="walking-back">메뉴로</Link></header>
    <div className="walking-hero"><div><span className="walking-eyebrow">한 걸음씩, 함께</span><h1>내 휴대폰<br/>걸음수 연결</h1><p>가족끼리 나누고,<br/>순위는 따로 선택해요.</p></div><Mascot className="h-28 w-28 shrink-0"/></div>
    <Link className="walking-text-link" href="/walking">오늘의 산책으로 돌아가기</Link>
    {!WALKING_SHARING_READY?<section className="walking-card"><h2 className="walking-heading">가족과 걸음수 공유를 준비하고 있어요</h2><p>휴대폰에서 내 산책을 측정하고 이 기기에 기록할 수 있어요.</p><Link className="walking-primary" href="/walking/steps/">내 걸음 측정</Link><DemoLink/><Link className="walking-text-link" href="/walking/ranking-demo">걸음수 순위 예시 보기</Link><Link className="walking-text-link" href="/health">휴대폰 걸음수 안내</Link></section>
    :account.loading?<p role="status" className="walking-card">내 계정을 확인하고 있어요…</p>
    :account.error?<section role="alert" className="walking-card"><h2 className="walking-heading">계정을 확인하지 못했어요</h2><p>{account.error}</p><button type="button" className="walking-primary" onClick={()=>void refreshFirebaseAccount()}>다시 확인</button></section>
    :!account.user||!account.user.verified||!account.profile?<section className="walking-card"><h2 className="walking-heading">내 계정으로 시작해요</h2><p>{account.user?'이메일 확인과 가입 안내를 마친 뒤 참여할 수 있어요.':'로그인한 뒤 참여를 선택하면, 다른 분들과 오늘 걸음수를 나눌 수 있어요.'}</p><Link href="/login" className="walking-primary">{account.user?'가입 확인 마치기':'로그인하고 참여하기'}</Link><DemoLink/></section>
    :<MemberWalking key={account.user.uid} uid={account.user.uid}/>}
    <p className="walking-footnote">랭킹 참여와 산책 알림은 선택이에요.<br/>참여하지 않아도 밥뭇나를 이용할 수 있어요.</p>
  </main>;
}
function DemoLink(){return <Link href="/walking/demo" className="walking-text-link">예시로 산책 하트 살펴보기</Link>;}

function MemberWalking({uid}:{uid:string}){
  const [client]=useState(()=>createWalkingClient());
  const [profile,setProfile]=useState<WalkingProfile|null>(null),[board,setBoard]=useState<Board|null>(null);
  const [error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
  const [tab,setTab]=useState<'rank'|'reminders'|'connection'>('rank');
  const [nickname,setNickname]=useState(''),[consent,setConsent]=useState(false),[shareRanking,setShareRanking]=useState(false),[confirmLeave,setConfirmLeave]=useState(false);
  const [pairing,setPairing]=useState<WalkingPairing|null>(null),[now,setNow]=useState(()=>new Date());
  const life=useRef({active:true,revision:0,busy:false,reading:false,abort:new AbortController()});

  const refresh=useCallback(async()=>{
    const current=life.current;
    if(!current.active||current.busy||current.reading)return;
    current.reading=true;const at=current.revision;
    try{
      const next=await client.profile(uid,current.abort.signal);
      const rows=next.joined&&next.sharingScope!=='private'?await client.board(uid,current.abort.signal):null;
      if(current.active&&current.revision===at){setProfile(next);setBoard(rows);setError('');}
    }catch(reason){if(current.active&&current.revision===at)setError(walkingError(reason));}
    finally{current.reading=false;if(current.active&&current.revision===at)setLoading(false);}
  },[client,uid]);
  useEffect(()=>{
    const current={active:true,revision:0,busy:false,reading:false,abort:new AbortController()};life.current=current;
    void refresh();
    const tick=()=>{setNow(new Date());if(document.visibilityState==='visible')void refresh();};
    const timer=setInterval(tick,60_000);
    window.addEventListener('focus',tick);document.addEventListener('visibilitychange',tick);
    return()=>{current.active=false;current.revision++;current.abort.abort();clearInterval(timer);window.removeEventListener('focus',tick);document.removeEventListener('visibilitychange',tick);};
  },[refresh]);
  async function run(action:(signal:AbortSignal,isCurrent:()=>boolean)=>Promise<void>){
    const current=life.current;if(!current.active||current.busy)return;
    const at=++current.revision;current.busy=true;setBusy(true);setError('');setNotice('');
    const active=()=>current.active&&current.revision===at;
    try{await action(current.abort.signal,active);}catch(reason){if(active())setError(walkingError(reason));}
    finally{current.busy=false;if(active()){setBusy(false);setLoading(false);}}
  }
  const today=walkingDate(now),todayBoard=board?.date===today?board:null;
  const codeActive=pairing&&Date.parse(pairing.expiresAt)>now.getTime();
  return <>
    <label className="walking-menu-label" htmlFor="walking-menu">보고 싶은 메뉴</label>
    <select id="walking-menu" className="walking-select" value={tab} onChange={event=>setTab(event.target.value as typeof tab)}>
      <option value="rank">오늘의 걸음수 랭킹</option><option value="reminders">식후 산책 알림</option><option value="connection">참여·휴대폰 연결</option>
    </select>
    {error?<div role="alert" className="walking-error"><p>{error}</p><button type="button" onClick={()=>void refresh()} disabled={busy}>다시 확인</button></div>:null}
    {notice?<p role="status" className="walking-notice">{notice}</p>:null}
    {tab==='reminders'?<WalkReminderGuide/>:null}
    {loading&&!profile&&tab!=='reminders'?<p role="status" className="walking-card">랭킹 참여 상태를 확인하고 있어요…</p>:null}
    {!loading&&!profile&&!error&&tab!=='reminders'?<p className="walking-card">참여 상태를 다시 확인해 주세요.</p>:null}
    {profile&&!profile.joined&&tab!=='reminders'?<section className="walking-card walking-join">
      <span className="walking-eyebrow">공유 범위는 내가 골라요</span><h2 className="walking-heading">나의 오늘을<br/>함께 응원할까요?</h2>
      <p>기본은 <strong>연결된 가족 계정과 휴대폰끼리</strong> 나눠요. 공개 순위에 참여하지 않아도 산책 하트를 사용할 수 있어요.</p>
      <form onSubmit={event=>{event.preventDefault();if(!consent)return;void run(async(signal,active)=>{
        const next=await (shareRanking?client.join(uid,nickname,signal):client.joinPrivate(uid,nickname,signal));if(!active())return;
        setProfile(next);setTab('connection');setNickname('');setConsent(false);setNotice('참여를 신청했어요. 걸음수를 잴 휴대폰을 연결해 주세요.');
        const rows=next.sharingScope==='private'?null:await client.board(uid,signal);if(active())setBoard(rows);
      });}}>
        <label htmlFor="walking-nickname">연결할 때 확인할 별명</label><input id="walking-nickname" value={nickname} autoComplete="off" placeholder="예: 햇살산책" minLength={2} maxLength={16} required onChange={event=>setNickname(event.target.value)}/>
        <div className="walking-consent-note"><p>건강 앱에서 읽은 <strong>한국 시간 기준 오늘 걸음수 합계</strong>만 선택한 범위로 공유해요. 휴대폰에서 한 번 더 공유에 동의해야 전송이 시작돼요.</p><p>‘참여 그만하기’를 누르면 공개 기록과 연결을 지워요. <Link href="/health/privacy">걸음수 이용 안내 보기</Link></p></div>
        <label className="walking-checkbox"><input type="checkbox" checked={shareRanking} onChange={event=>{setShareRanking(event.target.checked);setConsent(false);}}/><span>선택: 별명·오늘 걸음수·순위를 전체 랭킹 참여자에게도 공개해요.</span></label>
        <label className="walking-checkbox"><input type="checkbox" checked={consent} onChange={event=>setConsent(event.target.checked)}/><span>{shareRanking?'전체 랭킹 참여자에게 별명과 오늘 걸음수가 공개되는 것에 동의해요.':'연결된 가족 계정과 휴대폰에만 별명과 오늘 걸음수 합계를 공유하는 것에 동의해요.'}</span></label>
        <button className="walking-primary" disabled={busy||!consent||nickname.trim().length<2} type="submit">{busy?'확인하고 있어요…':shareRanking?'동의하고 공개 랭킹 참여':'동의하고 가족끼리 연결'}</button>
      </form><DemoLink/>
    </section>:null}
    {profile?.joined&&tab==='rank'&&profile.sharingScope==='private'?<section className="walking-card"><h2 className="walking-heading">가족끼리만 나누고 있어요</h2><p>전체 걸음수 순위에는 공개하지 않아요. 오늘의 산책에서 하트와 가족 응원을 볼 수 있어요.</p><Link href="/walking" className="walking-primary">오늘의 산책 열기</Link><button className="walking-secondary" onClick={()=>setTab('connection')}>휴대폰 연결 확인</button></section>:null}
    {profile?.joined&&tab==='rank'&&profile.sharingScope!=='private'?<section>
      {todayBoard?<WalkingBoard board={todayBoard}/>:<div className="walking-card"><h2 className="walking-heading">오늘 순위를 불러와요</h2><p>새 날짜의 걸음수를 확인하는 중이에요.</p></div>}
      <button className="walking-secondary" disabled={busy} onClick={()=>void refresh()}>순위 다시 확인</button>
      <p className="walking-caption">걸음수를 잰 휴대폰에서 밥뭇나를 열면 기록이 올라와요. 이 화면에서는 1분마다 순위를 확인해요.</p>
      {!profile.deviceConnected?<button className="walking-primary" onClick={()=>setTab('connection')}>내 휴대폰 걸음수 연결</button>:null}
    </section>:null}
    {profile?.joined&&tab==='connection'?<section className="walking-card">
      <span className="walking-eyebrow">함께 부를 별명</span><h2 className="walking-heading">{profile.nickname}</h2>
      <p>{profile.deviceConnected?'걸음수를 보낼 휴대폰이 연결돼 있어요.':'걸음수를 잴 휴대폰을 연결해 주세요.'}</p>
      <p className="walking-caption">{profile.sharingScope==='private'?'공유 범위: 연결된 가족 계정과 휴대폰만':'공유 범위: 전체 걸음수 랭킹 참여자'}</p>
      <ol className="walking-steps"><li>아래에서 <strong>연결 숫자</strong>를 만들어요.</li><li>걸음수를 잴 휴대폰의 밥뭇나 건강 화면에 숫자를 입력해요.</li><li><strong>{profile.nickname}</strong> 별명을 확인하고 공유에 동의해요.</li></ol>
      <button className="walking-primary" disabled={busy} onClick={()=>void run(async(signal,active)=>{const next=await client.pairing(uid,signal);if(active()){setPairing(next);setNow(new Date());}})}>{busy?'확인하고 있어요…':pairing?'새 연결 숫자 만들기':'연결 숫자 만들기'}</button>
      {pairing?<div className="walking-code" role="status"><span>{codeActive?'휴대폰에 입력할 숫자':'연결 숫자의 시간이 지났어요'}</span>{codeActive?<strong aria-label={`연결 숫자 ${pairing.code.split('').join(' ')}`}>{pairing.code.slice(0,4)} {pairing.code.slice(4)}</strong>:null}<p>{codeActive?'10분 안에 한 번만 사용할 수 있어요. 연결할 휴대폰에 직접 입력해 주세요.':'새 숫자를 만들어 다시 입력해 주세요.'}</p></div>:null}
      <Link className="walking-secondary" href="/health">휴대폰 앱 설치·연결 안내</Link>
      <p className="walking-caption">한 계정에 한 휴대폰을 연결해요. 새 휴대폰에서 동의를 마치면 이전 연결은 끝나요.</p>
      <div className="walking-divider"/>
      {!confirmLeave?<button className="walking-text-link" onClick={()=>setConfirmLeave(true)}>걸음수 공유·연결 그만하기</button>:<div className="walking-withdraw"><h3>걸음수 공유를 마칠까요?</h3><p>별명·걸음수·휴대폰 연결과 미사용 연결 숫자, 하트·차림·가족 응원을 지워요. 휴대폰 건강 앱의 원래 기록은 그대로예요.</p><button className="walking-primary" disabled={busy} onClick={()=>void run(async(signal,active)=>{await client.leave(uid,signal);if(active()){setProfile({joined:false});setBoard(null);setPairing(null);setConfirmLeave(false);setNotice('걸음수 공유와 연결을 끝냈어요.');}})}>네, 공유를 끝낼게요</button><button className="walking-secondary" disabled={busy} onClick={()=>setConfirmLeave(false)}>계속 연결할게요</button></div>}
    </section>:null}
  </>;
}

export function WalkReminderGuide(){return <section className="walking-card">
  <span className="walking-eyebrow">밥 먹고, 가볍게 한 걸음</span><h2 className="walking-heading">내 식사 시간에 맞춰<br/>산책을 떠올려요</h2>
  <div className="walking-notification-preview"><span>밥뭇나 · 식후 산책</span><strong>식사를 마치셨다면,<br/>몸이 편할 때 가볍게 걸어볼까요?</strong><p>혈당을 재는 분은 안내받은 측정 시각도 확인해 주세요.</p></div>
  <p>설치한 밥뭇나의 건강 화면에서 식사 후 알림 시각을 고를 수 있어요. 알림과 혈당 확인 안내는 각각 켜고 끌 수 있어요.</p>
  <Link href="/health" className="walking-primary">휴대폰에서 산책 알림 설정</Link>
  <details className="walking-details"><summary>산책·혈당 안내를 읽어 주세요</summary><p>식사 시각에 맞춘 안내이며, 식사 완료나 혈당을 자동으로 측정하지는 않아요. 몸이 불편하면 쉬세요. 인슐린 등 치료를 받고 계시면 걷기와 혈당 측정은 의료진과 정한 방법을 따라 주세요.</p><p><a href="https://www.cdc.gov/diabetes/treatment/" target="_blank" rel="noopener noreferrer">혈당 측정 안내 · CDC</a></p></details>
</section>;}
