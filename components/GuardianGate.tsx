"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useApp } from "@/lib/data/useApp";
import { useAlertNotifications } from "@/lib/push";

/** 로그인·온보딩 전이면 보낸다. */
export function GuardianGate({ children }: { children: ReactNode }) {
  const { view, needsLogin } = useApp();
  const router = useRouter();
  // 알림을 켜 둔 보호자에게, 새 알림을 휴대폰 알림으로도 띄운다
  useAlertNotifications(view);
  useEffect(() => {
    if (needsLogin || (view && view.onboardingStep <= 7)) router.replace("/guardian-setup");
  }, [view, needsLogin, router]);
  return <div className="flex flex-1 flex-col">{view && view.onboardingStep > 7 ? children : <p className="p-6 text-cocoa/80" role="status">보호자 정보를 확인하고 있어요…</p>}</div>;
}
