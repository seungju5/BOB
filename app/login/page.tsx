"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { APP_BASE_PATH, appPath } from "@/lib/app-path";
import { TextInput } from "@/components/forms";
import { IconCheck } from "@/components/icons";
import { Mascot } from "@/components/Mascot";
import { Button, PageHeader } from "@/components/ui";
import { SocialLogin } from "@/components/SocialLogin";
import { forgetAccount, rememberAccount, useRecentAccounts } from "@/lib/data/accounts";
import { setMode, useSession } from "@/lib/data/mode";
import { supabase, supabaseConfigured } from "@/lib/supabase";

/** 보호자 로그인: Google·Kakao OAuth와 이메일 로그인 링크 */
function readAuthError() {
  const reason = new URLSearchParams(location.search).get("auth_error");
  if (reason === "cancelled") return "로그인이 취소됐어요. 다시 시도해 주세요.";
  if (reason === "expired") return "로그인 링크가 만료됐거나 이미 사용됐어요. 다시 시도해 주세요.";
  if (reason === "configuration") return "로그인 설정을 확인하고 있어요. 잠시 후 다시 시도해 주세요.";
  return "";
}

export default function LoginPage() {
  const router = useRouter();
  const session = useSession();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const authError = useSyncExternalStore(() => () => {}, readAuthError, () => "");

  const recent = useRecentAccounts();

  useEffect(() => {
    if (session) {
      if (session.user.email) rememberAccount(session.user.email);
      setMode("live");
      router.replace("/start");
    }
  }, [session, router]);

  const send = async () => {
    setBusy(true);
    setError("");
    const { error } = await supabase().auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${location.origin}${appPath("/auth/callback")}` },
    });
    setBusy(false);
    if (error) setError(error.message.includes("rate") ? "잠시 후 다시 시도해 주세요. (메일 발송 제한)" : "메일을 보내지 못했어요. 주소를 확인해 주세요.");
    else setSent(true);
  };

  const demo = () => {
    setMode("demo");
    router.push("/start");
  };

  return (
    <main className="flex flex-1 flex-col pb-8">
      <PageHeader back="/" />
      <div className="mx-6 flex flex-1 flex-col rounded-[1.75rem] border border-line bg-paper px-5 py-7 shadow-[var(--shadow-soft)]">
        <Mascot className="mx-auto h-24 w-24" />
        <h1 className="mt-4 text-center text-[28px] leading-snug font-extrabold text-cocoa">보호자님, 반가워요.</h1>
        <p className="mt-2 text-center text-[15px] text-muted">멀리 있어도, 안부는 가까이.</p>
        {!sent ? (
          <div className="mt-8">
            {authError ? <p role="alert" className="mb-4 text-[14px] font-semibold text-blush-deep">{authError}</p> : null}
            <SocialLogin />
            {supabaseConfigured ? (
              <div className="mt-6 flex items-center gap-3 text-[13px] text-muted" aria-hidden>
                <span className="h-px flex-1 bg-line" />
                또는 이메일로
                <span className="h-px flex-1 bg-line" />
              </div>
            ) : null}
          </div>
        ) : null}
        {!supabaseConfigured ? (
          <p className="mt-4 text-[15px] leading-relaxed text-muted">
            {APP_BASE_PATH === "/bapmunna/app"
              ? "Google·이메일 로그인은 기존 계정 화면에서 이용해요. 아래 데모의 체험 기록과 계정 기록은 별도로 보관돼요."
              : "지금은 로그인 없이 데모로 둘러볼 수 있어요."}
          </p>
        ) : sent ? (
          <div className="mt-8 flex flex-col items-center rounded-[1.75rem] bg-butter-soft px-6 py-8 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-sage text-sage-deep">
              <IconCheck className="h-8 w-8" />
            </span>
            <p className="mt-4 text-[18px] font-bold text-cocoa">메일함을 확인해 주세요</p>
            <p className="mt-1 text-[14px] leading-relaxed text-cocoa/70">
              {email}로 로그인 링크를 보냈어요.
              <br />이 브라우저에서 링크를 열어 주세요.
            </p>
            <button className="mt-4 text-[14px] font-semibold text-cocoa/70 underline" onClick={() => setSent(false)}>
              다른 주소로 받기
            </button>
          </div>
        ) : (
          <div className="mt-6 flex flex-col gap-3">
            {recent.length ? (
              <div className="mb-3">
                <p className="text-[15px] font-bold text-cocoa">최근 사용한 계정</p>
                <ul className="mt-2 flex flex-col gap-2">
                  {recent.map((a) => (
                    <li key={a} className="flex items-center gap-1">
                      <button
                        onClick={() => setEmail(a)}
                        className={`flex min-h-12 min-w-0 flex-1 items-center rounded-2xl border-2 px-4 text-left text-[15px] font-semibold text-cocoa ${email === a ? "border-butter-deep bg-butter-soft" : "border-line bg-paper"}`}
                      >
                        <span className="truncate">{a}</span>
                      </button>
                      <button
                        aria-label={`${a} 목록에서 지우기`}
                        onClick={() => {
                          forgetAccount(a);
                          if (email === a) setEmail("");
                        }}
                        className="grid h-12 w-10 shrink-0 place-items-center text-[18px] text-muted hover:text-cocoa"
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <label className="text-[15px] font-bold text-cocoa" htmlFor="email">
              이메일
            </label>
            <TextInput id="email" type="email" autoComplete="email" inputMode="email" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            {error ? <p className="text-[14px] font-semibold text-blush-deep">{error}</p> : null}
            <p className="text-[13px] text-muted">비밀번호 없이, 메일로 받은 링크로 로그인해요.</p>
          </div>
        )}
        <div className="mt-8 flex flex-col gap-2">
          {supabaseConfigured && !sent ? (
            <Button disabled={busy || !/^\S+@\S+\.\S+$/.test(email.trim())} onClick={send}>
              {busy ? "보내는 중…" : "로그인 링크 받기"}
            </Button>
          ) : null}
          <Button variant="ghost" onClick={demo}>
            로그인 없이 데모로 둘러보기
          </Button>
        </div>
      </div>
    </main>
  );
}
