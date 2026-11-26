"use client";

import Link from "next/link";
import { useRef, useState, type ReactNode } from "react";
import { IconCheck, IconHeart, IconHome, IconSuitcase, IconUtensils } from "@/components/icons";
import { Logo } from "@/components/Mascot";
import { Button, Skeleton } from "@/components/ui";
import { SeniorSheet as Sheet } from "@/components/senior/SeniorSheet";
import { RabbitBurrow } from "@/components/walking/RabbitBurrow";
import { PhoneStepsCard } from "@/components/senior/PhoneStepsCard";
import { seniorActionMessage } from "@/components/senior/messages";
import { WalkingGreeting } from "@/components/senior/WalkingGreeting";
import "@/components/senior/senior-home.css";
import { addDays, kstDate } from "@/lib/judge/time";
import type { Absence } from "@/lib/judge/types";
import { mealRecordTime, useSenior, type SeniorOp, type SeniorStatus, type SeniorWhen } from "@/lib/data/senior";
import { mealSlotLabel } from "@/lib/data/view";
import type { MealWindow } from "@/lib/judge/types";
import { useNow } from "@/lib/demo/store";

export default function SeniorPage() {
  const senior = useSenior();
  const now = useNow();
  if (senior.token === undefined || !now) return <Loading />;
  if (senior.paired && !senior.status) return senior.error ? (
    <main className="flex flex-1 flex-col gap-5 p-6">
      <Logo />
      <p role="alert" className="text-2xl font-bold text-cocoa">{senior.error}</p>
      <Button className="min-h-16 text-2xl" onClick={() => void senior.refresh()}>다시 시도</Button>
      <Button variant="outline" className="min-h-16 text-2xl" onClick={senior.disconnect}>다시 연결하기</Button>
    </main>
  ) : <Loading />;
  return <SeniorHome key={senior.token} status={senior.status} now={now} act={senior.act} isDemo={senior.isDemo} endDemo={senior.disconnect} startDemo={senior.startDemo} pairing={<Pairing pair={senior.pair} startDemo={senior.startDemo} canPair={senior.canPair} />} />;
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
    <div>
      <h2 className="text-[28px] leading-snug font-bold text-cocoa">
        {canPair ? <>가족에게 받은 숫자<br />6자리를 입력해 주세요</> : "가족에게 소식 전하기"}
      </h2>
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
        <p className="mt-4 text-2xl text-muted">연결 숫자는 보호자 휴대폰의 밥뭇나 설정에 있어요.</p>
        <Button onClick={submit} disabled={busy || code.length !== 6} className="mt-6 min-h-16 text-2xl">
          {busy ? "연결하는 중…" : "가족과 연결하기"}
        </Button>
      </> : <p className="mt-4 text-xl leading-relaxed text-muted">이 휴대폰의 가족 연결을 준비하고 있어요. 급한 일은 가족에게 직접 전화해 주세요.</p>}
      <div className="mt-6">
        <Button variant={canPair ? "outline" : "dark"} onClick={startDemo} disabled={busy} className="min-h-16 text-2xl">어르신 홈 체험하기</Button>
        <p className="mt-2 text-xl leading-relaxed text-muted">체험 중에는 가족에게 소식을 보내지 않아요.</p>
      </div>
    </div>
  );
}

type SheetKind = "eat_out" | "away" | "help" | "pair" | "steps" | null;
type Act = (op: SeniorOp, days?: number, when?: SeniorWhen) => Promise<void>;

