"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ComponentType, type ReactNode, type SVGProps } from "react";
import {
  IconArrowRight,
  IconBell,
  IconCheckSquare,
  IconCooker,
  IconFile,
  IconHeart,
  IconSmartphone,
  IconPlug,
  IconSuitcase,
  IconUtensils,
} from "@/components/icons";
import { Mascot } from "@/components/Mascot";
import { Button, Skeleton } from "@/components/ui";
import { useApp } from "@/lib/data/useApp";
import { tutorialExitPath } from "@/lib/data/view";

/** 가입 후의 소개. 명시적으로 선택한 데모도 같은 소개를 별도로 체험한다. */
const POLICY_URL = "https://app.notion.com/p/4163d756e70080399649fedbb690842f?source=copy_link";

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
    title: "하루 식사를\n색으로 한눈에",
    body: "기록 화면에서 날짜를\n누르면 그날 식사를\n볼 수 있어요.",
    content: <WeekLegend />,
  },
  {
    title: "어르신도\n버튼 하나로\n소식을 보내요",
    body: "가족 연결을 마친 뒤\n필요할 때 소식을 남겨요.\n매일 누르지 않아도 괜찮아요.",
    content: <SeniorButtons />,
  },
  {
    title: "우리 집 안부를\n함께 살펴봐요",
    body: "먼저 어떤 댁인지 알려 주세요.\n기기 연결과 생활 설정은\n홈에서 이어갈 수 있어요.",
    content: <ReadyChecklist />,
  },
];

const READY: { icon: Icon; title: string; hint: string }[] = [
  { icon: IconHeart, title: "어떤 댁인지 알려 주세요", hint: "부르는 이름과 함께 사는 분을 알려 주세요" },
  { icon: IconCheckSquare, title: "홈부터 둘러봐요", hint: "기기가 없어도 시작할 수 있어요" },
  { icon: IconPlug, title: "기기는 나중에 연결해요", hint: "동의를 확인한 뒤 홈의 안내를 눌러 주세요" },
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
            <span className="mt-1 text-[15px] leading-[1.6] text-cocoa/75">{hint}</span>
          </span>
          <IconCheckSquare className="h-6 w-6 shrink-0 text-butter-deep" />
        </li>
      ))}
    </ol>
  );
}

