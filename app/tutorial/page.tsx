"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ComponentType, type ReactNode, type SVGProps } from "react";
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
import { Mascot } from "@/components/Mascot";
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
    content: (
      <div className="flex w-full flex-col gap-3">
        <InfoCard icon={IconCheckSquare} text="SmartThings 계정" />
        <InfoCard icon={IconCheckSquare} text={"밥솥에 꽂을\n스마트 플러그"} />
        <InfoCard icon={IconPlay} text={"연결 코드와\n플러그 번호"} />
      </div>
    ),
  },
];

export default function TutorialPage() {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const slide = SLIDES[index];
  const last = index === SLIDES.length - 1;

  return (
    <main className="flex flex-1 flex-col bg-butter px-6 pt-7 pb-8">
      <div className="flex h-9 items-center justify-between">
        <div className="flex items-center gap-2" role="progressbar" aria-valuenow={index + 1} aria-valuemin={1} aria-valuemax={SLIDES.length} aria-label="튜토리얼 진행">
          {SLIDES.map((_, i) => (
            <span key={i} className={`h-2.5 rounded-full transition-all ${i === index ? "w-7 bg-cocoa" : "w-2.5 bg-cocoa/20"}`} />
          ))}
        </div>
        <Link href={NEXT} className={`-mr-2 rounded-full px-3 py-1.5 text-[15px] font-semibold text-cocoa/70 hover:text-cocoa ${last ? "invisible" : ""}`}>
          건너뛰기
        </Link>
      </div>

      <div key={index} className="animate-rise flex flex-1 flex-col">
        <h1 className="font-hand mt-6 text-[40px] leading-[1.15] whitespace-pre-line text-cocoa">{slide.title}</h1>
        <p className="mt-4 text-[18px] leading-relaxed whitespace-pre-line text-cocoa/80">{slide.body}</p>
        <div className="flex flex-1 items-center justify-center py-8">{slide.content}</div>
      </div>

      <Button variant="dark" className="min-h-16 text-[19px]" onClick={() => (last ? router.push(NEXT) : setIndex(index + 1))}>
        {last ? "시작하기" : "다음"}
      </Button>
      {/* 약관 페이지가 생기면 링크로 바꾼다 */}
      {index === 0 ? <p className="mt-4 text-center text-[14px] text-cocoa/70 underline underline-offset-4">개인정보 처리방침 · 이용약관</p> : null}
    </main>
  );
}

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

function InfoCard({ icon: Icon, text }: { icon: Icon; text: string }) {
  return (
    <div className="flex items-start gap-3 rounded-[1.25rem] bg-paper px-4 py-3.5">
      <Icon className="mt-0.5 h-6 w-6 shrink-0 text-cocoa" />
      <p className="text-[17px] leading-snug font-semibold whitespace-pre-line text-cocoa">{text}</p>
    </div>
  );
}

function IntroFlow() {
  const steps: Icon[] = [IconCooker, IconPlug, IconSmartphone];
  return (
    <div className="flex flex-col items-center gap-5">
      <Mascot className="animate-bob h-40 w-40" mood="happy" />
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
      <ul className="grid grid-cols-2 gap-x-4 gap-y-2.5 rounded-[1.25rem] bg-paper px-5 py-4">
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
    <div className="w-full rounded-[var(--radius-card)] bg-paper px-3 py-3.5">
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
