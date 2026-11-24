"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ComponentType, type ReactNode, type SVGProps } from "react";
import {
  IconArrowRight,
  IconBell,
  IconCheckSquare,
  IconCooker,
  IconFile,
  IconHeart,
  IconLock,
  IconSmartphone,
  IconPlug,
  IconSuitcase,
  IconUtensils,
} from "@/components/icons";
import { Mascot } from "@/components/Mascot";
import { FlowProgress } from "@/components/onboarding/FlowProgress";
import { MealWeekExample } from "@/components/onboarding/MealWeekExample";
import { completeTutorial } from "@/components/onboarding/tutorial-flow";
import { Button, Skeleton } from "@/components/ui";
import { useApp } from "@/lib/data/useApp";
import { tutorialExitPath } from "@/lib/data/view";
import { PrivacyNotice } from "@/components/privacy/PrivacyNotice";

/** 가입 후의 소개. 명시적으로 선택한 데모도 같은 소개를 별도로 체험한다. */

type Slide = { title: string; body: string; content: ReactNode };

const SLIDES: Slide[] = [
  {
    title: "밥솥이 안부를\n전해 드려요",
    body: "동의하고 기기를 연결하면\n밥솥 사용 신호로\n안부를 살펴볼 수 있어요.",
    content: <IntroFlow />,
  },
  {
    title: "소식이 뜸하면\n안부를 물어봐요",
    body: "설정한 시간에 소식이 없으면\n안부를 물을 계기가 돼요.\n실제 식사 여부를 단정하지 않아요.",
    content: (
      <div className="flex w-full flex-col gap-3">
        <InfoCard icon={IconBell} text={"점심시간이 지났는데\n아직 식사 소식이 없어요"} />
        <InfoCard icon={IconFile} text={"주간 리포트가\n발행되었어요"} />
      </div>
    ),
  },
  {
    title: "밥솥 소식을 살펴봐요",
    body: "요일을 눌러 보세요. 채워진 점은\n밥솥을 쓴 시간대를 뜻해요.",
    content: <MealWeekExample />,
  },
  {
    title: "어르신도\n버튼 하나로\n소식을 보내요",
    body: "가족 연결을 마친 뒤\n필요할 때 소식을 남겨요.\n매일 누르지 않아도 괜찮아요.",
    content: <SeniorButtons />,
  },
  {
    title: "기기 연결은\n홈에서 준비해요",
    body: "우리 집 설정을 마치고\n홈의 ‘기기 연결 준비하기’에서\n원할 때 시작해요.",
    content: <ReadyChecklist />,
  },
];

const READY: { icon: Icon; title: string; hint: string }[] = [
  { icon: IconSmartphone, title: "삼성 SmartThings 계정", hint: "사용할 플러그가 등록된 계정을 준비해요" },
  { icon: IconPlug, title: "전력 측정 지원 스마트플러그", hint: "밥솥에 연결할 기기가 전력 측정을 지원하는지 확인해요" },
  { icon: IconLock, title: "어르신 동의와 연결 허용", hint: "어르신의 동의를 확인하고 홈에서 연결 권한을 살펴봐요" },
];

/** T-05 준비물: 번호가 이어지는 체크리스트 카드 */
function ReadyChecklist() {
  return (
    <ol className="relative flex w-full flex-col gap-3">
      {/* 카드를 잇는 점선 */}
      <span aria-hidden className="absolute top-8 bottom-8 left-[2.375rem] border-l-2 border-dashed border-butter-deep/50" />
      {READY.map(({ icon: Icon, title, hint }, i) => (
        <li
          key={title}
          className="animate-rise motion-reduce:animate-none relative flex items-center gap-4 rounded-[1.25rem] bg-butter-soft py-3.5 pr-4 pl-4"
          style={{ animationDelay: `${120 + i * 90}ms` }}
        >
          <span className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full bg-butter text-cocoa shadow-[0_0_0_4px_var(--color-butter-soft)]">
            <Icon className="h-6 w-6" />
            <span className="absolute -top-1 -right-1 grid h-5 w-5 place-items-center rounded-full bg-cocoa text-[11px] leading-none text-paper">{i + 1}</span>
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-[18px] leading-[1.5] font-medium tracking-[-0.02em] text-cocoa">{title}</span>
            <span className="mt-1 text-[16px] leading-[1.6] text-cocoa/75">{hint}</span>
          </span>
          <IconCheckSquare className="h-6 w-6 shrink-0 text-butter-deep" />
        </li>
      ))}
    </ol>
  );
}

