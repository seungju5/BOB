'use client';
import Link from 'next/link';
import {useMemo} from 'react';
import {PhoneSteps,type HeartsAction} from '@bapmunna/phone-steps';
import {useFirebaseAccount} from '@/lib/data/firebase';
import {WALKING_SHARING_READY} from '@/lib/walking/availability';
import {createHeartsClient} from '@/lib/hearts/client';
import {createNativeHeartsTransport} from '@/lib/hearts/native';
import {HeartsExperience} from './HeartsExperience';
import {WarmingWalk} from './WarmingWalk';

export function HeartsEntry(){
  const account=useFirebaseAccount(WALKING_SHARING_READY);
  const uid=account.user?.verified&&account.profile?account.user.uid:null;
  const transport=useMemo(()=>uid?createHeartsClient(uid):undefined,[uid]);
  if (!WALKING_SHARING_READY) return <WarmingWalk/>;
  return <><HeartsExperience key={uid??'visitor'} mode="web" transport={transport}/>{!uid&&!account.loading?<p className="hearts-account-note">내 기록을 연결하려면 <Link href="/login">밥뭇나 로그인</Link>부터 시작해요.</p>:null}</>;
}
const nativeTransport=createNativeHeartsTransport((action,body)=>PhoneSteps.heartsRequest({action:action as HeartsAction,...(body?{body}:{})}));
export function HeartsNative(){return WALKING_SHARING_READY ? <HeartsExperience mode="native" transport={nativeTransport} embedded/> : null;}
