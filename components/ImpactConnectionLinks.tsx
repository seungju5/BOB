'use client';
import Link from 'next/link';
import { useSyncExternalStore } from 'react';
import { useApp } from '@/lib/data/useApp';
import { IconArrowRight, IconLock, IconPlug } from '@/components/icons';
import { SmartThingsAccountCard } from '@/components/SmartThingsAccountCard';
const CHANGE='bapmunna:connection-guide';
const subscribe=(cb:()=>void)=>{window.addEventListener(CHANGE,cb);window.addEventListener('storage',cb);return()=>{window.removeEventListener(CHANGE,cb);window.removeEventListener('storage',cb);};};
export function ImpactConnectionLinks({compact=false}:{compact?:boolean}) {
  const {provider,accountKey,view}=useApp();
  // Only the small UI preference is local; account settings remain on the server.
  const key=`bapmunna:guide:${provider}:${accountKey?.split(':')[0]??'visitor'}`;
  const dismissed=useSyncExternalStore(subscribe,()=>{try{return localStorage.getItem(key)==='seen';}catch{return false;}},()=>true);
  if(compact){
    return <section className="mt-5" aria-label="기기 연결 안내">
      <Link href="/connect" className="flex min-h-12 items-center gap-3 rounded-2xl border border-line px-4 py-3 text-[16px] font-bold text-cocoa focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cocoa">
        <IconPlug className="h-5 w-5 shrink-0"/><span className="min-w-0 flex-1">{provider==='demo'?'기기 연결 예시 보기':view?.plug.deviceId?'우리 집 기기 신호 확인':'삼성 기기 연결 안내'}</span><IconArrowRight className="h-5 w-5"/>
      </Link>
      <SmartThingsAccountCard compact />
      {!dismissed?<div className="mt-2 rounded-2xl bg-butter-soft p-4 text-[16px] leading-relaxed text-cocoa">
        <p>기기 연결은 여기에서 시작해요. 나중에도 더보기 → 설정 → 기기에서 찾을 수 있어요.</p>
        <button className="mt-2 min-h-12 rounded-full bg-paper px-5 font-semibold" onClick={()=>{try{localStorage.setItem(key,'seen');}catch{}window.dispatchEvent(new Event(CHANGE));}}>알겠어요</button>
      </div>:null}
    </section>;
  }
  return <section className="mt-5 rounded-[1.75rem] border border-line p-5" aria-label="계정과 기기 연결">
    <h2 className="text-[18px] font-bold text-cocoa">안부를 이어볼까요?</h2>
    <div className="mt-3 flex flex-col gap-2">
      {[{href:'/account',label:'내 정보 센터',detail:'보호자 이름과 저장 내역',Icon:IconLock},{href:'/connect',label:'기기 연결',detail:'연결 준비와 마지막 수신 확인',Icon:IconPlug}].map(({href,label,detail,Icon})=><Link key={href} href={href} className="flex min-h-16 items-center gap-3 rounded-2xl bg-butter-soft px-4 py-3 text-cocoa focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cocoa"><Icon className="h-5 w-5 shrink-0"/><span className="min-w-0 flex-1"><strong className="block text-[17px]">{label}</strong><span className="mt-0.5 block text-[16px] text-cocoa/70">{detail}</span></span><IconArrowRight className="h-5 w-5 shrink-0"/></Link>)}
    </div>
  </section>;
}
