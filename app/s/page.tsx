"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { IconArrowRight, IconCheck, IconHeart, IconInfo, IconSuitcase, IconUtensils } from "@/components/icons";
import { Logo, Mascot } from "@/components/Mascot";
import { Button, Sheet, Skeleton } from "@/components/ui";
import { addDays, kstDate, kstTime } from "@/lib/judge/time";
import type { Absence } from "@/lib/judge/types";
import { useSenior, type SeniorOp, type SeniorStatus } from "@/lib/data/senior";
import { useDemo, useNow } from "@/lib/demo/store";

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
  if (!senior.paired) return <Pairing pair={senior.pair} />;
  if (!senior.status) return <Loading />;
  return <SeniorHome status={senior.status} now={now} act={senior.act} />;
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

function Pairing({ pair }: { pair: (code: string) => Promise<void> }) {
  const demo = useDemo();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
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
        가족에게 받은
        <br />
        숫자 여섯 개를
        <br />
        눌러 주세요
      </h1>
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
      {error ? <p className="mt-3 text-[22px] font-bold text-blush-deep">{error}</p> : null}
      <p className="mt-4 text-[18px] text-muted">숫자는 자녀분 휴대폰의 밥뭇나 &gt; 설정에 있어요.</p>
      {demo ? <p className="mt-2 text-sm text-muted">(데모) 데모 코드: {demo.pairingCode}</p> : null}
      <div className="mt-auto">
        <Button onClick={submit} disabled={busy || code.length !== 6} className="min-h-16 text-[22px]">
          {busy ? "연결하는 중…" : "연결하기"}
        </Button>
      </div>
    </main>
  );
}

type SheetKind = "eat_out" | "away" | "help" | null;
type Act = (op: SeniorOp, days?: number) => Promise<void>;

