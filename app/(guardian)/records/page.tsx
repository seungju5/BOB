"use client";

import { useState } from "react";
import { fmtDateLong, fmtMonthDay, STATUS_META, StatusIcon } from "@/components/guardian";
import { PageHeader, Skeleton } from "@/components/ui";
import { addDays, kstDate } from "@/lib/judge/time";
import type { MealStatus } from "@/lib/judge/types";
import { useApp } from "@/lib/data/useApp";
import { SLOT_LABEL, slotsForDate, statsRange, type AppView } from "@/lib/data/view";

type Range = "day" | "week" | "month";
const RANGES: Array<{ id: Range; label: string; days: number }> = [
  { id: "day", label: "일", days: 1 },
  { id: "week", label: "주", days: 7 },
  { id: "month", label: "월", days: 30 },
];

export default function RecordsPage() {
  const { view: state, now } = useApp();
  const [range, setRange] = useState<Range>("week");

  return (
    <main className="flex flex-col pb-8">
      <PageHeader title="식사 기록" />
      <div className="px-6">
        <div role="tablist" className="grid grid-cols-3 rounded-full bg-butter-soft p-1">
          {RANGES.map((r) => (
            <button
              key={r.id}
              role="tab"
              aria-selected={range === r.id}
              onClick={() => setRange(r.id)}
              className={`h-10 rounded-full text-[15px] font-bold transition-colors ${range === r.id ? "bg-paper text-cocoa shadow-sm" : "text-cocoa/60"}`}
            >
              {r.label}
            </button>
          ))}
        </div>
        {!state || !now ? (
          <Skeleton className="mt-6 h-64" />
        ) : range === "day" ? (
          <DayView state={state} now={now} />
        ) : (
          <RangeView state={state} now={now} days={range === "week" ? 7 : 30} />
        )}
        <Legend />
      </div>
    </main>
  );
}

