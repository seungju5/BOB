"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useApp } from "@/lib/data/useApp";
import { useAlertNotifications } from "@/lib/push";

/** 로그인·온보딩 전이면 보낸다. */
export function GuardianGate({ children }: { children: ReactNode }) {
  const { view, needsLogin } = useApp();
  const router = useRouter();
  const path = usePathname();
  // 알림을 켜 둔 보호자에게, 새 알림을 휴대폰 알림으로도 띄운다
  useAlertNotifications(view);
  useEffect(() => {
    if (needsLogin || (view && view.onboardingStep <= 7)) router.replace("/guardian-setup");
  }, [view, needsLogin, router]);
  const needsConsent = view?.mode === "live" && !view.seniorConsent && ["/report", "/records"].includes(path);
  return (
    <div className="flex flex-1 flex-col">
      {!view || view.onboardingStep <= 7 ? <p className="p-6 text-cocoa/80" role="status">보호자 정보를 확인하고 있어요…</p> :
        needsConsent ? (
          <main className="m-6 rounded-2xl bg-butter-soft p-5">
            <h1 className="text-xl font-bold">아직 생활 리포트를 시작하지 않았어요.</h1>
            <p className="mt-2 text-[15px]">어르신이 별도로 동의하시면 기기 설정에서 시작할 수 있어요.</p>
            <Link className="mt-3 inline-flex min-h-11 items-center underline" href="/settings?section=devices#device">기기 설정 보기</Link>
          </main>
        ) : children}
    </div>
  );
}
