'use client';

import { TEAM_GOOGLE_SIGN_IN_ENABLED, TEAM_KAKAO_SIGN_IN_ENABLED } from '@/config/team';
import { PrivacyNotice } from '@/components/privacy/PrivacyNotice';

import Link from 'next/link';
import { Suspense, useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Logo, Mascot } from '@/components/Mascot';
import { Button } from '@/components/ui';
import { TextInput } from '@/components/forms';
import { FlowProgress } from '@/components/onboarding/FlowProgress';
import { setMode, useMode } from '@/lib/data/mode';
import { useFirebaseAccount, refreshFirebaseAccount, signOutFirebase } from '@/lib/data/firebase';
import { accountError, connectFirebase, within } from '@/lib/firebase/bridge';
import { firebaseLoginDestination } from '@/lib/firebase/login-destination';

export default function FirebaseLogin(){
  const account=useFirebaseAccount();
  const [busy,setBusy]=useState(false);
  const [continueUid,setContinueUid]=useState<string|null>(null);
  return <Suspense fallback={<main className="p-6" role="status">로그인 상태를 확인하고 있어요…</main>}>
    <LoginForm key={account.user?.uid??'anonymous'} account={account} busy={busy} setBusy={setBusy} continueUid={continueUid} setContinueUid={setContinueUid} />
  </Suspense>;
}
function LoginForm({account,busy,setBusy,continueUid,setContinueUid}:{account:ReturnType<typeof useFirebaseAccount>;busy:boolean;setBusy:(busy:boolean)=>void;continueUid:string|null;setContinueUid:(value:string|null)=>void}){
  const router=useRouter(),mode=useMode(),leavingForDemo=useRef(false);
  const [tab,setTab]=useState<'login'|'signup'|'reset'>('login');
  const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[name,setName]=useState(account.user?.displayName??'');
  const [keep,setKeep]=useState(false),[consent,setConsent]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [kakaoReady,setKakaoReady]=useState(false),[verificationEmail,setVerificationEmail]=useState('');
  const locked=useRef(false);
  const query = useSearchParams();
  const next = query.get('next');
  const studioLogin = next === 'studio';
  const destination = firebaseLoginDestination(account, next, query.get('day'), query.get('slot'));
  useEffect(()=>{
    if (!TEAM_KAKAO_SIGN_IN_ENABLED) return;
    let active=true;
    void connectFirebase().then(p=>p.kakaoStatus?.()??false).then(ready=>{if(active)setKakaoReady(ready);}).catch(()=>{});
    return ()=>{active=false;};
  },[]);
  useEffect(()=>{
    // Restoring a session must leave the account-switch choice reachable.
    // Only a sign-in/profile action started on this screen advances automatically.
    if (busy || account.loading || !continueUid || account.user?.uid !== continueUid || mode !== 'live' || leavingForDemo.current) return;
    if (destination) router.replace(destination);
  },[account.user?.uid,account.loading,busy,continueUid,destination,mode,router]);
  async function run(action:()=>Promise<void>){
    if(busy||locked.current)return;locked.current=true;setBusy(true);setContinueUid(null);setError('');setNotice('');
    try{await action();}catch(e){setContinueUid(null);setError(accountError(e));}finally{locked.current=false;setBusy(false);}
  }
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    await run(async()=>{
      const p=await within(connectFirebase());
      if(tab==='reset'){
        await within(p.resetPassword(email));setNotice('가입한 주소라면 비밀번호 재설정 메일이 도착해요. 받은편지함과 스팸함을 확인해 주세요.');return;
      }
      if(tab==='signup'){
        if(!consent)throw new Error('회원 정보 저장 안내를 확인해 주세요.');
        setMode('live');const signedIn=await within(p.signUp(email,password,name,keep));setContinueUid(signedIn.uid);setNotice('이메일 확인 후 다시 돌아와 주세요.');
      }else {setMode('live');const signedIn=await within(p.signIn(email,password,keep));setContinueUid(signedIn.uid);}
      setPassword('');await refreshFirebaseAccount();
    });
  }
  const user=account.user;
  return <main className="flex flex-1 flex-col px-6 pt-6 pb-8">
    <header className="flex items-center justify-between border-b border-line pb-4"><Logo/><span className="text-[16px] text-muted">{studioLogin?'팀 운영 스튜디오':'보호자용'}</span></header>
    {!studioLogin && <div className="mt-5"><FlowProgress current="login" /></div>}
    <div className="mx-auto mt-6 flex w-full max-w-md flex-1 flex-col">
      {!studioLogin && <Mascot className="mx-auto h-24 w-24"/>}
      <h1 className="mt-3 text-center text-[28px] leading-tight font-extrabold text-cocoa">{studioLogin?'팀 운영자 로그인':'보호자님, 반가워요.'}</h1>
      <p className="mt-2 text-center text-[16px] text-muted">{studioLogin?'등록된 팀 이메일로 로그인해 주세요.':'멀리 있어도, 안부는 가까이.'}</p>
      {error||account.error?<p role="alert" className="mt-5 rounded-2xl bg-blush p-4 text-[16px] text-cocoa">{error||account.error}</p>:null}
      {notice?<p role="status" className="mt-5 rounded-2xl bg-sage p-4 text-[16px] text-cocoa">{notice}</p>:null}
      {account.loading ? <p role="status" className="py-8 text-center text-[16px] text-muted">로그인 상태를 확인하고 있어요…</p>
      : user && destination ? <section className="mt-6 flex flex-col gap-3">
        <p className="break-all text-center text-[16px]">{user.email}</p>
        <Button onClick={()=>{setMode('live');router.push(destination);}}>
          {studioLogin ? '팀 운영 스튜디오 열기' : destination.startsWith('/records/') ? '내 날짜별 기록 열기' : next === 'connect' ? '내 밥솥 연결 확인' : '보호자 화면으로 계속하기'}
        </Button>
        <Button variant="ghost" disabled={busy} onClick={()=>run(signOutFirebase)}>다른 계정으로 로그인</Button>
      </section>
      : user?.verified && studioLogin ? <section className="mt-6 grid gap-3">
        <p className="text-center">이 계정에 등록된 운영 권한이 없습니다.</p>
        <Button onClick={()=>{setMode('live');router.replace('/start/');}}>보호자 화면으로 계속하기</Button>
        <Button variant="ghost" disabled={busy} onClick={()=>run(signOutFirebase)}>다른 이메일로 로그인</Button>
      </section>
      : user && !user.verified ? <section className="mt-6 flex flex-col gap-3">
        <h2 className="text-[20px] font-bold text-cocoa">{user.email?'이메일을 확인해 주세요':'처음 한 번, 이메일을 확인해요'}</h2>
        {user.email?<p className="break-all text-[16px] text-muted">{user.email}로 보낸 확인 링크를 눌러 주세요.</p>:<>
          <p className="text-[16px] leading-relaxed text-muted">카카오 본인 확인을 마쳤어요. 내 계정과 기록을 안전하게 이용할 이메일을 알려주세요. 별도 비밀번호는 만들지 않아요.</p>
          <form className="flex flex-col gap-3" onSubmit={event=>{event.preventDefault();void run(async()=>{
            const p=await connectFirebase();if(!p.requestEmail)throw Error('새 버전을 불러오도록 새로고침해 주세요.');
            await within(p.requestEmail(email,user.uid));setVerificationEmail(email.trim());setNotice('확인 메일을 보냈어요. 메일의 링크를 누른 뒤 이 화면에서 확인해 주세요.');
          });}}>
            <label htmlFor="kakao-email" className="text-[16px] font-semibold">내 이메일</label><TextInput id="kakao-email" type="email" required autoComplete="email" inputMode="email" maxLength={254} value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@example.com"/>
            <Button type="submit" disabled={busy}>{verificationEmail?'확인 메일 다시 받기':'확인 메일 받기'}</Button>
          </form>
          {verificationEmail?<p className="break-all text-[16px] text-muted">보낸 주소: {verificationEmail}</p>:null}
          <p className="text-[15px] leading-relaxed text-muted">이미 Google·이메일로 가입하셨다면 아래에서 기존 계정으로 로그인해 주세요. 기록은 자동으로 합치지 않아요.</p>
        </>}
        <Button disabled={busy} onClick={()=>run(async()=>{await refreshFirebaseAccount();setContinueUid(user.uid);})}>이메일 확인했어요</Button>
        {user.email?<Button variant="outline" disabled={busy} onClick={()=>run(async()=>{const p=await connectFirebase();await within(p.resendVerification());setNotice('확인 메일을 다시 보냈어요.');})}>확인 메일 다시 받기</Button>:null}
        <Button variant="ghost" disabled={busy} onClick={()=>run(signOutFirebase)}>다른 계정으로 로그인</Button>
      </section>
      : user && !account.view ? <form className="mt-6 flex flex-col gap-3" onSubmit={event=>{event.preventDefault();void run(async()=>{
        if(!consent)throw new Error('회원 정보 저장 안내를 확인해 주세요.');
        const p=await connectFirebase();setMode('live');await within(p.saveProfile(name,user.uid));await refreshFirebaseAccount();setContinueUid(user.uid);
      });}}>
        <h2 className="text-[20px] font-bold text-cocoa">어떻게 불러드릴까요?</h2>
        <label htmlFor="account-name" className="text-[16px] font-semibold">이름</label><TextInput id="account-name" autoComplete="nickname" required minLength={2} maxLength={30} value={name} onChange={e=>setName(e.target.value)} />
        <p className="break-all text-[16px] text-muted">{user.email}</p>
        <Policy/><label className="flex min-h-12 items-start gap-3 text-[16px]"><input className="mt-1 h-5 w-5" type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} required/>회원 정보와 설정을 내 계정에 저장하는 안내를 확인했어요.</label>
        <Button type="submit" disabled={busy||!!account.error}>{busy?'저장 확인 중…':'내 계정 시작'}</Button>
        {account.error?<Button variant="outline" type="button" onClick={()=>run(refreshFirebaseAccount)}>다시 확인</Button>:null}
        <Button type="button" variant="ghost" disabled={busy} onClick={()=>run(signOutFirebase)}>다른 계정으로 로그인</Button>
      </form>
      : <form className="mt-7 flex flex-col gap-3" onSubmit={submit}>
        {tab==='login' && (TEAM_GOOGLE_SIGN_IN_ENABLED || kakaoReady) ? <>
          {kakaoReady ? <button type="button" disabled={busy} onClick={()=>run(async()=>{const p=await connectFirebase();if(!p.kakao)throw Error('카카오 로그인 연결을 준비하고 있어요.');await p.kakao(keep);})} className="relative flex min-h-14 items-center justify-center rounded-full bg-kakao px-6 text-[17px] font-bold text-kakao-label disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cocoa">
            <svg aria-hidden="true" className="absolute left-5 h-5 w-5" viewBox="0 0 24 24"><path fill="currentColor" d="M12 3C6.48 3 2 6.53 2 10.88c0 2.82 1.88 5.29 4.7 6.68l-.96 3.53c-.08.31.27.56.54.38l4.18-2.77c.5.06 1.01.1 1.54.1 5.52 0 10-3.53 10-7.92S17.52 3 12 3z"/></svg>카카오로 계속하기
          </button> : null}
          {TEAM_GOOGLE_SIGN_IN_ENABLED ? <Button type="button" variant="outline" disabled={busy} onClick={()=>run(async()=>{const p=await connectFirebase();setMode('live');const signedIn=await p.google(keep);await refreshFirebaseAccount();setContinueUid(signedIn.uid);})}>Google로 계속하기</Button> : null}
          <p className="my-2 text-center text-[15px] text-muted">또는 이메일로</p>
        </>:null}
        {tab==='signup'?<><label htmlFor="signup-name" className="text-[16px]">이름</label><TextInput id="signup-name" required minLength={2} maxLength={30} autoComplete="nickname" value={name} onChange={e=>setName(e.target.value)}/></>:null}
        <label htmlFor="login-email" className="text-[16px]">이메일</label><TextInput id="login-email" type="email" autoComplete="email" inputMode="email" placeholder="name@example.com" required value={email} onChange={e=>setEmail(e.target.value)}/>
        {tab!=='reset'?<><label htmlFor="login-password" className="text-[16px]">비밀번호</label><TextInput id="login-password" type="password" required minLength={tab==='signup'?8:1} autoComplete={tab==='signup'?'new-password':'current-password'} placeholder="비밀번호를 입력해 주세요." value={password} onChange={e=>setPassword(e.target.value)}/><label className="flex min-h-12 items-center gap-3 text-[16px]"><input type="checkbox" className="h-5 w-5" checked={keep} onChange={e=>setKeep(e.target.checked)}/>로그인 상태 유지</label></>:null}
        {tab==='signup'?<><Policy/><label className="flex min-h-12 items-start gap-3 text-[16px]"><input className="mt-1 h-5 w-5" type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} required/>회원 정보 저장 안내를 확인했어요.</label></>:null}
        <Button type="submit" disabled={busy}>{busy?'확인 중…':tab==='signup'?'회원가입':tab==='reset'?'재설정 메일 받기':'로그인'}</Button>
        <div className="flex flex-wrap items-center justify-center gap-x-4">
          {tab!=='signup'?<button type="button" disabled={busy} className="min-h-12 text-[16px] text-muted underline" onClick={()=>{setTab('signup');setError('');setPassword('');}}>회원가입</button>:null}
          {tab!=='reset'?<button type="button" disabled={busy} className="min-h-12 text-[16px] text-muted underline" onClick={()=>{setTab('reset');setError('');setPassword('');}}>비밀번호 찾기</button>:null}
          {tab!=='login'?<button type="button" disabled={busy} className="min-h-12 text-[16px] text-muted underline" onClick={()=>{setTab('login');setError('');}}>로그인으로</button>:null}
        </div>
        <p className="text-[16px] leading-relaxed text-muted">{studioLogin?'이메일 인증을 마친 운영자 계정만 접근할 수 있습니다.':'밥뭇나는 보호자 이메일로 가입해요. 가입이 끝나면 삼성 기기 연결 화면에서 밥솥 플러그를 연결할 수 있는지 확인해요.'}</p>
      </form>}
      {!studioLogin && <><Button variant="ghost" className="mt-6" disabled={busy || mode === undefined} onClick={()=>{leavingForDemo.current=true;setContinueUid(null);setMode('demo');router.push('/start');}}>로그인 없이 데모로 둘러보기</Button>
      <p className="mt-2 text-center text-[16px] text-muted">데모에서는 예시 기록으로 사용해 볼 수 있어요.</p></>}
      <Link className="mt-4 flex min-h-12 items-center justify-center text-[16px] text-muted underline" href="/">첫 화면으로</Link>
    </div>
  </main>;
}
function Policy(){return <div className="rounded-2xl bg-butter-soft p-4 text-[16px] leading-relaxed text-muted"><p>이름·이메일과 입력한 설정은 본인 계정에 저장돼요. 가족에게 공유하는 동의와 기기 연결은 별도로 확인해요.</p><PrivacyNotice /></div>;}
