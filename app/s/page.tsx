"use client";

import Link from "next/link";
import { useRef, useState, type ReactNode } from "react";
import { IconCheck, IconHeart, IconInfo, IconSuitcase, IconUtensils } from "@/components/icons";
import { Logo, Mascot } from "@/components/Mascot";
import { Button, Skeleton } from "@/components/ui";
import { SeniorSheet as Sheet } from "@/components/senior/SeniorSheet";
import { PhoneStepsCard } from "@/components/senior/PhoneStepsCard";
import { HealthConnectionLink } from "@/components/senior/HealthConnectionLink";
import { seniorActionMessage } from "@/components/senior/messages";
import "@/components/senior/senior-home.css";
import { addDays, kstDate } from "@/lib/judge/time";
import type { Absence } from "@/lib/judge/types";
import { mealRecordTime, useSenior, type SeniorOp, type SeniorStatus, type SeniorWhen } from "@/lib/data/senior";
import { mealSlotLabel } from "@/lib/data/view";
import type { MealWindow } from "@/lib/judge/types";
import { useNow } from "@/lib/demo/store";

const CHEERS = [
  "천천히 꼭꼭\n씹어 드세요",
  "오늘 하루도\n든든하게!",
  "따뜻한 밥 한 술,\n그거면 됐어요",
  "웃는 얼굴이\n제일 보기 좋아요",
  "물도 한 잔\n챙겨 드세요",
];

export default function SeniorPage() {
  const senior = useSenior();
  const now = useNow();
  if (senior.token === undefined || !now) return <Loading />;
  if (!senior.paired) return <Pairing pair={senior.pair} startDemo={senior.startDemo} canPair={senior.canPair} />;
  if (!senior.status) return senior.error ? (
    <main className="flex flex-1 flex-col gap-5 p-6">
      <Logo />
      <p role="alert" className="text-2xl font-bold text-cocoa">{senior.error}</p>
      <Button className="min-h-16 text-2xl" onClick={() => void senior.refresh()}>다시 시도</Button>
      <Button variant="outline" className="min-h-16 text-2xl" onClick={senior.disconnect}>다시 연결하기</Button>
    </main>
  ) : <Loading />;
  return <SeniorHome key={senior.token} status={senior.status} now={now} act={senior.act} isDemo={senior.isDemo} endDemo={senior.disconnect} />;
}

function Loading() {
  return (
    <main className="flex flex-1 flex-col gap-5 p-6">
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-24" />
      <Skeleton className="h-40" />
    </main>
  );
}

function Pairing({ pair, startDemo, canPair }: { pair: (code: string) => Promise<void>; startDemo: () => void; canPair: boolean }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      await pair(code);
    } catch (e) {
      setError(e instanceof Error ? e.message : "숫자가 맞지 않아요.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="flex flex-1 flex-col px-6 pt-8 pb-8">
      <Logo />
      <h1 className="mt-10 text-[30px] leading-snug font-extrabold text-cocoa">
        {canPair ? <>가족에게 받은<br />숫자 여섯 개를<br />눌러 주세요</> : <>어르신 화면을<br />체험해 보세요</>}
      </h1>
      {canPair ? <>
        <input
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={code}
        onChange={(e) => {
          setCode(e.target.value.replace(/\D/g, ""));
          setError("");
        }}
        aria-label="연결 숫자 6자리"
        className="mt-8 h-20 rounded-3xl border-2 border-line bg-paper text-center text-[40px] font-bold tracking-[0.4em] text-cocoa outline-none focus:border-butter-deep"
        />
        {error ? <p role="alert" className="mt-3 text-2xl font-bold text-blush-deep">{error}</p> : null}
        <p className="mt-4 text-2xl text-muted">숫자는 자녀분 휴대폰의 밥뭇나 &gt; 설정에 있어요.</p>
        <Button onClick={submit} disabled={busy || code.length !== 6} className="mt-6 min-h-16 text-2xl">
          {busy ? "연결하는 중…" : "연결하기"}
        </Button>
      </> : <p className="mt-6 text-2xl text-muted">실제 가족 연결은 아직 준비 중이에요.</p>}
      <div className="mt-6">
        <p className="text-2xl leading-relaxed text-muted">가족 연결과 별개로 내 휴대폰의 걸음수를 확인할 수 있어요.</p>
        <HealthConnectionLink />
        <Link href="/walking" className="mt-3 flex min-h-16 items-center justify-center rounded-2xl border-2 border-line px-4 py-3 text-center text-2xl font-bold text-cocoa">워밍이의 산책과 옷장</Link>
      </div>
      <div className="mt-auto pt-8">
        <p className="mb-3 text-2xl text-muted">예시 체험은 가족에게 소식을 보내지 않아요.</p>
        <Button variant="outline" onClick={startDemo} disabled={busy} className="min-h-16 text-2xl">예시로 체험하기</Button>
      </div>
    </main>
  );
}

