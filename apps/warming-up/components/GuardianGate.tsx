"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { guardianStartPath, isDemoView } from "@/lib/data/view";
import { useApp } from "@/lib/data/useApp";
import { useAlertNotifications } from "@/lib/push";

/** 로그인·온보딩 전이면 보낸다. */
export function GuardianGate({ children }: { children: ReactNode }) {
  const { view, needsLogin, accountKey, error } = useApp();
  const router = useRouter();
  // 알림을 켜 둔 보호자에게, 새 알림을 휴대폰 알림으로도 띄운다
  useAlertNotifications(view);
  useEffect(() => {
    if (needsLogin) router.replace("/login");
    else if (view && view.onboardingStep <= 7) router.replace(guardianStartPath(view.onboardingStep));
  }, [view, needsLogin, router]);
  if (error) return <main className="p-6"><p role="alert">{error}</p><button className="mt-4 min-h-12 rounded-full bg-butter px-6" onClick={() => location.reload()}>다시 확인</button></main>;
  if (needsLogin || !view || view.onboardingStep <= 7) return <main className="p-6" role="status">내 정보를 확인하고 있어요…</main>;
  return <div key={accountKey} className="flex flex-1 flex-col">
    {isDemoView(view) && <p className="border-b border-line bg-butter-soft px-6 py-2 text-sm text-cocoa"><strong>예시 체험 중</strong> · 화면의 기기와 가족 기록은 가상 데이터예요.</p>}
    {children}
  </div>;
}