function SeniorHome({ status, now, act }: { status: SeniorStatus; now: Date; act: Act }) {
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const today = kstDate(now);
  const cheer = CHEERS[Number(today.slice(-2)) % CHEERS.length];
  const lastCook = status.lastCookerAt ? new Date(status.lastCookerAt) : null;
  const away = status.absence;
  const close = () => {
    setSheet(null);
    setDone(null);
    setError("");
  };

  const run = async (op: SeniorOp, message: string, days?: number) => {
    setBusy(true);
    setError("");
    try {
      await act(op, days);
      setDone(message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex flex-1 flex-col px-6 pt-6 pb-6">
      <header className="flex items-center justify-between">
        <Logo />
        <Link href="/" aria-label="처음 화면" className="grid h-12 w-12 place-items-center rounded-full border-2 border-line text-cocoa">
          <IconInfo className="h-6 w-6" />
        </Link>
      </header>

      <h1 className="mt-4 text-[30px] leading-tight font-extrabold text-cocoa">
        {status.seniorName ? `${status.seniorName}님,` : "안녕하세요,"}
        <br />
        오늘도 반가워요.
      </h1>

      <div className="mt-4 flex items-center justify-between gap-3 rounded-[1.75rem] bg-butter-soft px-5 py-3">
        <p className="font-hand text-[28px] leading-[1.15] whitespace-pre-line text-cocoa">{cheer}</p>
        <Mascot className="h-24 w-24 shrink-0" />
      </div>

      {away ? (
        <div className="flex items-center gap-3 rounded-3xl bg-sky px-5 py-4">
          <IconSuitcase className="h-8 w-8 shrink-0 text-sky-deep" />
          <div className="flex-1">
            <p className="text-[20px] font-bold text-cocoa">{fmtDate(away.endDate)}까지 다녀오세요</p>
            <p className="text-[16px] text-muted">그동안은 가족에게 알림이 가지 않아요.</p>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-3xl bg-butter px-5 py-4">
          <Mascot className="h-11 w-11 shrink-0" mood="wink" />
          <div className="flex-1">
            <p className="text-[20px] font-bold text-cocoa">밥솥 소식 도착했어요</p>
            <p className="text-[16px] text-cocoa/70">
              {lastCook && kstDate(lastCook) === today ? `오늘 ${kstTime(lastCook)} 사용 움직임` : "오늘은 아직 소식이 없어요"}
            </p>
          </div>
          <IconArrowRight className="h-5 w-5 text-cocoa" />
        </div>
      )}

      <p className="mt-4 mb-3 text-[18px] text-muted">필요한 소식만 가볍게 남겨요.</p>
      <div className="grid gap-2.5">
        <BigButton label="외식했어요" icon={<IconUtensils className="h-9 w-9" />} onClick={() => setSheet("eat_out")} />
        <BigButton label="놀러가요" icon={<IconSuitcase className="h-9 w-9" />} onClick={() => setSheet("away")} />
        <BigButton label="도와줘요" icon={<IconHeart className="h-9 w-9" />} onClick={() => setSheet("help")} tone="help" />
      </div>
      <p className="mt-auto pt-6 text-center text-[16px] text-muted">평소의 하루는 그대로 보내세요.</p>

      <Sheet open={sheet === "eat_out"} onClose={close} label="외식했어요">
        {done ? (
          <Done text={done} onClose={close} />
        ) : (
          <>
            <h2 className="text-[28px] font-extrabold text-cocoa">밖에서 드셨나요?</h2>
            <p className="mt-2 text-[19px] text-muted">밥솥을 쓰지 않은 식사도 가족에게 전해 드려요.</p>
            <ErrorLine text={error} />
            <div className="mt-7 flex flex-col gap-3">
              <Button className="min-h-16 text-[22px]" disabled={busy} onClick={() => run("eat_out", "잘 드셨어요!\n가족에게 전할게요.")}>
                네, 먹었어요
              </Button>
              <Button variant="outline" className="min-h-16 text-[22px]" onClick={close}>
                아니요
              </Button>
            </div>
          </>
        )}
      </Sheet>

      <Sheet open={sheet === "away"} onClose={close} label="놀러가요">
        {done ? (
          <Done text={done} onClose={close} />
        ) : (
          <AwaySheet today={today} current={away} busy={busy} error={error} onClose={close} run={run} />
        )}
      </Sheet>

      <Sheet open={sheet === "help"} onClose={close} label="도와줘요">
        {done ? (
          <Done text={done} onClose={close} />
        ) : (
          <>
            <h2 className="text-[28px] font-extrabold text-cocoa">도움을 요청할까요?</h2>
            <p className="mt-2 text-[19px] text-muted">가족에게 바로 알림이 가요.</p>
            <ErrorLine text={error} />
            <div className="mt-7 flex flex-col gap-3">
              <Button variant="danger" className="min-h-16 text-[22px]" disabled={busy} onClick={() => run("help", "가족에게 알렸어요.\n곧 연락이 올 거예요.")}>
                도움 요청하기
              </Button>
              <Button variant="outline" className="min-h-16 text-[22px]" onClick={close}>
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
  return text ? <p className="mt-3 text-[19px] font-bold text-blush-deep">{text}</p> : null;
}

function BigButton({ label, icon, onClick, tone }: { label: string; icon: ReactNode; onClick: () => void; tone?: "help" }) {
  return (
    <button
      onClick={onClick}
      className={`flex min-h-18 items-center justify-center gap-4 rounded-[1.75rem] px-4 text-cocoa transition-transform active:scale-95 ${
        tone === "help" ? "bg-blush" : "bg-butter-soft"
      }`}
    >
      {icon}
      <span className="text-2xl font-extrabold tracking-[-0.05em]">{label}</span>
    </button>
  );
}

function Done({ text, onClose }: { text: string; onClose: () => void }) {
  return (
    <div className="flex flex-col items-center text-center">
      <span className="grid h-16 w-16 place-items-center rounded-full bg-sage text-sage-deep">
        <IconCheck className="h-9 w-9" />
      </span>
      <p className="mt-4 text-[26px] leading-snug font-extrabold whitespace-pre-line text-cocoa">{text}</p>
      <Button className="mt-7 min-h-16 text-[22px]" onClick={onClose}>
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
  onClose,
  run,
}: {
  today: string;
  current: Absence | null;
  busy: boolean;
  error: string;
  onClose: () => void;
  run: (op: SeniorOp, message: string, days?: number) => Promise<void>;
}) {
  const [days, setDays] = useState(1);
  const end = addDays(today, days - 1);

  if (current) {
    return (
      <>
        <h2 className="text-[28px] font-extrabold text-cocoa">일찍 돌아오셨나요?</h2>
        <p className="mt-2 text-[19px] text-muted">{fmtDate(current.endDate)}까지 다녀오신다고 전해 두었어요.</p>
        <ErrorLine text={error} />
        <div className="mt-7 flex flex-col gap-3">
          <Button className="min-h-16 text-[22px]" disabled={busy} onClick={() => run("back", "어서 오세요!\n가족에게 전할게요.")}>
            네, 집에 왔어요
          </Button>
          <Button variant="outline" className="min-h-16 text-[22px]" onClick={onClose}>
            아직이요
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <h2 className="text-[28px] font-extrabold text-cocoa">며칠 다녀오세요?</h2>
      <p className="mt-2 text-[19px] text-muted">그동안은 끼니 알림을 쉬어요.</p>
      <div className="mt-6 grid grid-cols-2 gap-2.5">
        {[1, 2, 3, 7].map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            aria-pressed={days === d}
            className={`h-16 rounded-2xl text-[22px] font-bold ${days === d ? "bg-butter text-cocoa" : "bg-butter-soft/60 text-cocoa/70"}`}
          >
            {d === 1 ? "오늘만" : d === 7 ? "일주일" : `${d}일`}
          </button>
        ))}
      </div>
      <p className="mt-4 text-center text-[20px] font-bold text-cocoa">
        {fmtDate(today)} ~ {fmtDate(end)}
      </p>
      <ErrorLine text={error} />
      <Button className="mt-5 min-h-16 text-[22px]" disabled={busy} onClick={() => run("away", `${fmtDate(end)}까지\n잘 다녀오세요!`, days)}>
        가족에게 알리기
      </Button>
    </>
  );
}
