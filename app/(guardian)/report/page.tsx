"use client";

import { useState } from "react";
import Link from "next/link";
import { fmtMonthDay, StatusIcon } from "@/components/guardian";
import { Mascot } from "@/components/Mascot";
import { DEVICE_REPORTS, PLANNED_DEVICES, type DeviceKind } from "@/components/report/devices";
import { Bar, ReportCard } from "@/components/report/parts";
import { PageHeader, Skeleton } from "@/components/ui";
import { useApp } from "@/lib/data/useApp";
import { careDataAvailable, reportSummary, type AppView } from "@/lib/data/view";
import { MEAL_STATUS_LABEL, mealStatusClass, useMealPalette } from "@/lib/data/appearance";
import { MealStatusLegend } from "@/components/MealStatus";
import { dailyMeals, mealPositionRows, slotRates } from "@/lib/report/metrics";
import { kstDate } from "@/lib/judge/time";

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
  const today = kstDate(now);

  if (!careDataAvailable(view) && !view.slots.length && !Object.keys(view.stats).length) {
    return (
      <section className="mt-2 rounded-[1.75rem] border border-line bg-paper p-6">
        <Mascot className="h-24 w-24" mood="sleepy" />
        <h2 className="mt-3 text-[18px] font-bold text-cocoa">{view.captureReadError ? "저장한 밥솥 기록을 불러오지 못했어요" : "연결된 소식이 쌓이면 비교해 드릴게요"}</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-muted">{view.cookerMealDays ? "날짜별 기록이 켜져 있어요. 첫 취사 신호가 들어오면 이곳에 표시해요." : "현재 계정에는 가족·기기의 식사 기록이 아직 연결되지 않았어요. 기록이 없다는 이유로 식사 여부를 판단하지 않아요."}</p>
        <Link href="/settings" className="mt-4 inline-flex min-h-11 items-center font-bold text-cocoa underline underline-offset-4">연결 설정 보기</Link>
      </section>
    );
  }

  return (
    <div className="mt-2 flex flex-col gap-4">
      {view.mode === "demo" ? <p className="text-[12px] text-muted">체험용 가상 기록을 비교한 리포트예요.</p> : null}
      {view.cookerMealDays ? <div className="text-[16px] text-muted"><p>밥솥 사용이 확인된 날짜와 끼니 시간대를 모았어요.</p>
        {view.stats[today] && <Link href={"/records/?day="+today} className="inline-flex min-h-11 items-center font-bold text-cocoa underline">오늘의 밥솥 기록 보기</Link>}</div> : <>
        <Overview view={view} now={now} />
        <SlotRates view={view} now={now} />
      </>}
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
        <Mascot className="h-24 w-24" mood="sleepy" />
        <p className="mt-3 text-[18px] font-bold text-cocoa">평소와 비교할 기록을 모으는 중이에요</p>
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
      </section>
      <ReportCard title="평소와 비교">
        <Bar label="어제까지 7일" pct={r} strong />
        <Bar label="이전 4주" pct={b} />
        <p className="mt-3 text-[12px] text-muted">
          확인된 끼니 {recent.ok}/{recent.total} · 이전 {before.ok}/{before.total} (외식 포함, 부재·대기 제외)
        </p>
      </ReportCard>
    </>
  );
}

/** 해당 주 각 날짜의 끼니 순서별 확인율 */
function SlotRates({ view, now }: { view: AppView; now: Date }) {
  const rows = slotRates(view, now);
  return (
    <ReportCard title="끼니별 확인율" aside="최근 7일">
      {rows.map((s) => (
        <Bar key={s.position} label={s.label} pct={s.rate === null ? 0 : Math.round(s.rate * 100)} value={s.rate === null ? "기록 없음" : `${s.ok}/${s.total}일`} />
      ))}
    </ReportCard>
  );
}

/** 최근 7일 하루별 끼니 상태 */
function WeekStrip({ view, now }: { view: AppView; now: Date }) {
  const palette = useMealPalette();
  const days = dailyMeals(view, now);
  const rows = mealPositionRows(days);
  return (
    <ReportCard title="하루별 끼니" aside="최근 7일">
      <div className="mt-3 grid grid-cols-7 gap-1.5">
        {days.map((d) => (
          <div key={d.date} className="flex flex-col items-center gap-1">
            {rows.map(({ position, label }) => {
              const s = d.slots.find(x => x.position === position);
              return (
                <span
                  key={position}
                  role="img"
                  aria-label={`${fmtMonthDay(d.date)} ${label} ${s ? MEAL_STATUS_LABEL[s.status] : "기록 없음"}`}
                  className={`grid h-6 w-full place-items-center rounded-md ${s ? mealStatusClass(s.status, palette) : "bg-neutral-100 text-muted"}`}
                >{s ? <StatusIcon status={s.status} className="h-3.5 w-3.5" /> : <span aria-hidden="true">–</span>}</span>
              );
            })}
            <span className="mt-0.5 text-[11px] text-muted">{fmtMonthDay(d.date)}</span>
          </div>
        ))}
      </div>
      <MealStatusLegend />
      <p className="mt-2 text-[12px] text-muted">{rows.length ? `위에서부터 ${rows.map(row => row.label).join(" · ")} 순서예요.` : "이 주에는 끼니 기록이 없어요."}</p>
    </ReportCard>
  );
}
