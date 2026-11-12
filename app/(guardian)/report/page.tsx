"use client";

import { useState } from "react";
import { fmtMonthDay, STATUS_META } from "@/components/guardian";
import { CookerMascot } from "@/components/Mascot";
import { DEVICE_REPORTS, PLANNED_DEVICES, type DeviceKind } from "@/components/report/devices";
import { Bar, ReportCard } from "@/components/report/parts";
import { PageHeader, Skeleton } from "@/components/ui";
import { useApp } from "@/lib/data/useApp";
import { reportSummary, SLOT_LABEL, type AppView } from "@/lib/data/view";
import { dailyMeals, slotRates } from "@/lib/report/metrics";

/**
 * 패턴 리포트. 위는 가전과 무관한 종합(끼니 확인율), 아래는 가전별 탭(components/report/devices.tsx 등록부).
 * 영양 상태를 판정하지 않고, 평소와 달라진 패턴만 보여 준다.
 */
export default function ReportPage() {
  const { view, now } = useApp();
  return (
    <main className="flex flex-col pb-8">
      <PageHeader title="패턴 리포트" />
      <div className="px-6">{!view || !now ? <Skeleton className="h-72" /> : <Report view={view} now={now} />}</div>
    </main>
  );
}

function Report({ view, now }: { view: AppView; now: Date }) {
  const devices = DEVICE_REPORTS.filter((d) => d.connected(view));
  const [kind, setKind] = useState<DeviceKind>(devices[0]?.kind ?? "rice_cooker");
  const device = devices.find((d) => d.kind === kind) ?? devices[0];

  return (
    <div className="mt-2 flex flex-col gap-4">
      <Overview view={view} now={now} />
      <SlotRates view={view} now={now} />
      <WeekStrip view={view} now={now} />

      <div className="mt-4">
        <h2 className="text-[17px] font-extrabold text-cocoa">가전별 리포트</h2>
        <div role="tablist" className="mt-3 flex gap-2 overflow-x-auto [scrollbar-width:none]">
          {devices.map((d) => (
            <button
              key={d.kind}
              role="tab"
              aria-selected={d.kind === device?.kind}
              onClick={() => setKind(d.kind)}
              className={`flex h-10 shrink-0 items-center gap-1.5 rounded-full border-2 px-4 text-[14px] font-bold ${
                d.kind === device?.kind ? "border-butter bg-butter text-cocoa" : "border-line bg-paper text-cocoa/70"
              }`}
            >
              <d.icon className="h-4 w-4" />
              {d.label}
            </button>
          ))}
          {PLANNED_DEVICES.map((d) => (
            <span key={d.kind} className="flex h-10 shrink-0 items-center rounded-full border-2 border-dashed border-line px-4 text-[14px] font-semibold text-muted">
              {d.label} · 준비 중
            </span>
          ))}
        </div>
      </div>
      {device ? device.sections.map(({ id, Body }) => <Body key={id} view={view} now={now} />) : null}

      <p className="mt-1 text-[12px] leading-relaxed text-muted">
        가전 사용 패턴만으로 만든 참고용 리포트예요. 영양 상태나 건강을 판단하지 않아요.
      </p>
    </div>
  );
}

/** 종합: 최근 7일 끼니 확인율과 평소 비교 */
function Overview({ view, now }: { view: AppView; now: Date }) {
  const summary = reportSummary(view, now);
  if (!summary) {
    return (
      <div className="flex flex-col items-center rounded-[1.75rem] bg-butter-soft px-6 py-8 text-center">
        <CookerMascot className="h-24 w-24" mood="sleepy" />
        <p className="mt-3 text-[18px] font-bold text-cocoa">평소와 비교할 기록을 모으는 중이에요</p>
        <p className="mt-1 text-[14px] text-muted">일주일 넘게 기록이 쌓이면 평소와 비교해 드릴게요.</p>
      </div>
    );
  }
  const { recent, before, r, b, trend, message } = summary;
  return (
    <>
      <section className={`rounded-[1.75rem] p-6 ${trend === "down" ? "bg-blush" : "bg-butter-soft"}`}>
        <p className="text-[15px] text-cocoa/70">최근 7일 끼니 확인율</p>
        <p className="mt-1 text-[44px] leading-none font-extrabold text-cocoa">{r}%</p>
        <p className="mt-3 text-[17px] font-bold text-cocoa">{message}</p>
        {trend === "down" ? <p className="mt-1 text-[15px] text-cocoa/75">{view.senior.relation}께 요즘 입맛은 어떠신지 여쭤보면 어떨까요?</p> : null}
      </section>
      <ReportCard title="평소와 비교">
        <Bar label="최근 7일" pct={r} strong />
        <Bar label="이전 4주" pct={b} />
        <p className="mt-3 text-[12px] text-muted">
          확인된 끼니 {recent.ok}/{recent.total} · 이전 {before.ok}/{before.total} (부재 기간 제외)
        </p>
      </ReportCard>
    </>
  );
}

/** 끼니별(아침·점심·저녁) 확인율 */
function SlotRates({ view, now }: { view: AppView; now: Date }) {
  const rows = slotRates(view, now);
  return (
    <ReportCard title="끼니별 확인율" aside="최근 7일">
      {rows.map((s) => (
        <Bar key={s.slot} label={SLOT_LABEL[s.slot]} pct={s.rate === null ? 0 : Math.round(s.rate * 100)} value={s.rate === null ? "기록 없음" : `${s.ok}/${s.total}일`} />
      ))}
    </ReportCard>
  );
}

/** 최근 7일 하루별 끼니 상태 */
function WeekStrip({ view, now }: { view: AppView; now: Date }) {
  const days = dailyMeals(view, now);
  const slots = view.mealProfile.windows.map((w) => w.slot);
  return (
    <ReportCard title="하루별 끼니" aside="최근 7일">
      <div className="mt-3 grid grid-cols-7 gap-1.5">
        {days.map((d) => (
          <div key={d.date} className="flex flex-col items-center gap-1">
            {slots.map((slot) => {
              const s = d.slots.find((x) => x.slot === slot);
              return (
                <span
                  key={slot}
                  title={`${fmtMonthDay(d.date)} ${SLOT_LABEL[slot]}: ${s ? STATUS_META[s.status].label : "기록 없음"}`}
                  className={`h-5 w-full rounded-md ${s ? STATUS_META[s.status].className : "bg-line/40"}`}
                />
              );
            })}
            <span className="mt-0.5 text-[11px] text-muted">{fmtMonthDay(d.date)}</span>
          </div>
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-muted">
        {(["confirmed", "eat_out", "unconfirmed", "away"] as const).map((st) => (
          <li key={st} className="flex items-center gap-1">
            <i className={`h-2.5 w-2.5 rounded-sm ${STATUS_META[st].className}`} />
            {STATUS_META[st].label}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[12px] text-muted">칸은 위에서부터 {slots.map((s) => SLOT_LABEL[s]).join("·")}이에요.</p>
    </ReportCard>
  );
}