type SheetKind = "eat_out" | "away" | "help" | null;
type Act = (op: SeniorOp, days?: number, when?: SeniorWhen) => Promise<void>;

function SeniorHome({ status, now, act, isDemo, endDemo }: { status: SeniorStatus; now: Date; act: Act; isDemo: boolean; endDemo: () => void }) {
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const request = useRef(0);
  const today = kstDate(now);
  const cheer = CHEERS[Number(today.slice(-2)) % CHEERS.length];
  const away = status.absence;
  const close = () => {
    request.current += 1;
    setSheet(null);
    setDone(null);
    setError("");
    setBusy(false);
  };

  const run = async (op: SeniorOp, days?: number, when?: SeniorWhen) => {
    const id = ++request.current;
    setBusy(true);
    setError("");
    try {
      await act(op, days, when);
      if (id === request.current) setDone(seniorActionMessage(op, isDemo));
    } catch (e) {
      if (id === request.current) setError(e instanceof Error ? e.message : "잠시 후 다시 시도해 주세요.");
    } finally {
      if (id === request.current) setBusy(false);
    }
  };

  return (
    <main className="bapmunna-senior-home flex flex-1 flex-col px-6 pt-6 pb-6">
      <header className="flex items-center justify-between">
        <Logo />
        <Link href="/" aria-label="처음 화면" className="grid h-12 w-12 place-items-center rounded-full border-2 border-line text-cocoa">
          <IconInfo className="h-6 w-6" />
        </Link>
      </header>

      {isDemo ? (
        <aside className="mt-4 rounded-3xl border-2 border-butter-deep bg-butter-soft p-4">
          <DemoNotice />
          <Button variant="outline" className="mt-3 min-h-16 text-2xl" onClick={endDemo}>체험 끝내기</Button>
        </aside>
      ) : null}

      <h1 className="mt-4 text-[30px] leading-tight font-extrabold text-cocoa">
        {status.seniorName ? `${status.seniorName}님,` : "안녕하세요,"}
        <br />
        오늘도 반가워요.
      </h1>

      <div className="relative mt-5 rounded-[2rem] bg-butter-soft px-6 py-5">
        <p className="font-hand text-[34px] leading-[1.15] whitespace-pre-line text-cocoa">{cheer}</p>
        <span className="absolute -bottom-2 right-16 h-5 w-5 rotate-45 bg-butter-soft" aria-hidden />
      </div>

      <div className="bapmunna-senior-encouragement mt-3 flex items-end justify-between gap-2">
        <div className="min-w-0 pb-4">
          <IconHeart className="h-6 w-6 fill-blush-deep/70 text-blush-deep/70" aria-hidden />
          <p className="mt-3 text-2xl font-bold text-cocoa">오늘의 작은 응원</p>
          <p className="mt-1 text-2xl text-muted">당신의 하루를 응원해요.</p>
        </div>
        <Mascot className="h-28 w-28 shrink-0" />
      </div>

      <div className="my-auto py-5">
        <p className="mb-4 text-2xl text-muted">{isDemo ? "세 가지 버튼을 체험해 보세요." : "필요한 소식만 가볍게 남겨요."}</p>
        {away ? <p className="mb-4 text-2xl text-sky-deep">{fmtDate(away.endDate)}까지 {isDemo ? "예시 외출 기간이에요." : "잘 다녀오세요."}</p> : null}
        <div className="bapmunna-senior-actions" aria-label="어르신의 세 가지 소식">
          <BigButton label="외식했어요" lines={["외식", "했어요"]} icon={<IconUtensils className="h-9 w-9" />} onClick={() => setSheet("eat_out")} />
          <BigButton label="놀러가요" lines={["놀러", "가요"]} icon={<IconSuitcase className="h-9 w-9" />} onClick={() => setSheet("away")} />
          <BigButton label="도와줘요" lines={["도와", "줘요"]} icon={<IconHeart className="h-9 w-9" />} onClick={() => setSheet("help")} tone="help" />
        </div>
      </div>
      <CookerBadge lastCookerAt={status.lastCookerAt} today={today} />
      <PhoneStepsCard demo={isDemo} />
      <Link href={isDemo?'/walking/demo':'/walking'} className="mt-4 flex min-h-16 items-center justify-center rounded-2xl bg-butter-soft px-4 py-3 text-center text-2xl font-bold text-cocoa">{isDemo ? '워밍이 산책 하트 체험' : '워밍이의 산책과 옷장'}</Link>
      <Link href="/privacy" className="mt-5 block min-h-12 py-3 text-center text-2xl text-muted underline underline-offset-4">개인정보 이용·제공 안내</Link>

      <Sheet open={sheet === "eat_out"} onClose={close} label="외식했어요">
        {done ? (
          <Done text={done} onClose={close} />
        ) : (
          <>
            {isDemo ? <DemoNotice /> : null}
            <h2 className="text-[28px] font-extrabold text-cocoa">밖에서 드셨나요?</h2>
            <p className="mt-2 text-2xl text-muted">{isDemo ? "외식 소식을 남기는 방법을 체험해요." : "밥솥을 쓰지 않은 식사 소식을 남겨요."}</p>
            <ErrorLine text={error} />
            <EatOutChoices now={now} windows={status.mealWindows} busy={busy} isDemo={isDemo} onClose={close} run={run} />
          </>
        )}
      </Sheet>

      <Sheet open={sheet === "away"} onClose={close} label="놀러가요">
        {done ? (
          <Done text={done} onClose={close} />
        ) : (
          <AwaySheet today={today} current={away} busy={busy} error={error} isDemo={isDemo} onClose={close} run={run} />
        )}
      </Sheet>

      <Sheet open={sheet === "help"} onClose={close} label="도와줘요">
        {done ? (
          <Done text={done} onClose={close} />
        ) : (
          <>
            {isDemo ? <DemoNotice /> : null}
            <h2 className="text-[28px] font-extrabold text-cocoa">도움을 요청할까요?</h2>
            <p className="mt-2 text-2xl text-muted">{isDemo ? "도움 요청 방법을 체험해요." : "도움이 필요하다는 요청을 남겨요. 급하면 가족에게 직접 전화해 주세요."}</p>
            <ErrorLine text={error} />
            <div className="mt-7 flex flex-col gap-3">
              <Button variant="danger" className="min-h-16 text-2xl" disabled={busy} onClick={() => run("help")}>
                {isDemo ? "도움 요청 체험하기" : "도움 요청하기"}
              </Button>
              <Button variant="outline" className="min-h-16 text-2xl" onClick={close}>
                취소
              </Button>
            </div>
          </>
        )}
      </Sheet>
    </main>
  );
}

