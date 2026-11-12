"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Button, Skeleton } from "@/components/ui";
import { useApp } from "@/lib/data/useApp";

/** 보호자 진입점. 과거 /start로 보낸 로그인 링크도 콜백으로 넘긴다. */
export default function GuardianStart() {
  const { view, needsLogin, error } = useApp();
  const router = useRouter();

  useEffect(() => {
    const query = new URLSearchParams(location.search);
    if (query.has("code") || query.has("error")) location.replace(`/auth/callback${location.search}`);
  }, []);

  useEffect(() => {
    const query = new URLSearchParams(location.search);
    if (query.has("code") || query.has("error")) return;
    if (needsLogin) router.replace("/login");
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
