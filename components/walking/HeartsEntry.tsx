'use client';
import Link from 'next/link';
import {useMemo} from 'react';
import {PhoneSteps,type HeartsAction} from '@bapmunna/phone-steps';
import {useFirebaseAccount} from '@/lib/data/firebase';
import {usesImpactFirebase} from '@/lib/firebase/bridge';
import {createHeartsClient} from '@/lib/hearts/client';
import {createNativeHeartsTransport} from '@/lib/hearts/native';
import {HeartsExperience} from './HeartsExperience';

export function HeartsEntry(){
  const account=useFirebaseAccount(usesImpactFirebase);
  const uid=account.user?.verified&&account.profile?account.user.uid:null;
  const transport=useMemo(()=>uid?createHeartsClient(uid):undefined,[uid]);
  return <><HeartsExperience key={uid??'visitor'} mode="web" transport={transport}/>{!uid&&!account.loading?<p className="hearts-account-note">내 기록을 연결하려면 <Link href="/login">밥뭇나 로그인</Link>부터 시작해요.</p>:null}</>;
}
const nativeTransport=createNativeHeartsTransport((action,body)=>PhoneSteps.heartsRequest({action:action as HeartsAction,...(body?{body}:{})}));
export function HeartsNative(){return <HeartsExperience mode="native" transport={nativeTransport} embedded/>;}