/**
 * [EN] Rice cooker status badge for seniors showing meal signal or waiting state.
 * [KR] 어르신 화면에서 밥솥 취사 소식이 도착했는지 따뜻하게 보여주는 배지입니다.
 */
function CookerBadge({ lastCookerAt, today }: { lastCookerAt: string | null; today: string }) {
  const cookedToday = lastCookerAt ? kstDate(new Date(lastCookerAt)) === today : false;
  return (
    <div className={`mt-4 flex items-center gap-3.5 rounded-2xl border-2 p-4 ${
      cookedToday ? "border-butter-deep bg-cream text-cocoa" : "border-line bg-paper text-muted"
    }`}>
      <span className="text-3xl" aria-hidden="true">{cookedToday ? "🍚" : "⏳"}</span>
      <div className="min-w-0 flex-1">
        <p className="text-2xl font-bold text-cocoa">
          {cookedToday ? "오늘 밥솥 취사 소식이 전해졌어요" : "오늘 밥솥 취사 소식을 기다려요"}
        </p>
        <p className="text-xl text-muted">
          {cookedToday ? "산책길 첫 번째 하트가 채워졌어요." : "취사 소식이 도착하면 첫 번째 하트가 켜져요."}
        </p>
      </div>
    </div>
  );
}

function ErrorLine({ text }: { text: string }) {
  return text ? <p role="alert" className="mt-3 text-2xl font-bold text-blush-deep">{text}</p> : null;
}

