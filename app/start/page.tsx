"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Button, Skeleton } from "@/components/ui";
import { setMode } from "@/lib/data/mode";
import { useApp } from "@/lib/data/useApp";
import { supabaseConfigured } from "@/lib/supabase";

/** 보호자 진입점: 로그인 링크도 이리로 돌아온다. 온보딩이 끝났으면 홈, 아니면 온보딩. */
export default function GuardianStart() {
  const { view, mode, needsLogin, error } = useApp();
  const router = useRouter();

  useEffect(() => {
    // 로그인 링크(?code=)로 돌아왔으면 실서비스 모드
    if (mode === null && supabaseConfigured && new URLSearchParams(location.search).has("code")) setMode("live");
  }, [mode]);

  useEffect(() => {
    if (needsLogin && !new URLSearchParams(location.search).has("code")) router.replace("/login");
    else if (view) router.replace(view.onboardingStep > 7 ? "/home" : "/onboarding");
  }, [view, needsLogin, router]);

  return (
    <main className="flex flex-1 flex-col gap-4 p-6">
      {error ? (
        <>
          <p className="text-[16px] font-bold text-blush-deep">정보를 불러오지 못했어요.</p>
          <p className="text-[13px] text-muted">{error}</p>
          <Button variant="outline" onClick={() => location.reload()}>
            다시 시도
          </Button>
        </>
      ) : (
        <>
          <Skeleton className="h-10 w-40" />
          <Skeleton className="h-40" />
        </>
      )}
    </main>
  );
}