export default function TutorialPage() {
  const router = useRouter();
  const { view, needsLogin, error } = useApp();
  const [index, setIndex] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (needsLogin) router.replace("/login"); }, [needsLogin, router]);
  useEffect(() => { heading.current?.focus(); }, [index, Boolean(view)]);
  if (needsLogin || !view) return <main className="flex flex-1 flex-col gap-4 p-6">{error ? <><p role="alert" className="text-[18px] text-blush-deep">로그인 정보를 확인하지 못했어요.</p><Button onClick={() => location.reload()}>다시 시도</Button></> : <><Skeleton className="h-12" /><Skeleton className="h-48" /></>}</main>;
  const destination = tutorialExitPath(view.onboardingStep);
  const returning = destination === "/home";
  const slide = SLIDES[index];
  const last = index === SLIDES.length - 1;

  return (
    <main className="font-sans flex flex-1 flex-col bg-butter">
      <div className="px-6 pt-7">
        {view.mode === "demo" ? <p className="mb-4 rounded-2xl bg-paper p-3 text-[16px] font-semibold text-cocoa">예시 체험이에요. 실제 계정이나 기기에 연결되지 않아요.</p> : null}
        <div className="flex h-9 items-center justify-between">
          <div className="flex items-center gap-2" role="progressbar" aria-valuenow={index + 1} aria-valuemin={1} aria-valuemax={SLIDES.length} aria-label="튜토리얼 진행">
            {SLIDES.map((_, i) => (
              <span key={i} className={`h-2.5 rounded-full transition-all ${i === index ? "w-7 bg-cocoa" : "w-2.5 bg-cocoa/20"}`} />
            ))}
          </div>
          <Link href={destination} className={`-mr-2 rounded-full px-3 py-1.5 text-[15px] font-semibold text-cocoa/70 hover:text-cocoa ${last ? "invisible" : ""}`}>
            건너뛰기
          </Link>
        </div>
        <div key={index} className="animate-rise motion-reduce:animate-none pb-8">
          <h1 ref={heading} tabIndex={-1} className="mt-6 text-[clamp(1.875rem,8.2vw,2.25rem)] leading-[1.4] font-semibold tracking-[-0.035em] whitespace-pre-line text-cocoa outline-none">{slide.title}</h1>
          <p className="mt-5 text-[18px] leading-[1.75] whitespace-pre-line text-cocoa/80">{slide.body}</p>
        </div>
      </div>

      {/* 시작 화면처럼 아래쪽은 흰 시트 */}
      <div className="flex flex-1 flex-col rounded-t-[2.25rem] bg-paper px-6 pt-8 pb-8">
        <div key={index} className="animate-rise motion-reduce:animate-none flex flex-1 items-center justify-center pb-8">
          {slide.content}
        </div>
        <Button variant="dark" className="min-h-16 text-[19px]" onClick={() => (last ? router.push(destination) : setIndex(index + 1))}>
          {last ? returning ? "홈으로 돌아가기" : "우리 집 알려주기" : "다음"}
        </Button>
        {index === 0 ? (
          <a href={POLICY_URL} target="_blank" rel="noreferrer" className="mt-4 min-h-12 text-center text-[15px] text-cocoa/70 underline underline-offset-4">개인정보 이용·제공 안내 문서 (새 창·Notion 로그인 필요)</a>
        ) : (
          <Button variant="ghost" className="mt-1 text-cocoa/70" onClick={() => setIndex(index - 1)}>
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
    <div className="flex flex-col items-center gap-5">
      <Mascot className="animate-bob motion-reduce:animate-none h-40 w-40" mood="happy" />
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

// 예시 한 주. 색은 그날 확인된 끼니 수를 뜻한다.
const TONES = {
  three: { label: "세 끼", className: "bg-sage-deep" },
  two: { label: "두 끼", className: "bg-tangerine" },
  one: { label: "한 끼", className: "bg-blush-deep" },
  unknown: { label: "미확인", className: "bg-muted/60" },
  pending: { label: "대기 중", className: "border-2 border-cocoa bg-paper" },
} as const;
type Tone = keyof typeof TONES;
const WEEK: [string, Tone][] = [
  ["월", "three"],
  ["화", "three"],
  ["수", "two"],
  ["목", "three"],
  ["금", "one"],
  ["토", "pending"],
  ["일", "unknown"],
];

function WeekLegend() {
  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex justify-between px-1">
        {WEEK.map(([day, tone]) => (
          <div key={day} className="flex flex-col items-center gap-1.5">
            <span className={`h-9 w-9 rounded-full ${TONES[tone].className}`} aria-label={`${day}요일 ${TONES[tone].label}`} />
            <span className="text-[15px] font-semibold text-cocoa">{day}</span>
          </div>
        ))}
      </div>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-2.5 rounded-[1.25rem] bg-butter-soft px-5 py-4">
        {(Object.keys(TONES) as Tone[]).map((tone) => (
          <li key={tone} className="flex items-center gap-2 text-[16px] font-semibold text-cocoa">
            <span className={`h-4 w-4 shrink-0 rounded-full ${TONES[tone].className}`} />
            {TONES[tone].label}
          </li>
        ))}
      </ul>
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
      <p className="px-1 text-[14px] text-muted">필요한 소식만 가볍게 남겨요.</p>
      <div className="mt-2.5 grid grid-cols-3 gap-2" aria-hidden>
        {buttons.map(({ icon: Icon, label, className }) => (
          <div key={label} className={`flex h-24 flex-col items-center justify-center gap-1.5 rounded-2xl ${className}`}>
            <Icon className="h-7 w-7" />
            <span className="text-[15px] font-bold">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