function DemoNotice() {
  return <p className="mb-3 text-2xl font-bold text-cocoa">예시 체험 중이에요.<br />실제 가족에게 보내지 않아요.</p>;
}

function BigButton({ label, lines, icon, onClick, tone }: { label: string; lines: [string, string]; icon: ReactNode; onClick: () => void; tone?: "help" }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={`bapmunna-senior-action rounded-[1.75rem] text-cocoa transition-transform active:scale-95 ${
        tone === "help" ? "bg-blush" : "bg-butter-soft"
      }`}
    >
      <span aria-hidden>{icon}</span>
      <span aria-hidden className="bapmunna-senior-action-label text-2xl font-extrabold tracking-[-0.05em]"><span>{lines[0]}</span><span>{lines[1]}</span></span>
    </button>
  );
}

function Done({ text, onClose }: { text: string; onClose: () => void }) {
  return (
    <div className="flex flex-col items-center text-center">
      <span className="grid h-16 w-16 place-items-center rounded-full bg-sage text-sage-deep">
        <IconCheck className="h-9 w-9" />
      </span>
      <p role="status" className="mt-4 text-[26px] leading-snug font-extrabold whitespace-pre-line text-cocoa">{text}</p>
      <Button className="mt-7 min-h-16 text-2xl" onClick={onClose}>
        확인
      </Button>
    </div>
  );
}

const fmtDate = (d: string) => `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일`;

function AwaySheet({
  today,
  current,
  busy,
  error,
  isDemo,
  onClose,
  run,
}: {
  today: string;
  current: Absence | null;
  busy: boolean;
  error: string;
  isDemo: boolean;
  onClose: () => void;
  run: (op: SeniorOp, days?: number, when?: SeniorWhen) => Promise<void>;
}) {
  const [days, setDays] = useState(1);
  const [fromTomorrow, setFromTomorrow] = useState(false);
  const start = fromTomorrow ? addDays(today, 1) : today;
  const end = addDays(start, days - 1);

  if (current) {
    return (
      <>
        {isDemo ? <DemoNotice /> : null}
        <h2 className="text-[28px] font-extrabold text-cocoa">일찍 돌아오셨나요?</h2>
        <p className="mt-2 text-2xl text-muted">{fmtDate(current.endDate)}까지 {isDemo ? "예시 외출 기간이에요." : "외출 기간으로 저장했어요."}</p>
        <ErrorLine text={error} />
        <div className="mt-7 flex flex-col gap-3">
          <Button className="min-h-16 text-2xl" disabled={busy} onClick={() => run("back")}>
            {isDemo ? "귀가 소식 체험하기" : "네, 집에 왔어요"}
          </Button>
          <Button variant="outline" className="min-h-16 text-2xl" onClick={onClose}>
            아직이요
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      {isDemo ? <DemoNotice /> : null}
      <h2 className="text-[28px] font-extrabold text-cocoa">며칠 다녀오세요?</h2>
      <p className="mt-2 text-2xl text-muted">{isDemo ? "외출 기간을 정하는 예시예요." : "그동안은 끼니 알림을 쉬어요."}</p>
      <div className="mt-6 grid grid-cols-2 gap-2.5">
        {[1, 2, 3, 7].map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            aria-pressed={days === d}
            className={`h-16 rounded-2xl text-2xl font-bold ${days === d ? "bg-butter text-cocoa" : "bg-butter-soft/60 text-cocoa/70"}`}
          >
            {d === 1 ? (fromTomorrow ? "하루" : "오늘만") : d === 7 ? "일주일" : `${d}일`}
          </button>
        ))}
      </div>
      <p className="mt-4 text-center text-2xl font-bold text-cocoa">
        {days === 1 ? fmtDate(start) : `${fmtDate(start)} ~ ${fmtDate(end)}`}
      </p>
      {/* 기본은 오늘부터. 내일 떠나실 때만 바꾼다. */}
      <button type="button" aria-pressed={fromTomorrow} onClick={() => setFromTomorrow(!fromTomorrow)} className="mt-3 min-h-14 w-full rounded-2xl border-2 border-line text-2xl font-bold text-cocoa/80">
        {fromTomorrow ? "오늘부터로 바꾸기" : "내일 떠나요"}
      </button>
      <ErrorLine text={error} />
      <Button className="mt-5 min-h-16 text-2xl" disabled={busy} onClick={() => run("away", days, fromTomorrow ? { startDate: start } : undefined)}>
        {isDemo ? "외출 소식 체험하기" : "외출 기간 남기기"}
      </Button>
    </>
  );
}

