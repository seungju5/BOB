'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Logo, Mascot } from '@/components/Mascot';
import { Button } from '@/components/ui';
import { TextInput } from '@/components/forms';
import { FlowProgress } from '@/components/onboarding/FlowProgress';
import { setMode, useMode } from '@/lib/data/mode';
import { useFirebaseAccount, refreshFirebaseAccount, signOutFirebase } from '@/lib/data/firebase';
import { accountError, connectFirebase, within } from '@/lib/firebase/bridge';

export default function FirebaseLogin(){
  const account=useFirebaseAccount();
  const [busy,setBusy]=useState(false);
  const [continueUid,setContinueUid]=useState<string|null>(null);
  return <LoginForm key={account.user?.uid??'anonymous'} account={account} busy={busy} setBusy={setBusy} continueUid={continueUid} setContinueUid={setContinueUid} />;
}
function LoginForm({account,busy,setBusy,continueUid,setContinueUid}:{account:ReturnType<typeof useFirebaseAccount>;busy:boolean;setBusy:(busy:boolean)=>void;continueUid:string|null;setContinueUid:(value:string|null)=>void}){
  const router=useRouter(),mode=useMode(),leavingForDemo=useRef(false);
  const [tab,setTab]=useState<'login'|'signup'|'reset'>('login');
  const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[name,setName]=useState(account.user?.displayName??'');
  const [keep,setKeep]=useState(false),[consent,setConsent]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  useEffect(()=>{
    // Restoring a session must leave the account-switch choice reachable.
    // Only a sign-in/profile action started on this screen advances automatically.
    if(!busy&&continueUid&&account.user?.uid===continueUid&&account.view&&mode==='live'&&!leavingForDemo.current)router.replace('/start');
  },[account.user?.uid,account.view,busy,continueUid,mode,router]);
  async function run(action:()=>Promise<void>){
    if(busy)return;setBusy(true);setContinueUid(null);setError('');setNotice('');
    try{await action();}catch(e){setContinueUid(null);setError(accountError(e));}finally{setBusy(false);}
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
    <header className="flex items-center justify-between border-b border-line pb-4"><Logo/><span className="text-[16px] text-muted">보호자용</span></header>
    <div className="mt-5"><FlowProgress current="login" /></div>
    <div className="mx-auto mt-6 flex w-full max-w-md flex-1 flex-col">
      <Mascot className="mx-auto h-24 w-24"/>
      <h1 className="mt-3 text-center text-[28px] leading-tight font-extrabold text-cocoa">보호자님, 반가워요.</h1>
      <p className="mt-2 text-center text-[16px] text-muted">멀리 있어도, 안부는 가까이.</p>
      {error||account.error?<p role="alert" className="mt-5 rounded-2xl bg-blush p-4 text-[16px] text-cocoa">{error||account.error}</p>:null}
      {notice?<p role="status" className="mt-5 rounded-2xl bg-sage p-4 text-[16px] text-cocoa">{notice}</p>:null}
      {account.loading ? <p role="status" className="py-8 text-center text-[16px] text-muted">로그인 상태를 확인하고 있어요…</p>
      : user && !user.verified ? <section className="mt-6 flex flex-col gap-3">
        <h2 className="text-[20px] font-bold text-cocoa">이메일을 확인해 주세요</h2><p className="break-all text-[16px] text-muted">{user.email}로 보낸 확인 링크를 눌러 주세요.</p>
        <Button disabled={busy} onClick={()=>run(async()=>{await refreshFirebaseAccount();setContinueUid(user.uid);})}>이메일 확인했어요</Button>
        <Button variant="outline" disabled={busy} onClick={()=>run(async()=>{const p=await connectFirebase();await within(p.resendVerification());setNotice('확인 메일을 다시 보냈어요.');})}>확인 메일 다시 받기</Button>
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
      : user && account.view ? <section className="mt-6 flex flex-col gap-3"><p className="break-all text-center text-[16px]">{user.email}</p><Button onClick={()=>{setMode('live');router.push('/start');}}>내 계정으로 계속하기</Button><Button variant="ghost" disabled={busy} onClick={()=>run(signOutFirebase)}>다른 계정으로 로그인</Button></section>
      : <form className="mt-7 flex flex-col gap-3" onSubmit={submit}>
        {tab==='signup'?<><label htmlFor="signup-name" className="text-[16px]">이름</label><TextInput id="signup-name" required minLength={2} maxLength={30} autoComplete="nickname" value={name} onChange={e=>setName(e.target.value)}/></>:null}
        <label htmlFor="login-email" className="text-[16px]">이메일</label><TextInput id="login-email" type="email" autoComplete="email" inputMode="email" placeholder="name@example.com" required value={email} onChange={e=>setEmail(e.target.value)}/>
        {tab!=='reset'?<><label htmlFor="login-password" className="text-[16px]">비밀번호</label><TextInput id="login-password" type="password" required minLength={tab==='signup'?8:1} autoComplete={tab==='signup'?'new-password':'current-password'} placeholder="비밀번호를 입력해 주세요." value={password} onChange={e=>setPassword(e.target.value)}/><label className="flex min-h-12 items-center gap-3 text-[16px]"><input type="checkbox" className="h-5 w-5" checked={keep} onChange={e=>setKeep(e.target.checked)}/>로그인 상태 유지</label></>:null}
        {tab==='signup'?<><Policy/><label className="flex min-h-12 items-start gap-3 text-[16px]"><input className="mt-1 h-5 w-5" type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} required/>회원 정보 저장 안내를 확인했어요.</label></>:null}
        <Button type="submit" disabled={busy}>{busy?'확인 중…':tab==='signup'?'회원가입':tab==='reset'?'재설정 메일 받기':'로그인'}</Button>
        {tab==='login'?<Button type="button" variant="outline" disabled={busy} onClick={()=>run(async()=>{const p=await connectFirebase();setMode('live');const signedIn=await p.google(keep);await refreshFirebaseAccount();setContinueUid(signedIn.uid);})}>Google로 계속하기</Button>:null}
        <div className="flex flex-wrap items-center justify-center gap-x-4">
          {tab!=='signup'?<button type="button" disabled={busy} className="min-h-12 text-[16px] text-muted underline" onClick={()=>{setTab('signup');setError('');setPassword('');}}>회원가입</button>:null}
          {tab!=='reset'?<button type="button" disabled={busy} className="min-h-12 text-[16px] text-muted underline" onClick={()=>{setTab('reset');setError('');setPassword('');}}>비밀번호 찾기</button>:null}
          {tab!=='login'?<button type="button" disabled={busy} className="min-h-12 text-[16px] text-muted underline" onClick={()=>{setTab('login');setError('');}}>로그인으로</button>:null}
        </div>
        <p className="text-[16px] leading-relaxed text-muted">보호자 본인의 계정으로 시작해요.<br/>어르신의 기록은 자동 연결되지 않아요.</p>
      </form>}
      <Button variant="ghost" className="mt-6" disabled={busy} onClick={()=>{leavingForDemo.current=true;setContinueUid(null);setMode('demo');router.push('/start');}}>로그인 없이 데모로 둘러보기</Button>
      <p className="mt-2 text-center text-[16px] text-muted">데모에서는 예시 기록으로 사용해 볼 수 있어요.</p>
      <Link className="mt-4 flex min-h-12 items-center justify-center text-[16px] text-muted underline" href="/">첫 화면으로</Link>
    </div>
  </main>;
}
function Policy(){return <p className="rounded-2xl bg-butter-soft p-4 text-[16px] leading-relaxed text-muted">이름·이메일과 입력한 설정은 본인 계정에 저장돼요. 가족에게 공유하는 동의와 기기 연결은 별도로 확인해요. <a href="https://impact-series.web.app/bapmunna/carer/#privacy" target="_blank" rel="noopener noreferrer" className="font-semibold text-cocoa underline">개인정보 처리 안내</a></p>;}