function DayView({ state, now }: { state: AppView; now: Date }) {
  const today = kstDate(now);
  const stats = statsRange(state, today, today)[today];
  const slots = slotsForDate(state, today, now);
  return (
    <div className="mt-6">
      <p className="text-[15px] text-muted">{fmtDateLong(today)}</p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Stat label="취사" value={stats.cook} />
        <Stat label="뚜껑 열림" value={stats.lid} />
      </div>
      <ul className="mt-5 flex flex-col gap-2">
        {slots.map((s) => (
          <li key={s.slot} className="flex items-center justify-between rounded-2xl border border-line px-5 py-4">
            <span className="text-[16px] font-bold text-cocoa">{SLOT_LABEL[s.slot]}</span>
            <StatusChip status={s.status} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function RangeView({ state, now, days }: { state: AppView; now: Date; days: number }) {
  const today = kstDate(now);
  const from = addDays(today, -(days - 1));
  const stats = statsRange(state, from, today);
  const dates = Object.keys(stats);
  const max = Math.max(3, ...dates.map((d) => stats[d].cook + stats[d].lid));
  const totals = dates.reduce((t, d) => ({ cook: t.cook + stats[d].cook, lid: t.lid + stats[d].lid }), { cook: 0, lid: 0 });

  return (
    <div className="mt-6">
      <div className="grid grid-cols-2 gap-3">
        <Stat label={`${days}일간 취사`} value={totals.cook} />
        <Stat label={`${days}일간 뚜껑 열림`} value={totals.lid} />
      </div>

      <section className="mt-5 rounded-[1.75rem] border border-line p-5">
        <h2 className="text-[15px] font-bold text-cocoa">하루 밥솥 사용</h2>
        <div className="mt-4 flex h-36 items-end gap-[3px]" aria-label="날짜별 취사와 뚜껑 열림 횟수">
          {dates.map((d) => (
            <div key={d} className="flex h-full flex-1 flex-col justify-end gap-[2px]" title={`${fmtMonthDay(d)} 취사 ${stats[d].cook}, 열림 ${stats[d].lid}`}>
              <div className="rounded-t-md bg-butter-deep/45" style={{ height: `${(stats[d].lid / max) * 100}%` }} />
              <div className={`bg-butter-deep ${stats[d].lid ? "" : "rounded-t-md"}`} style={{ height: `${(stats[d].cook / max) * 100}%` }} />
            </div>
          ))}
        </div>
        <div className="mt-2 flex justify-between text-[11px] text-muted">
          <span>{fmtMonthDay(from)}</span>
          <span>오늘</span>
        </div>
        <div className="mt-3 flex gap-4 text-[12px] text-muted">
          <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-butter-deep" />취사</span>
          <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-butter-deep/45" />뚜껑 열림</span>
        </div>
      </section>

      <section className="mt-4 rounded-[1.75rem] border border-line p-5">
        <h2 className="text-[15px] font-bold text-cocoa">끼니 상태</h2>
        {days === 7 ? (
          <table className="mt-3 w-full border-separate border-spacing-1 text-center text-[12px]">
            <thead>
              <tr>
                <th className="w-10" />
                {dates.map((d) => (
                  <th key={d} className="font-medium text-muted">{fmtMonthDay(d)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {state.mealProfile.windows.map(({ slot }) => (
                <tr key={slot}>
                  <th className="text-left font-semibold text-cocoa">{SLOT_LABEL[slot]}</th>
                  {dates.map((d) => {
                    const s = slotsForDate(state, d, now).find((x) => x.slot === slot);
                    return (
                      <td key={d}>
                        {s ? (
                          <span className={`mx-auto grid h-8 w-8 place-items-center rounded-xl ${STATUS_META[s.status].className}`} title={STATUS_META[s.status].label}>
                            <StatusIcon status={s.status} className="h-3.5 w-3.5" />
                          </span>
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <MonthGrid state={state} now={now} dates={dates} />
        )}
      </section>
    </div>
  );
}

function MonthGrid({ state, now, dates }: { state: AppView; now: Date; dates: string[] }) {
  return (
    <div className="mt-3 grid grid-cols-7 gap-1.5">
      {dates.map((d) => {
        const slots = slotsForDate(state, d, now).filter((s) => s.status !== "pending");
        const ok = slots.filter((s) => s.status === "confirmed" || s.status === "eat_out").length;
        const away = slots.length > 0 && slots.every((s) => s.status === "away");
        const tone = away ? "bg-sky text-sky-deep" : !slots.length ? "bg-line/50 text-muted" : ok === slots.length ? "bg-sage text-sage-deep" : ok === 0 ? "bg-blush text-blush-deep" : "bg-butter-soft text-cocoa";
        return (
          <div key={d} className={`flex aspect-square flex-col items-center justify-center rounded-xl text-[11px] ${tone}`} title={`${fmtMonthDay(d)} ${ok}/${slots.length}끼 확인`}>
            <span className="font-semibold">{Number(d.slice(8))}</span>
            {slots.length && !away ? <span className="text-[10px] opacity-80">{ok}/{slots.length}</span> : null}
          </div>
        );
      })}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-butter-soft px-5 py-4">
      <p className="text-[13px] text-cocoa/70">{label}</p>
      <p className="mt-1 text-[28px] font-extrabold text-cocoa">{value}<span className="ml-0.5 text-[15px] font-bold">회</span></p>
    </div>
  );
}

function StatusChip({ status }: { status: MealStatus }) {
  return (
    <span className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-[13px] font-bold ${STATUS_META[status].className}`}>
      <StatusIcon status={status} className="h-3.5 w-3.5" />
      {STATUS_META[status].label}
    </span>
  );
}

function Legend() {
  return (
    <div className="mt-5 flex flex-wrap gap-2">
      {(Object.keys(STATUS_META) as MealStatus[]).map((s) => (
        <StatusChip key={s} status={s} />
      ))}
    </div>
  );
}
