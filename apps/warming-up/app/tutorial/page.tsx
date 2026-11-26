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
import styles from "./tutorial.module.css";
import "@/components/senior/senior-home.css";
import { Mascot } from "@/components/Mascot";
import { FlowProgress } from "@/components/onboarding/FlowProgress";
import { MealWeekExample } from "@/components/onboarding/MealWeekExample";
import { completeTutorial } from "@/components/onboarding/tutorial-flow";
import { Button, Skeleton } from "@/components/ui";
import { useApp } from "@/lib/data/useApp";
import { tutorialExitPath } from "@/lib/data/view";
import { PrivacyNotice } from "@/components/privacy/PrivacyNotice";
import { weeklyReportLabel } from "@/lib/alerts/copy";

/** 가입 후의 소개. 명시적으로 선택한 데모도 같은 소개를 별도로 체험한다. */

type Slide = { title: string; body: string; content: ReactNode };

const SLIDES: Slide[] = [
  {
    title: "밥솥이 안부를 전해요",
    body: "어르신이 동의한 밥솥에서 사용 소식이 오면 가족이 함께 볼 수 있어요.",
    content: <IntroFlow />,
  },
  {
    title: "소식이 뜸할 때",
    body: "정해 둔 시간에 소식이 없으면 알림을 보고 안부를 물어보세요.",
    content: (
      <div className="flex w-full flex-col gap-3">
        <InfoCard icon={IconBell} text={"점심시간이 지났는데\n아직 식사 소식이 없어요"} />
        <InfoCard icon={IconFile} text={`${weeklyReportLabel(new Date())} 리포트가\n발행되었어요`} />
      </div>
    ),
  },
  {
    title: "우리 집 한 주를 살펴봐요",
    body: "홈에서처럼 요일을 눌러 보세요. 그날 어느 시간대에 밥솥을 썼는지 보여요.",
    content: <MealWeekExample />,
  },
  {
    title: "어르신이 전하는 소식",
    body: "어르신 홈에 있는 세 가지 버튼이에요. 전하고 싶은 소식이 있을 때만 눌러요.",
    content: <SeniorButtons />,
  },
  {
    title: "우리 집 기기 연결",
    body: "우리 집 설정을 마치면 홈에서 기기 연결을 시작할 수 있어요.",
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
    <main className={styles.page}>
      <div className={styles.hero}>
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
        <div className={styles.copyStack}>
          {SLIDES.map((entry, i) => (
            <div key={entry.title} className={styles.copy} aria-hidden={i !== index}>
              <h1 ref={i === index ? heading : undefined} tabIndex={-1}>{entry.title}</h1>
              <p>{entry.body}</p>
            </div>
          ))}
        </div>
      </div>

      <section className={styles.sample} aria-label="소개 예시">
        {slide.content}
      </section>
      <div className={styles.controls}>
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
  const actions = [
    { icon: IconUtensils, label: "외식했어요", tone: "meal" },
    { icon: IconSuitcase, label: "놀러가요", tone: "away" },
    { icon: IconHeart, label: "도와줘요", tone: "help" },
  ];
  return (
    <div>
      <h2 className="text-[22px] font-bold text-cocoa">가족에게 소식 전하기</h2>
      <ul className="bapmunna-senior-actions" aria-label="어르신 홈의 버튼 예시">
        {actions.map(({ icon: Icon, label, tone }) => (
          <li key={tone} className="bapmunna-senior-action" data-tone={tone}>
            <span className="bapmunna-senior-action-icon" aria-hidden><Icon /></span>
            <strong>{label}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}
