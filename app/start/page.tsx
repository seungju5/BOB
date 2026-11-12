"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Button, ButtonLink, Skeleton } from "@/components/ui";
import { setMode, useSession } from "@/lib/data/mode";
import { useApp } from "@/lib/data/useApp";
import { supabaseConfigured } from "@/lib/supabase";

/** The allowlisted callback is shared by email and both social providers. */
export default function GuardianStart() {
  const { view, mode, needsLogin, error } = useApp();
  const session = useSession();
  const router = useRouter();

  useEffect(() => {
    const query = new URLSearchParams(location.search);
    if (supabaseConfigured && session === undefined) return;
    if (session && !query.has("demo")) {
      if (mode !== "live") setMode("live");
      else if (view?.mode === "live") router.replace(view.onboardingStep > 7 ? "/home" : "/guardian-setup");
      return;
    }
    if (view?.mode === "demo") router.replace(view.onboardingStep > 7 ? "/home" : "/onboarding");
    else if (needsLogin || !session) router.replace("/guardian-setup");
  }, [view, mode, session, needsLogin, router]);

  return (
    <main className="flex flex-1 flex-col gap-4 p-6">
      {error ? (
        <>
          <p className="text-[16px] font-bold text-blush-deep">정보를 불러오지 못했어요.</p>
          <p className="text-[13px] text-muted">{error}</p>
          <Button variant="outline" onClick={() => location.reload()}>
            다시 시도
          </Button>
          <ButtonLink href="/guardian-setup" variant="ghost">통합 시작 화면으로</ButtonLink>
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