/**
 * 외식 소식. 기본은 지금 바로 "네, 먹었어요". 다른 때 드셨으면 오늘·어제 끼니 중에서 고른다.
 * 아직 시작하지 않은 끼니는 고를 수 없다.
 */
function EatOutChoices({ now, windows, busy, isDemo, onClose, run }: {
  now: Date;
  windows: MealWindow[];
  busy: boolean;
  isDemo: boolean;
  onClose: () => void;
  run: (op: SeniorOp, days?: number, when?: SeniorWhen) => Promise<void>;
}) {
  const [picking, setPicking] = useState(false);
  const today = kstDate(now);
  const days = [{ date: today, label: "오늘" }, { date: addDays(today, -1), label: "어제" }];
  if (!picking) {
    return (
      <div className="mt-7 flex flex-col gap-3">
        <Button className="min-h-16 text-2xl" disabled={busy} onClick={() => run("eat_out")}>
          {isDemo ? "외식 소식 체험하기" : "네, 먹었어요"}
        </Button>
        {windows.length ? (
          <Button variant="outline" className="min-h-16 text-2xl" disabled={busy} onClick={() => setPicking(true)}>
            다른 때 먹었어요
          </Button>
        ) : null}
        <Button variant="ghost" className="min-h-16 text-2xl" onClick={onClose}>
          아니요
        </Button>
      </div>
    );
  }
  return (
    <div className="mt-6 flex flex-col gap-4">
      <p className="text-2xl font-bold text-cocoa">언제 드셨어요?</p>
      {days.map(({ date, label }) => {
        const choices = windows.filter(w => mealRecordTime(date, w, now) !== null);
        if (!choices.length) return null;
        return (
          <div key={date}>
            <p className="mb-2 text-2xl text-muted">{label}</p>
            <div className="grid grid-cols-2 gap-2.5">
              {choices.map((w) => (
                <button
                  key={w.slot}
                  type="button"
                  disabled={busy}
                  onClick={() => run("eat_out", undefined, { meal: { date, slot: w.slot } })}
                  className="min-h-16 rounded-2xl bg-butter-soft text-2xl font-bold text-cocoa disabled:opacity-50"
                >
                  {label} {mealSlotLabel(w.slot, windows)}
                </button>
              ))}
            </div>
          </div>
        );
      })}
      <Button variant="ghost" className="min-h-16 text-2xl" onClick={() => setPicking(false)}>
        이전
      </Button>
    </div>
  );
}
