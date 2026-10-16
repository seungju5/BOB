"use client";

import { Mascot } from "@/components/Mascot";
import { PageHeader, Skeleton } from "@/components/ui";
import { useApp } from "@/lib/data/useApp";
import { patternReport, type AppView } from "@/lib/data/view";

/** 패턴 변화 리포트 (MVP 간소화: 최근 7일 vs 이전 28일). 영양 상태를 판정하지 않는다. */
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
  const { recent, before } = patternReport(view, now);
  const relation = view.senior.relation;

  if (recent.rate === null || before.total < 14) {
    return (
      <div className="mt-10 flex flex-col items-center text-center">
        <Mascot className="h-28 w-28" mood="sleepy" />
        <p className="mt-4 text-[20px] font-bold text-cocoa">데이터를 모으는 중이에요</p>
        <p className="mt-1 text-[15px] text-muted">일주일 넘게 기록이 쌓이면 평소와 비교해 드릴게요.</p>
      </div>
    );
  }

  const r = Math.round(recent.rate * 100);
  const b = Math.round((before.rate ?? 0) * 100);
  const diff = r - b;

  return (
    <div className="mt-2">
      <section className={`rounded-[1.75rem] p-6 ${diff <= -10 ? "bg-blush" : "bg-butter-soft"}`}>
        <p className="text-[15px] text-cocoa/70">최근 7일 끼니 확인율</p>
        <p className="mt-1 text-[44px] leading-none font-extrabold text-cocoa">{r}%</p>
        <p className="mt-3 text-[17px] font-bold text-cocoa">
          {diff <= -10
            ? `평소(${b}%)보다 식사 소식이 줄었어요.`
            : diff >= 10
              ? `평소(${b}%)보다 소식이 많아졌어요.`
              : `평소(${b}%)와 비슷하게 지내고 계세요.`}
        </p>
        {diff <= -10 ? <p className="mt-1 text-[15px] text-cocoa/75">{relation}께 요즘 입맛은 어떠신지 여쭤보면 어떨까요?</p> : null}
      </section>

      <section className="mt-4 rounded-[1.75rem] border border-line p-5">
        <h2 className="text-[15px] font-bold text-cocoa">평소와 비교</h2>
        <Bar label="최근 7일" pct={r} strong />
        <Bar label="이전 4주" pct={b} />
        <p className="mt-3 text-[12px] text-muted">
          확인된 끼니 {recent.ok}/{recent.total} · 이전 {before.ok}/{before.total} (부재 기간 제외)
        </p>
      </section>

      <p className="mt-5 text-[12px] leading-relaxed text-muted">
        밥솥 사용 패턴만으로 만든 참고용 리포트예요. 영양 상태나 건강을 판단하지 않아요.
      </p>
    </div>
  );
}

function Bar({ label, pct, strong }: { label: string; pct: number; strong?: boolean }) {
  return (
    <div className="mt-3">
      <div className="flex justify-between text-[13px]">
        <span className={strong ? "font-bold text-cocoa" : "text-muted"}>{label}</span>
        <span className={strong ? "font-bold text-cocoa" : "text-muted"}>{pct}%</span>
      </div>
      <div className="mt-1.5 h-3 overflow-hidden rounded-full bg-line/60">
        <div className={`h-full rounded-full ${strong ? "bg-butter-deep" : "bg-butter-deep/40"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
