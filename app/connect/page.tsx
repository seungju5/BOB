'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { SmartThingsPanel } from '@/components/SmartThingsPanel';
import { Logo } from '@/components/Mascot';
import { useApp } from '@/lib/data/useApp';
import { ONBOARDING_COMPLETE } from '@/lib/data/view';

export default function ConnectPage() {
  const { view, needsLogin, provider, accountKey, error } = useApp();
  const router = useRouter();
  useEffect(() => { if (needsLogin) router.replace('/login'); }, [needsLogin, router]);
  const returnTo = view && view.onboardingStep < ONBOARDING_COMPLETE ? '/onboarding' : '/home';
  return <main className="flex flex-1 flex-col gap-5 px-5 pt-6 pb-8">
    <Logo />
    <div><h1 className="text-[28px] leading-snug font-bold text-cocoa">우리 집 기기 연결</h1><p className="mt-2 text-[16px] leading-relaxed text-muted">삼성 계정으로 허용하고 밥솥에 꽂은 플러그를 골라 주세요.</p></div>
    {!view || needsLogin ? <p role="status" className="text-[16px]">{error || '내 계정을 확인하고 있어요…'}</p> : provider === 'firebase' ? <>
      {!view.seniorConsent ? <div className="rounded-2xl bg-butter-soft p-4 text-[16px]"><p>연결하기 전에 어르신의 정보 이용 동의를 확인해 주세요. 기존 연결은 아래에서 해제할 수 있어요.</p><Link href="/settings#device" className="mt-2 flex min-h-12 items-center font-bold underline">동의 확인하러 가기</Link></div> : null}
      <SmartThingsPanel accountKey={accountKey} returnTo={returnTo} />
    </> : <p className="rounded-2xl bg-butter-soft p-4 text-[16px]">실제 삼성 계정 연결은 밥뭇나 Firebase 계정으로 로그인한 뒤 이용해 주세요. 예시 체험에서는 실제 기기에 연결하지 않아요.</p>}
    <Link href={returnTo} className="flex min-h-12 items-center justify-center rounded-full border border-line px-4 py-3 text-[16px] font-bold text-cocoa">{returnTo === '/onboarding' ? '우리 집 설정 이어가기' : '홈으로 돌아가기'}</Link>
  </main>;
}
