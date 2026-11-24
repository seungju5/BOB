'use client';
import Link from 'next/link';
import {useMemo} from 'react';
import {PhoneSteps,type HeartsAction} from '@bapmunna/phone-steps';
import {useFirebaseAccount} from '@/lib/data/firebase';
import {WALKING_SHARING_READY} from '@/lib/walking/availability';
import {createHeartsClient} from '@/lib/hearts/client';
import {createNativeHeartsTransport} from '@/lib/hearts/native';
import {HeartsExperience} from './HeartsExperience';
import {BunnyScene} from './HeartsScene';

export function HeartsEntry(){
  const account=useFirebaseAccount(WALKING_SHARING_READY);
  const uid=account.user?.verified&&account.profile?account.user.uid:null;
  const transport=useMemo(()=>uid?createHeartsClient(uid):undefined,[uid]);
  if (!WALKING_SHARING_READY) return (
    <main className="bapmunna-hearts">
      <header className="hearts-header"><h1 className="hearts-page-title">오늘의 산책</h1><Link href="/more" className="hearts-header-link">메뉴</Link></header>
      <BunnyScene equipped={{hat:null,outfit:null,accessory:null,background:null}}/>
      <section className="hearts-card hearts-setup">
        <h2>산책 하트를 먼저 만나 보세요</h2>
        <p>실제 걸음수 연결을 준비하고 있어요. 가상 걸음으로 하트를 모으고 토끼 옷을 골라 보세요.</p>
        <Link className="hearts-primary" href="/walking/demo">산책 하트 체험하기</Link>
        <Link className="hearts-secondary" href="/walking/connect">걸음수 연결 안내</Link>
      </section>
    </main>
  );
  return <><HeartsExperience key={uid??'visitor'} mode="web" transport={transport}/>{!uid&&!account.loading?<p className="hearts-account-note">내 기록을 연결하려면 <Link href="/login">밥뭇나 로그인</Link>부터 시작해요.</p>:null}</>;
}
const nativeTransport=createNativeHeartsTransport((action,body)=>PhoneSteps.heartsRequest({action:action as HeartsAction,...(body?{body}:{})}));
export function HeartsNative(){return WALKING_SHARING_READY ? <HeartsExperience mode="native" transport={nativeTransport} embedded/> : null;}
