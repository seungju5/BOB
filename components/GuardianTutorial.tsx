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
  IconPlay,
  IconPlug,
  IconSuitcase,
  IconUtensils,
} from "@/components/icons";
import { CookerMascot } from "@/components/Mascot";
import { RiceFill } from "@/components/RiceFill";
import { Button } from "@/components/ui";

/** 보호자 첫 사용 튜토리얼 (Figma T-01~T-05). 끝나면 /start가 로그인·온보딩으로 보낸다. */
const NEXT = "/start";

type Slide = { title: string; body: string; content: ReactNode };

const SLIDES: Slide[] = [
  {
    title: "밥솥이 안부를\n전해 드려요",
    body: "어르신이 밥솥을 쓰시면\n플러그가 알아채고\n보호자님께 알려 드려요.",
    content: <IntroFlow />,
  },
  {
    title: "평소와 다르면\n바로 알려 드려요",
    body: "끼니를 거르시거나\n식사 시간이 바뀌면\n알림이 와요.",
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
    body: "어르신 화면에서 누르시면\n보호자님께 바로 전해져요.",
    content: <SeniorButtons />,
  },
  {
    title: "시작하기 전에\n준비해 주세요",
    body: "찾기 어려운 건\n다음 단계에서 영상으로\n알려 드려요.",
    content: <ReadyChecklist />,
  },
];

const READY: { icon: Icon; title: string; hint: string }[] = [
  { icon: IconSmartphone, title: "SmartThings 계정", hint: "삼성 계정으로 가입해 두세요" },
  { icon: IconPlug, title: "밥솥에 꽂을 스마트 플러그", hint: "전력을 재는 삼성 스마트플러그예요" },
  { icon: IconPlay, title: "연결 코드와 플러그 번호", hint: "SmartThings에서 확인해요" },
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
          className="animate-rise relative flex items-center gap-4 rounded-[1.25rem] bg-butter-soft py-3.5 pr-4 pl-4"
          style={{ animationDelay: `${120 + i * 90}ms` }}
        >
          <span className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full bg-butter text-cocoa shadow-[0_0_0_4px_var(--color-butter-soft)]">
            <Icon className="h-6 w-6" />
            <span className="absolute -top-1 -right-1 grid h-5 w-5 place-items-center rounded-full bg-cocoa text-[11px] leading-none text-paper">{i + 1}</span>
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-[19px] leading-snug text-cocoa">{title}</span>
            <span className="mt-0.5 text-[15px] leading-snug text-cocoa/75">{hint}</span>
          </span>
          <IconCheckSquare className="h-6 w-6 shrink-0 text-butter-deep" />
        </li>
      ))}
    </ol>
  );
}

