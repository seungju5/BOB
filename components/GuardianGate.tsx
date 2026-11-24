"use client";

import { useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { guardianStartPath } from "@/lib/data/view";
import { useApp } from "@/lib/data/useApp";
import { useAlertNotifications } from "@/lib/push";
import { rememberNoticeReturn, takeNoticeReturn } from "@/lib/alerts/notification-return";

/** 로그인·온보딩 전이면 보낸다. */
function listenForNavigation(refresh: () => void) {
  window.addEventListener("popstate", refresh);
  return () => window.removeEventListener("popstate", refresh);
}

export function GuardianGate({ children }: { children: ReactNode }) {
  const { view, needsLogin, accountKey, error } = useApp();
  const router = useRouter();
  const fromNotice = useSyncExternalStore(listenForNavigation,
    () => new URLSearchParams(location.search).get("from") === "notice", () => false);
  const needsRealAccount = fromNotice && view?.mode === "demo";
  // 알림을 켜 둔 보호자에게, 새 알림을 휴대폰 알림으로도 띄운다
  useAlertNotifications(view, accountKey);
  useEffect(() => {
    if (needsLogin || needsRealAccount) {
      rememberNoticeReturn();
      router.replace("/login");
    } else if (view && view.onboardingStep <= 7) router.replace(guardianStartPath(view.onboardingStep));
    else if (view) {
      const next = takeNoticeReturn();
      if (next && view.mode === "live") router.replace(next);
    }
  }, [view, needsLogin, needsRealAccount, router]);
  if (error) return <main className="p-6"><p role="alert">{error}</p><button className="mt-4 min-h-12 rounded-full bg-butter px-6" onClick={() => location.reload()}>다시 확인</button></main>;
  if (needsLogin || needsRealAccount || !view || view.onboardingStep <= 7) return <main className="p-6" role="status">내 정보를 확인하고 있어요…</main>;
  return <div key={accountKey} className="flex flex-1 flex-col">{children}</div>;
}
