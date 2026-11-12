"use client";

import { useEffect, useRef } from "react";
import { verifyCallback } from "@/lib/auth/verifyCallback";
import { clearLive } from "@/lib/data/live";
import { rememberAccount } from "@/lib/data/accounts";
import { setMode } from "@/lib/data/mode";
import { supabase, supabaseConfigured } from "@/lib/supabase";

type Failure = "cancelled" | "expired" | "configuration";

function backToLogin(reason: Failure) {
  location.replace(`/login?auth_error=${reason}`);
}

/** Google·Kakao OAuth 및 이메일 링크의 PKCE 코드 교환을 한 곳에서 처리한다. */
export default function AuthCallbackPage() {
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const finish = async () => {
      const query = new URLSearchParams(location.search);
      if (query.has("error")) {
        backToLogin(query.get("error") === "access_denied" ? "cancelled" : "configuration");
        return;
      }
      const code = query.get("code");
      if (!code) {
        backToLogin("expired");
        return;
      }
      if (!supabaseConfigured) {
        backToLogin("configuration");
        return;
      }

      try {
        const email = await verifyCallback(code, supabase().auth);

        clearLive();
        if (email) rememberAccount(email);
        setMode("live");
        location.replace("/start");
      } catch {
        backToLogin("expired");
      }
    };

    void finish();
  }, []);

  return (
    <main className="flex flex-1 items-center justify-center px-6 text-center">
      <div role="status" aria-live="polite">
        <h1 className="text-[22px] font-bold text-cocoa">로그인 확인 중이에요</h1>
        <p className="mt-2 text-[15px] text-muted">잠시만 기다려 주세요.</p>
      </div>
    </main>
  );
}