export default function TutorialPage() {
  const router = useRouter();
  const { view, actions, needsLogin, error } = useApp();
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState("");
  const saving = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const hasView = Boolean(view);
  useEffect(() => { if (needsLogin) router.replace("/login"); }, [needsLogin, router]);
  useEffect(() => { heading.current?.focus(); }, [index, hasView]);
  if (needsLogin || !view) return <main className="flex flex-1 flex-col gap-4 p-6">{error ? <><p role="alert" className="text-[18px] text-blush-deep">로그인 정보를 확인하지 못했어요.</p><Button onClick={() => location.reload()}>다시 시도</Button></> : <><Skeleton className="h-12" /><Skeleton className="h-48" /></>}</main>;
  const destination = tutorialExitPath(view.onboardingStep);
  const returning = destination === "/home";
  const slide = SLIDES[index];
  const last = index === SLIDES.length - 1;
  const finishIntro = async () => {
    if (saving.current) return;
    saving.current = true; setBusy(true); setSaveError("");
    try {
      const next = await completeTutorial(view.onboardingStep, actions);
      router.push(next);
    } catch { setSaveError("소개를 마친 상태를 저장하지 못했어요. 지금 화면은 그대로이니 다시 눌러 주세요."); }
    finally { saving.current = false; setBusy(false); }
  };

  return (
    <main className="font-sans flex flex-1 flex-col bg-butter">
      <div className="px-6 pt-5">
        <FlowProgress current="intro" isDemo={view.mode === "demo"} />
        {view.mode === "demo" ? <p className="mt-3 text-[16px] leading-normal font-semibold text-cocoa/80">예시 체험 · 실제 연결 없음</p> : null}
        <div className="mt-2 flex min-h-12 items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2" role="progressbar" aria-valuenow={index + 1} aria-valuemin={1} aria-valuemax={SLIDES.length} aria-valuetext={`소개 ${index + 1} / ${SLIDES.length}`} aria-label="튜토리얼 진행">
            <span className="mr-1 text-[16px] font-semibold text-cocoa">소개 {index + 1}/{SLIDES.length}</span>
            {SLIDES.map((_, i) => (
              <span key={i} className={`h-2.5 rounded-full transition-all ${i === index ? "w-7 bg-cocoa" : "w-2.5 bg-cocoa/20"}`} />
            ))}
          </div>
          <button type="button" disabled={busy} onClick={() => void finishIntro()} className="-mr-2 flex min-h-12 shrink-0 items-center rounded-full px-3 py-2 text-[16px] font-semibold text-cocoa/70 hover:text-cocoa focus-visible:outline-2 focus-visible:outline-cocoa disabled:opacity-50">
            {last ? returning ? "홈으로" : "우리 집으로" : "건너뛰기"}
          </button>
        </div>
        <div key={index} className="animate-rise motion-reduce:animate-none pb-5">
          <h1 ref={heading} tabIndex={-1} className="mt-3 text-[clamp(1.75rem,7.7vw,2rem)] leading-[1.3] font-semibold tracking-[-0.035em] whitespace-pre-line text-cocoa outline-none">{slide.title}</h1>
          <p className="mt-3 text-[18px] leading-[1.6] whitespace-pre-line text-cocoa/80">{slide.body}</p>
        </div>
      </div>

      {/* 시작 화면처럼 아래쪽은 흰 시트 */}
      <div className={`flex flex-1 flex-col rounded-t-[2.25rem] bg-paper pt-5 pb-6 ${index === 2 ? "px-4" : "px-6"}`}>
        <div key={index} className="animate-rise motion-reduce:animate-none flex flex-1 items-center justify-center pb-5">
          {slide.content}
        </div>
        {saveError ? <p role="alert" className="mb-4 text-[16px] leading-relaxed text-blush-deep">{saveError}</p> : null}
        <Button variant="dark" disabled={busy} className="min-h-14 text-[19px]" onClick={() => (last ? void finishIntro() : setIndex(index + 1))}>
          {busy ? "이어서 준비하고 있어요…" : last ? returning ? "홈으로 돌아가기" : "우리 집 알려주기" : "다음"}
        </Button>
        {last ? <Button variant="ghost" disabled={busy} className="mt-1 text-cocoa/70" onClick={() => setIndex(0)}>소개 처음부터 다시 보기</Button> : null}
        {index === 0 ? (
          <PrivacyNotice className="mt-2 text-center" />
        ) : (
          <Button variant="ghost" disabled={busy} className="mt-1 text-cocoa/70" onClick={() => setIndex(index - 1)}>
            이전
          </Button>
        )}
      </div>
    </main>
  );
}

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

function InfoCard({ icon: Icon, text }: { icon: Icon; text: string }) {
  return (
    <div className="flex items-start gap-3 rounded-[1.25rem] bg-butter-soft px-4 py-3.5">
      <Icon className="mt-0.5 h-6 w-6 shrink-0 text-cocoa" />
      <p className="text-[17px] leading-snug font-semibold whitespace-pre-line text-cocoa">{text}</p>
    </div>
  );
}

function IntroFlow() {
  const steps: Icon[] = [IconCooker, IconPlug, IconSmartphone];
  return (
    <div className="flex flex-col items-center gap-3">
      <Mascot className="animate-bob motion-reduce:animate-none h-32 w-32" mood="happy" />
      <div className="flex items-center gap-3 text-cocoa" aria-label="밥솥, 플러그, 휴대폰 순서로 소식이 전해져요">
        {steps.map((Step, i) => (
          <span key={i} className="flex items-center gap-3">
            {i > 0 ? <IconArrowRight className="h-6 w-6" /> : null}
            <Step className="h-8 w-8" />
          </span>
        ))}
      </div>
    </div>
  );
}

function SeniorButtons() {
  const buttons: { icon: Icon; label: string; className: string }[] = [
    { icon: IconUtensils, label: "외식했어요", className: "bg-butter-soft text-cocoa" },
    { icon: IconSuitcase, label: "놀러가요", className: "bg-butter-soft text-cocoa" },
    { icon: IconHeart, label: "도와줘요", className: "bg-blush text-blush-deep" },
  ];
  return (
    <div className="w-full rounded-[var(--radius-card)] border-2 border-line bg-paper px-3 py-3.5">
      <p className="px-1 text-[16px] text-muted">필요한 소식만 가볍게 남겨요.</p>
      <div className="mt-2.5 grid grid-cols-3 gap-2" aria-hidden>
        {buttons.map(({ icon: Icon, label, className }) => (
          <div key={label} className={`flex h-24 flex-col items-center justify-center gap-1.5 rounded-2xl ${className}`}>
            <Icon className="h-7 w-7" />
            <span className="text-[16px] font-bold">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
