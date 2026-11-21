'use client';

/**
 * [EN] SmartThings device connection and live status screen.
 * [KR] SmartThings 계정 연동 및 우리 집 밥솥 플러그 실시간 상태를 확인하는 화면입니다.
 */

import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { SmartThingsAccountCard } from '@/components/SmartThingsAccountCard';
import { SmartThingsPanel } from '@/components/SmartThingsPanel';
import { Logo } from '@/components/Mascot';
import { useApp } from '@/lib/data/useApp';
import { ONBOARDING_COMPLETE } from '@/lib/data/view';

export default function ConnectPage() {
  const { view, needsLogin, provider, error } = useApp();
  const router = useRouter();
  useEffect(() => { if (needsLogin) router.replace('/login'); }, [needsLogin, router]);
  const returnTo = view && view.onboardingStep < ONBOARDING_COMPLETE ? '/onboarding' : '/home';
  return <main className="flex flex-1 flex-col gap-5 px-5 pt-6 pb-8">
    <Logo />
    <div><h1 className="text-[28px] leading-snug font-bold text-cocoa">우리 집 기기 연결</h1><p className="mt-2 text-[16px] leading-relaxed text-muted">우리 집 밥솥 플러그의 연결 상태를 살펴보세요.</p></div>
    {!view || needsLogin ? <p role="status" className="text-[16px]">{error || '내 계정을 확인하고 있어요…'}</p> : <>
      <SmartThingsAccountCard />
      {provider === 'firebase' ? <>
        {!view.seniorConsent ? <div className="rounded-2xl bg-butter-soft p-4 text-[16px]"><p>연결하기 전에 어르신의 정보 이용 동의를 확인해 주세요.</p><Link href="/settings#device" className="mt-2 flex min-h-12 items-center font-bold underline">동의 확인하러 가기</Link></div> : null}
        <SmartThingsPanel />
      </> : null}
    </>}
    <Link href={returnTo} className="flex min-h-12 items-center justify-center rounded-full border border-line px-4 py-3 text-[16px] font-bold text-cocoa">{returnTo === '/onboarding' ? '우리 집 설정 이어가기' : '홈으로 돌아가기'}</Link>
  </main>;
}