export function GuardianTutorial({ onComplete }: { onComplete?: () => void } = {}) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const last = index === SLIDES.length - 1;
  const slide = last && onComplete ? {
    title: "먼저 우리 집을\n알려 주세요",
    body: "평소 끼니와 가족 정보를 알려 주세요.\n밥솥은 홈에서 편할 때 연결해요.",
    content: <div className="rounded-2xl bg-butter-soft p-5 text-[17px]">홈 상단의 <strong>기기 연결이 필요해요</strong>를 누르면 연결할 수 있어요.</div>,
  } : SLIDES[index];
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (onComplete) heading.current?.focus({ preventScroll: true }); }, [index, onComplete]);
  const Root = onComplete ? "section" : "main";
  const finish = () => onComplete ? onComplete() : router.push(NEXT);
  function show(at: number) {
    setIndex(at);
    if (onComplete) window.scrollTo(0, 0);
  }

  return (
    <Root className={onComplete ? "flex flex-1 flex-col rounded-2xl bg-butter-soft" : "font-halmae flex flex-1 flex-col bg-butter"}>
      <div className="px-6 pt-7">
        <div className="flex h-9 items-center justify-between">
          <div className="flex items-center gap-2" role="progressbar" aria-valuenow={index + 1} aria-valuemin={1} aria-valuemax={SLIDES.length} aria-label="튜토리얼 진행">
            {SLIDES.map((_, i) => (
              <span key={i} className={`h-2.5 rounded-full transition-all ${i === index ? "w-7 bg-cocoa" : "w-2.5 bg-cocoa/20"}`} />
            ))}
          </div>
          {onComplete ? (
            <button type="button" onClick={finish} className="min-h-11 rounded-full px-2 text-[15px] font-semibold underline">건너뛰기</button>
          ) : (
            <Link href={NEXT} className={`-mr-2 rounded-full px-3 py-1.5 text-[15px] font-semibold text-cocoa/70 hover:text-cocoa ${last ? "invisible" : ""}`}>
              건너뛰기
            </Link>
          )}
        </div>
        <div key={index} className="animate-rise pb-8">
          <h1 ref={heading} tabIndex={onComplete ? -1 : undefined} className={`mt-6 leading-[1.15] whitespace-pre-line text-cocoa ${onComplete ? "text-[clamp(1.65rem,8vw,2.25rem)] font-bold" : "text-[40px]"}`}>{slide.title}</h1>
          <p className="mt-4 text-[18px] leading-relaxed whitespace-pre-line text-cocoa/80">{slide.body}</p>
        </div>
      </div>

      {/* 시작 화면처럼 아래쪽은 흰 시트 */}
      <div className={`flex flex-1 flex-col rounded-t-[2.25rem] bg-paper pt-8 pb-8 ${onComplete ? "px-2 sm:px-4" : "px-6"}`}>
        <div key={index} className="animate-rise flex flex-1 items-center justify-center pb-8">
          {slide.content}
        </div>
        <Button variant={onComplete ? "primary" : "dark"} className="min-h-16 text-[19px]" onClick={() => (last ? finish() : show(index + 1))}>
          {last ? (onComplete ? "우리 집 알려주기" : "시작하기") : "다음"}
        </Button>
        {/* 약관 페이지가 생기면 링크로 바꾼다 */}
        {index === 0 ? (
          onComplete ? null : <p className="mt-4 text-center text-[14px] text-cocoa/70 underline underline-offset-4">개인정보 처리방침 · 이용약관</p>
        ) : (
          <Button variant="ghost" className="mt-1 text-cocoa/70" onClick={() => show(index - 1)}>
            이전
          </Button>
        )}
      </div>
    </Root>
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
      <CookerMascot className="animate-bob h-40 w-40" mood="happy" />
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
  const [active, setActive] = useState(0);
  const [day, status] = WEEK[active];
  const count = status === "three" ? 3 : status === "two" ? 2 : status === "one" ? 1 : null;
  return (
    <div className="flex w-full flex-col gap-4">
        <div className="grid grid-cols-7 gap-1">
        {WEEK.map(([day, tone], index) => (
          <button key={day} type="button" aria-label={`${day}요일 ${TONES[tone].label}`} aria-pressed={index === active} onClick={() => setActive(index)} className={`flex min-h-12 flex-col items-center gap-1.5 rounded-xl px-0.5 py-1 ${index === active ? "bg-butter-soft" : ""}`}>
            <span className={`aspect-square w-full max-w-9 rounded-full ${TONES[tone].className}`} aria-label={`${day}요일 ${TONES[tone].label}`} />
            <span className="text-[15px] font-semibold text-cocoa">{day}</span>
          </button>
        ))}
      </div>
      <div className="flex items-center gap-3 rounded-2xl border border-line px-3 py-2">
        <RiceFill key={active} count={count} className="size-14 shrink-0" />
        <p className="text-[15px]" role="status"><strong>{day}요일 · {count ? `끼니 소식 ${count}개` : TONES[status].label}</strong><br />예시 기록이에요. 실제 식사량은 알 수 없어요.</p>
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
