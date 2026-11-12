"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { GuardianTutorial } from "@/components/GuardianTutorial";
import { TextInput } from "@/components/forms";
import { Logo, CookerMascot } from "@/components/Mascot";
import { SocialLogin } from "@/components/SocialLogin";
import { Button, ButtonLink } from "@/components/ui";
import { setMode, useSession } from "@/lib/data/mode";
import { clearDemoIntro, readIntroSeen, rememberIntroSeen, setDeviceCoach } from "@/lib/data/setup-progress";
import { useApp } from "@/lib/data/useApp";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import { Fold, LifeSettings } from "./LifeSettings";

const STAGES = ["계정", "앱 안내", "우리 집"];

export function GuardianSetup() {
  const router = useRouter();
  const session = useSession();
  const { view, actions, error, needsLogin, mode, ownerId } = useApp();
  const [demoStarted, setDemoStarted] = useState(false);
  const [finishedIntroFor, setFinishedIntroFor] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const scope = ownerId ?? "demo";
  const resumeDemo = view?.mode === "demo" && view.onboardingStep <= 7 && readIntroSeen(null);
  const inFlow = !!view && (view.mode === "live" || demoStarted || resumeDemo);
  const introSeen = finishedIntroFor === scope || resumeDemo || (scope !== "demo" && readIntroSeen(ownerId));
  const complete = view?.mode === "live" && view.onboardingStep > 7;
  const stage = !inFlow ? 1 : !introSeen ? 2 : 3;

  useEffect(() => {
    if (session && mode === null) setMode("live");
  }, [session, mode]);
  useEffect(() => {
    if (complete) router.replace("/home");
  }, [complete, router]);
  useEffect(() => {
    if (stage === 3) heading.current?.focus({ preventScroll: true });
  }, [stage]);
  function finishIntro() {
    if (ownerId) rememberIntroSeen(ownerId);
    setFinishedIntroFor(scope);
    window.scrollTo(0, 0);
  }
  function tryDemo() {
    clearDemoIntro();
    setMode("demo");
    setDemoStarted(true);
    setFinishedIntroFor(null);
    setConsent(false);
    window.scrollTo(0, 0);
  }

  return (
    <main className="flex flex-1 flex-col bg-cream px-3 pb-6 pt-3 text-[16px] text-cocoa sm:px-5">
      <div className="flex flex-1 flex-col rounded-[1.8rem] border border-line bg-paper p-4 shadow-[var(--shadow-soft)] sm:p-5">
        <header className="flex items-center justify-between gap-2 border-b border-line pb-2">
          <Link href="/" aria-label="밥뭇나 처음으로"><Logo /></Link>
          <span className="text-[14px] font-bold text-cocoa/75">{demoStarted ? "예시 체험" : "보호자용"}</span>
        </header>
        <ol aria-label="시작 순서" className="my-4 grid grid-cols-3 gap-1.5 text-center text-[13px] font-bold sm:text-[14px]">
          {STAGES.map((name, i) => (
            <li key={name} aria-current={stage === i + 1 ? "step" : undefined} className={`rounded-full px-1 py-2 ${stage === i + 1 ? "bg-butter" : "bg-butter-soft"}`}>
              {i + 1} {name}
            </li>
          ))}
        </ol>
        {complete ? <p role="status">보호자 홈으로 이동하고 있어요…</p> : stage === 2 ? (
          <GuardianTutorial onComplete={finishIntro} />
        ) : (
          <>
            <div className={`flex ${stage === 1 ? "flex-col-reverse items-center text-center" : "items-center justify-between gap-1"}`}>
              <h1 ref={heading} tabIndex={-1} className="text-[clamp(1.55rem,7vw,1.95rem)] font-bold leading-tight">
                {stage === 1 ? "보호자님, 반가워요." : "어떤 댁인지 알려 주세요."}
              </h1>
              <CookerMascot className={`animate-bob ${stage === 1 ? "size-27" : "size-19"} shrink-0`} />
            </div>
            <div className="mt-4 flex flex-col gap-3">
              {error && !view && <p role="alert" className="text-[15px] text-blush-deep">보호자 정보를 불러오지 못했어요. 페이지를 다시 열어 주세요.</p>}
              {stage === 1 ? (
                <Account loading={!!session && !view && !needsLogin && !error} onDemo={tryDemo} />
              ) : view && (
                <>
                  <p>이름과 호칭만 먼저 알려 주세요. 끼니와 생활 기준은 기본값을 쓰거나 지금 바꿀 수 있어요.</p>
                  <LifeSettings
                    key={scope}
                    view={view}
                    actions={actions}
                    consent={consent}
                    onConsent={setConsent}
                    onSave={() => {
                      if (view.mode === "demo") clearDemoIntro();
                      setDeviceCoach(view.plug.deviceId ? null : scope);
                      router.replace("/home");
                    }}
                  />
                </>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function Account({ loading, onDemo }: { loading: boolean; onDemo: () => void }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  async function send() {
    setStatus("sending");
    try {
      const { error } = await supabase().auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: `${location.origin}/start` } });
      if (error) throw error;
      setStatus("sent");
    } catch { setStatus("error"); }
  }
  if (loading) return <p className="text-center" role="status">계정을 확인하고 있어요…</p>;
  return (
    <>
      <p className="text-center text-[16px]">밥솥 사용 소식을 다정한 안부로 전해요.</p>
      <div className="rounded-2xl bg-butter-soft p-4">
        <strong>먼저 내 계정으로 시작해요.</strong><span className="mt-1 block text-[15px]">밥솥은 홈에 들어간 뒤 연결해도 돼요.</span>
      </div>
      <SocialLogin />
      {supabaseConfigured && (
        <Fold label="이메일로 시작하기" hint="이메일 링크로 가입하거나 로그인해요.">
          {status === "sent" ? (
            <>
              <p role="status">메일을 보냈어요. 이 브라우저에서 링크를 열어 주세요.</p>
              <Button variant="outline" onClick={() => setStatus("idle")}>다른 이메일 쓰기</Button>
            </>
          ) : (
            <form className="flex flex-col gap-2" onSubmit={(event) => { event.preventDefault(); void send(); }}>
              <label className="flex flex-col gap-1">
                <strong>이메일</strong>
                <TextInput type="email" autoComplete="email" inputMode="email" required placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              </label>
              <Button type="submit" disabled={status === "sending" || !email.trim()}>{status === "sending" ? "보내는 중…" : "로그인 링크 받기"}</Button>
              {status === "error" && <p role="alert" className="text-[15px] text-blush-deep">메일을 보내지 못했어요. 주소를 확인한 뒤 다시 시도해 주세요.</p>}
            </form>
          )}
        </Fold>
      )}
      <Button variant={supabaseConfigured ? "outline" : "primary"} onClick={onDemo}>로그인 없이 체험하기</Button>
      <ButtonLink href="/onboarding" variant="ghost">기존 보호자 설정 열기</ButtonLink>
    </>
  );
}