function SeniorHome({ status, now, act, isDemo, endDemo, startDemo, pairing }: {
  status: SeniorStatus | null; now: Date; act: Act; isDemo: boolean;
  endDemo: () => void; startDemo: () => void; pairing: ReactNode;
}) {
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const request = useRef(0);
  const today = kstDate(now);
  const away = status?.absence;
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
    <main className="bapmunna-senior-home flex flex-1 flex-col px-5 pt-4 pb-6">
      <header className="flex items-center justify-between">
        <Logo />
        <Link href="/" className="flex min-h-12 items-center gap-1.5 rounded-lg px-1 text-lg font-semibold text-muted">
          <IconHome aria-hidden className="h-5 w-5" />처음 화면
        </Link>
      </header>
      <div className="bapmunna-senior-greeting">
        <h1>{status?.seniorName && <>{status.seniorName}님,<br /></>}오늘도 반가워요.</h1>
      </div>
      <section aria-label="가족에게 소식 전하기">
        <div className="bapmunna-senior-actions">
          <BigButton label="외식했어요" tone="meal" icon={<IconUtensils />} onClick={() => setSheet(status ? "eat_out" : "pair")} />
          <BigButton label={away ? "귀가 알리기" : "놀러가요"} tone="away" icon={<IconSuitcase />} onClick={() => setSheet(status ? "away" : "pair")} />
          <BigButton label="도와줘요" tone="help" icon={<IconHeart />} onClick={() => setSheet(status ? "help" : "pair")} />
        </div>
        {away && <p className="mt-2 text-xl text-sky-deep">{fmtDate(away.endDate)}까지 {isDemo ? "예시 외출 기간이에요." : "외출 중이에요."}</p>}
        {isDemo && <p className="mt-2 text-base text-muted">예시 체험 중 · 가족에게 보내지 않아요.</p>}
      </section>
      <WalkingGreeting today={today} demo={isDemo} />
      <div className="mt-auto flex justify-end pt-5">
        <button type="button" className="rabbit-burrow-button" aria-label="오늘의 걸음 확인" aria-haspopup="dialog" onClick={() => setSheet("steps")}>
          <RabbitBurrow /><span className="rabbit-burrow-label">오늘의 걸음</span>
        </button>
      </div>
      <Sheet open={sheet === "steps"} onClose={close} label="오늘의 걸음">
        <PhoneStepsCard demo={isDemo} localOnly={!status} />
        {isDemo && <Link href="/walking/demo/" className="mt-3 flex min-h-14 items-center justify-center font-bold underline">예시 걸음 보기</Link>}
        <Button variant="outline" onClick={close} className="mt-4 min-h-14">닫기</Button>
      </Sheet>
      <footer className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2">
        <Link href="/privacy" className="flex min-h-12 items-center text-lg text-muted underline underline-offset-4">개인정보 이용·제공 안내</Link>
        {isDemo ? <button type="button" className="min-h-12 text-lg font-semibold text-cocoa underline underline-offset-4" onClick={endDemo}>체험 끝내기</button>
          : <button type="button" className="min-h-12 text-lg font-semibold text-cocoa underline underline-offset-4" onClick={startDemo}>어르신 홈 체험하기</button>}
      </footer>

      <Sheet open={sheet === "pair"} onClose={close} label="가족 연결 안내">{pairing}<Button variant="ghost" onClick={close} className="mt-3 min-h-14">닫기</Button></Sheet>
      <Sheet open={sheet === "eat_out"} onClose={close} label="외식했어요">
        {done ? (
          <Done text={done} onClose={close} />
        ) : (
          <>
            {isDemo ? <DemoNotice /> : null}
            <ErrorLine text={error} />
            <EatOutChoices now={now} windows={status?.mealWindows ?? []} yesterdayWindows={status?.yesterdayMealWindows} busy={busy} onClose={close} run={run} />
          </>
        )}
      </Sheet>

      <Sheet open={sheet === "away"} onClose={close} label={away ? "귀가 알리기" : "놀러가요"}>
        {done ? (
          <Done text={done} onClose={close} />
        ) : (
          <AwaySheet today={today} current={away ?? null} busy={busy} error={error} isDemo={isDemo} onClose={close} run={run} />
        )}
      </Sheet>

      <Sheet open={sheet === "help"} onClose={close} label="도와줘요">
        {done ? (
          <Done text={done} onClose={close} />
        ) : (
          <>
            {isDemo ? <DemoNotice /> : null}
            <h2 className="text-[28px] font-extrabold text-cocoa">가족에게 도움을 요청할까요?</h2>
            <p className="mt-2 text-2xl text-muted">급하면 가족에게 직접 전화해 주세요.</p>
            <ErrorLine text={error} />
            <div className="mt-7 flex flex-col gap-3">
              <Button variant="danger" className="min-h-16 text-2xl" disabled={busy} onClick={() => run("help")}>
                도움 요청하기
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

function ErrorLine({ text }: { text: string }) {
  return text ? <p role="alert" className="mt-3 text-2xl font-bold text-blush-deep">{text}</p> : null;
}

function DemoNotice() {
  return <p className="mb-3 text-2xl font-bold text-cocoa">체험 중 · 가족에게 보내지 않아요.</p>;
}

function BigButton({ label, icon, onClick, tone }: { label: string; icon: ReactNode; onClick: () => void; tone: "meal" | "away" | "help" }) {
  return (
    <button type="button" aria-haspopup="dialog" className="bapmunna-senior-action" data-tone={tone} onClick={onClick}>
      <span className="bapmunna-senior-action-icon" aria-hidden>{icon}</span>
      <strong>{label}</strong>
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
            집에 왔어요
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
      <p className="mt-2 text-2xl text-muted">외출 기간에는 끼니 알림을 쉬어요.</p>
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
        외출 기간 남기기
      </Button>
      <Button variant="ghost" className="mt-1 min-h-16 text-2xl" disabled={busy} onClick={onClose}>취소</Button>
    </>
  );
}

/**
 * 외식 소식. 기본은 "방금 먹었어요". 다른 때 드셨으면 오늘·어제 끼니 중에서 고른다.
 * 아직 시작하지 않은 끼니는 고를 수 없다.
 */
function EatOutChoices({ now, windows, yesterdayWindows = windows, busy, onClose, run }: {
  now: Date;
  windows: MealWindow[];
  yesterdayWindows?: MealWindow[];
  busy: boolean;
  onClose: () => void;
  run: (op: SeniorOp, days?: number, when?: SeniorWhen) => Promise<void>;
}) {
  const [picking, setPicking] = useState(false);
  const today = kstDate(now);
  const days = [{ date: today, label: "오늘", schedule: windows }, { date: addDays(today, -1), label: "어제", schedule: yesterdayWindows }];
  if (!picking) {
    return (
      <div className="flex flex-col gap-3">
        <h2 className="mb-3 text-[28px] font-extrabold text-cocoa">언제 밖에서 드셨어요?</h2>
        <Button className="min-h-16 text-2xl" disabled={busy} onClick={() => run("eat_out")}>
          방금 먹었어요
        </Button>
        {windows.length || yesterdayWindows.length ? (
          <Button variant="outline" className="min-h-16 text-2xl" disabled={busy} onClick={() => setPicking(true)}>
            다른 끼니 고르기
          </Button>
        ) : null}
        <Button variant="ghost" className="min-h-16 text-2xl" onClick={onClose}>
          취소
        </Button>
      </div>
    );
  }
  return (
    <div className="mt-6 flex flex-col gap-4">
      <h2 className="text-[28px] font-extrabold text-cocoa">외식한 끼니를 골라 주세요</h2>
      {days.map(({ date, label, schedule }) => {
        const choices = schedule.filter(w => mealRecordTime(date, w, now) !== null);
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
                  {label} {mealSlotLabel(w.slot, schedule)}
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
