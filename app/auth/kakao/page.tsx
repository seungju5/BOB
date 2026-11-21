'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Logo, Mascot } from '@/components/Mascot';
import { accountError, connectFirebase, usesImpactFirebase } from '@/lib/firebase/bridge';
import { refreshFirebaseAccount, useFirebaseAccount } from '@/lib/data/firebase';
import { setMode } from '@/lib/data/mode';

export default function KakaoReturn(){
  const router=useRouter();
  const account=useFirebaseAccount();
  const [error,setError]=useState('');
  const [completedUid,setCompletedUid]=useState<string|null>(null);
  // Derived during render instead of setState inside an effect (react-hooks/set-state-in-effect).
  const accountChanged=!!completedUid&&!account.loading&&account.user?.uid!==completedUid;
  const shownError=error||(accountChanged?'계정이 바뀌었어요. 현재 계정으로 다시 확인해 주세요.':'');
  useEffect(()=>{
    if(!completedUid||account.loading||account.user?.uid!==completedUid)return;
    router.replace(account.view?'/start':'/login');
  },[account.user?.uid,account.loading,account.view,completedUid,router]);
  useEffect(()=>{
    let active=true;const abort=new AbortController();
    // StrictMode's disposable first effect must not consume the one-use code.
    void Promise.resolve().then(async()=>{
      if(!active)return;
      const fragment=window.location.hash;
      window.history.replaceState(null,'',window.location.pathname);
      if(!usesImpactFirebase)throw Error('카카오 로그인은 밥뭇나 공개 앱에서 시작해 주세요.');
      const provider=await connectFirebase();
      if(!active)return;
      if(!provider.completeKakaoLogin)throw Error('새 로그인 화면을 불러오도록 새로고침해 주세요.');
      const user=await provider.completeKakaoLogin(fragment,abort.signal);
      if(!active)return;setMode('live');
      await refreshFirebaseAccount();
      if(!active)return;
      setCompletedUid(user.uid);
    }).catch(reason=>{if(active)setError(accountError(reason));});
    return ()=>{active=false;abort.abort();};
  },[router]);
  return <main className="flex flex-1 flex-col px-6 py-8"><Logo/><Mascot className="mx-auto mt-10 h-28 w-28"/><h1 className="mt-5 text-center text-[26px] font-extrabold text-cocoa">카카오에서 돌아왔어요</h1>
    {shownError?<><p role="alert" className="mt-5 rounded-2xl bg-blush p-4 text-[17px] leading-relaxed text-cocoa">{shownError}</p><Link href="/login" className="mt-6 flex min-h-14 items-center justify-center rounded-full bg-butter px-5 text-[18px] font-bold text-cocoa">로그인 화면으로</Link></>:<p role="status" className="mt-5 text-center text-[17px] text-muted">내 계정을 확인하고 있어요…</p>}
  </main>;
}
