"use client";

import { useEffect, useState } from "react";
import { getSocialLoginAvailability, supabase, supabaseConfigured } from "@/lib/supabase";

type Provider = "kakao" | "google";

/**
 * 카카오·구글 간편 로그인 (Supabase OAuth). 이메일 링크와 같이 /start?code= 로 돌아온다.
 * Supabase 대시보드 > Authentication > Providers에서 각 공급자를 켜야 동작한다.
 * 버튼 색·로고는 각 회사의 로그인 버튼 가이드를 따른다.
 */
export function SocialLogin() {
  const [busy, setBusy] = useState<Provider | null>(null);
  const [error, setError] = useState("");
  const [available, setAvailable] = useState<Record<Provider, boolean> | null>(null);
  useEffect(() => {
    if (!supabaseConfigured) return;
    const controller = new AbortController();
    void getSocialLoginAvailability(controller.signal).then(setAvailable).catch(() => {
      if (!controller.signal.aborted) setAvailable({ kakao: false, google: false });
    });
    return () => controller.abort();
  }, []);

  const login = async (provider: Provider) => {
    setBusy(provider);
    setError("");
    const { error } = await supabase().auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${location.origin}/start` },
    });
    // 성공하면 공급자 화면으로 이동하므로 여기로 돌아오는 건 실패뿐이다
    if (error) {
      setError("로그인 화면을 열지 못했어요. 잠시 후 다시 시도해 주세요.");
      setBusy(null);
    }
  };

  const off = !supabaseConfigured || busy !== null;
  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={() => void login("kakao")}
        disabled={off || !available?.kakao}
        className="relative flex min-h-14 w-full items-center justify-center rounded-full bg-kakao px-6 text-[17px] font-bold text-kakao-label transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
      >
        <KakaoSymbol className="absolute left-6 h-5 w-5" />
        {busy === "kakao" ? "카카오로 이동 중…" : "카카오로 시작하기"}
      </button>
      <button
        onClick={() => void login("google")}
        disabled={off || !available?.google}
        className="relative flex min-h-14 w-full items-center justify-center rounded-full border-2 border-line bg-paper px-6 text-[17px] font-bold text-ink transition-colors hover:border-muted/50 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <GoogleLogo className="absolute left-6 h-5 w-5" />
        {busy === "google" ? "Google로 이동 중…" : "Google로 시작하기"}
      </button>
      <p className="text-center text-[15px] text-cocoa/75" role="status">
        {!supabaseConfigured ? "이 미리보기에서는 간편 로그인을 사용하지 않아요." :
          !available ? "간편 로그인을 확인하고 있어요." :
            !available.kakao || !available.google ? "준비되지 않은 로그인은 비활성화돼요. 이메일로도 시작할 수 있어요." : ""}
      </p>
      {error ? <p className="text-[14px] font-semibold text-blush-deep">{error}</p> : null}
    </div>
  );
}

function KakaoSymbol({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path fill="#000" d="M12 3C6.48 3 2 6.53 2 10.88c0 2.82 1.88 5.29 4.7 6.68l-.96 3.53c-.08.31.27.56.54.38l4.18-2.77c.5.06 1.01.1 1.54.1 5.52 0 10-3.53 10-7.92S17.52 3 12 3z" />
    </svg>
  );
}

function GoogleLogo({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
