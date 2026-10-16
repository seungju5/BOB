"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useApp } from "@/lib/data/useApp";

/** 로그인·온보딩 전이면 보낸다. */
export function GuardianGate({ children }: { children: ReactNode }) {
  const { view, needsLogin } = useApp();
  const router = useRouter();
  useEffect(() => {
    if (needsLogin) router.replace("/login");
    else if (view && view.onboardingStep <= 7) router.replace("/onboarding");
  }, [view, needsLogin, router]);
  return <div className="flex flex-1 flex-col">{children}</div>;
}
