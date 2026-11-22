'use client';

/**
 * [EN] SmartThings device connection and live status screen.
 * [KR] SmartThings 계정 연동 및 우리 집 밥솥 플러그 실시간 상태를 확인하는 화면입니다.
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SmartThingsAccountCard } from '@/components/SmartThingsAccountCard';
import { SmartThingsPanel } from '@/components/SmartThingsPanel';
import { Logo } from '@/components/Mascot';
import { useApp } from '@/lib/data/useApp';
import { guardianStartPath } from '@/lib/data/view';
import { readSmartThingsConfig, SMARTTHINGS_CONSENT_VERSION } from '@/lib/firebase/smartthings';

function BeforeHouseholdConsent() {
  const [availability, setAvailability] = useState<'checking'|'ready'|'preparing'|'error'>('checking');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void readSmartThingsConfig(controller.signal).then(config => {
      if (!controller.signal.aborted) setAvailability(config.connectionReady && config.consentVersion === SMARTTHINGS_CONSENT_VERSION ? 'ready' : 'preparing');
    }).catch(() => { if (!controller.signal.aborted) setAvailability('error'); });
    return () => controller.abort();
  }, [attempt]);

  return <section className="rounded-2xl border border-line bg-paper p-5">
    <h2 className="text-[20px] font-bold text-cocoa">삼성 계정으로 기기 연결</h2>
    <p role="status" className="mt-2 text-[16px] leading-relaxed text-muted">{{
      checking: '삼성 기기 연결을 이용할 수 있는지 확인하고 있어요.',
      ready: '기기 연결을 시작할 수 있어요. 어르신의 동의를 먼저 저장한 뒤, 삼성 계정에서 밥솥 플러그 읽기를 허용해 주세요.',
      preparing: '지금은 삼성 기기 연결을 준비하고 있어요. 우리 집 설정을 먼저 마치고 나중에 홈에서 다시 확인할 수 있어요.',
      error: '지금은 삼성 기기 연결 상태를 확인할 수 없어요.',
    }[availability]}</p>
    {availability === 'error' && <button type="button" className="min-h-12 font-bold text-cocoa underline" onClick={() => {setAvailability('checking'); setAttempt(n => n + 1);}}>상태 다시 확인</button>}
    <Link href="/onboarding/" className="mt-3 flex min-h-12 items-center justify-center rounded-full bg-cocoa px-4 py-3 text-[16px] font-bold text-white">우리 집 설정하기</Link>
  </section>;
}

export default function ConnectPage() {
  const { view, needsLogin, provider, error } = useApp();
  const router = useRouter();
  useEffect(() => { if (needsLogin) router.replace('/login/?next=connect'); }, [needsLogin, router]);
  const returnTo = view ? guardianStartPath(view.onboardingStep) : null;
  return <main className="flex flex-1 flex-col gap-5 px-5 pt-6 pb-8">
    <Logo />
    <div><h1 className="text-[28px] leading-snug font-bold text-cocoa">우리 집 기기 연결</h1><p className="mt-2 text-[16px] leading-relaxed text-muted">밥솥 플러그를 쓰는 가정에서 선택하는 단계예요. 기기 연결은 나중에 해도 괜찮아요.</p></div>
    {!view || needsLogin
      ? <p role="status" className="text-[16px]">{error || '내 계정을 확인하고 있어요…'}</p>
      : provider === 'firebase' && !view.seniorConsent && returnTo === '/tutorial'
        ? <BeforeHouseholdConsent />
        : provider === 'firebase' ? <SmartThingsPanel showConsentLink /> : <SmartThingsAccountCard />}
    {returnTo && !needsLogin && !(returnTo === '/onboarding' && provider === 'firebase' && !view?.seniorConsent) &&
      <Link href={returnTo} className="flex min-h-12 items-center justify-center rounded-full border border-line px-4 py-3 text-[16px] font-bold text-cocoa">{returnTo === '/tutorial' ? '나중에 연결하고 앱 소개 보기' : returnTo === '/onboarding' ? '우리 집 설정 이어가기' : '홈으로 돌아가기'}</Link>}
  </main>;
}
