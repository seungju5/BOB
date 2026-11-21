"use client";

// 가전별 리포트 등록부.
// 새 가전(전자레인지·냉장고 등)을 붙일 때는 이 파일에 DeviceReport 하나를 더한다:
//   1) kind·이름·아이콘  2) connected(view): 이 댁에 연결됐는지  3) sections: 그 가전만의 리포트 카드들
// 리포트 화면(app/(guardian)/report)은 이 목록을 돌며 탭과 섹션을 그리므로 화면 코드는 고치지 않아도 된다.
// 끼니 확인율처럼 가전과 무관한 종합 내용은 화면의 '종합' 영역에 둔다.

import type { ComponentType, SVGProps } from "react";
import { fmtMonthDay } from "@/components/guardian";
import { IconCooker, IconInfo } from "@/components/icons";
import { cookerUsage, energyUsage, WON_PER_KWH } from "@/lib/report/metrics";
import type { AppView } from "@/lib/data/view";
import { Bar, ReportCard } from "./parts";

export type DeviceKind = "rice_cooker" | "microwave" | "fridge" | "kettle";
export type ReportProps = { view: AppView; now: Date };
export type ReportSection = { id: string; Body: ComponentType<ReportProps> };
export type DeviceReport = {
  kind: DeviceKind;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  connected: (view: AppView) => boolean;
  sections: ReportSection[];
};

/* ───────── 밥솥 ───────── */

function CookerUsageSection({ view, now }: ReportProps) {
  const u = cookerUsage(view, now);
  if (u.cook === null || u.lid === null) return <ReportCard title="밥솥 사용" aside="최근 7일">
    <p className="mt-3 text-sm text-muted">이 기간에 기록된 밥솥 사용 횟수가 없어요.</p>
  </ReportCard>;
  const max = Math.max(1, ...u.perDay.map((d) => d.cook ?? 0));
  const scale = Math.max(u.cook, u.cookWeeklyBefore ?? 0, u.cooksPerWeekTold, 1);
  const vsBefore = u.recordedDays === 7 && u.cookWeeklyBefore !== null ? u.cook - u.cookWeeklyBefore : null;
  return (
    <ReportCard title="밥솥 사용" aside="최근 7일">
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Stat label="밥 지은 횟수" value={`${u.cook}번`} />
        <Stat label="뚜껑 연 횟수" value={view.mealProfile.usesKeepWarm ? `${u.lid}번` : "—"} hint={view.mealProfile.usesKeepWarm ? undefined : "보온을 안 쓰셔서 알 수 없어요"} />
      </div>
      <p className="mt-2 text-xs text-muted">최근 7일 중 기록이 있는 {u.recordedDays}일의 합계예요.</p>
      <div className="mt-4 flex h-20 items-end gap-1.5" aria-label="하루별 밥 지은 횟수">
        {u.perDay.map((d) => (
          <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
            {d.cook === null ? <span aria-label="기록 없음" className="text-xs text-muted">–</span> : d.cook === 0 ? <span className="text-xs" aria-label="0번">0</span> : <div className="w-full rounded-t-md bg-butter-deep" style={{ height: `${(d.cook / max) * 56}px`, minHeight: 4 }} title={`${d.cook}번`} />}
            <span className="text-[11px] text-muted">{fmtMonthDay(d.date)}</span>
          </div>
        ))}
      </div>
      <Bar label={`최근 기록 ${u.recordedDays}일 합계`} pct={(u.cook / scale) * 100} value={`${u.cook}번`} strong />
      {u.cookWeeklyBefore === null ? <p className="mt-2 text-xs text-muted">이전 4주 기록이 부족해 주 평균을 계산할 수 없어요.</p> : <Bar label="평소 (이전 4주 주 평균)" pct={u.cookWeeklyBefore / scale * 100} value={`${u.cookWeeklyBefore}번`} />}
      <Bar label="알려 주신 평소 횟수" pct={(u.cooksPerWeekTold / scale) * 100} value={`주 ${u.cooksPerWeekTold}번`} />
      {vsBefore !== null && Math.abs(vsBefore) >= 2 ? (
        <p className="mt-3 text-[14px] text-cocoa/80">
          평소보다 밥을 {Math.abs(Math.round(vsBefore))}번 {vsBefore < 0 ? "덜" : "더"} 지으셨어요.
        </p>
      ) : null}
    </ReportCard>
  );
}

function EnergySection({ view, now }: ReportProps) {
  const e = energyUsage(view, now);
  if (!e) {
    return (
      <ReportCard title="전기 사용량·요금" aside="준비 중">
        <p className="mt-3 flex gap-2 rounded-2xl bg-sky px-4 py-3 text-[14px] leading-relaxed text-cocoa/80">
          <IconInfo className="mt-0.5 h-4 w-4 shrink-0 text-sky-deep" />
          밥솥이 쓴 전기량과 예상 요금을 곧 보여 드릴게요. 하루 사용량 합계를 모으도록 준비하고 있어요.
        </p>
      </ReportCard>
    );
  }
  return (
    <ReportCard title="전기 사용량·요금" aside={`최근 ${e.days}일`}>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Stat label="사용량" value={`${e.kwh} kWh`} />
        <Stat label="예상 요금" value={`약 ${e.won.toLocaleString("ko-KR")}원`} />
      </div>
      <p className="mt-3 text-[12px] text-muted">kWh당 {WON_PER_KWH}원으로 어림한 값이에요. 실제 고지 요금과 다를 수 있어요.</p>
    </ReportCard>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl bg-butter-soft px-4 py-3">
      <p className="text-[12px] text-cocoa/70">{label}</p>
      <p className="mt-0.5 text-[22px] font-extrabold text-cocoa">{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-muted">{hint}</p> : null}
    </div>
  );
}

const riceCooker: DeviceReport = {
  kind: "rice_cooker",
  label: "밥솥",
  icon: IconCooker,
  // 지금은 밥솥이 기본 가전이다. 플러그 미연결이어도 기록(데모 포함)이 있으면 보여 준다.
  connected: () => true,
  sections: [
    { id: "cooker-usage", Body: CookerUsageSection },
    { id: "cooker-energy", Body: EnergySection },
  ],
};

/** 리포트를 그릴 수 있는 가전들 (화면에 이 순서로 탭이 생긴다) */
export const DEVICE_REPORTS: DeviceReport[] = [riceCooker];

/** 아직 연결할 수 없는 가전: 탭에 '준비 중'으로만 보여 준다 (brd.md 범위 밖, 데모데이 이후) */
export const PLANNED_DEVICES: { kind: DeviceKind; label: string }[] = [
  { kind: "microwave", label: "전자레인지" },
  { kind: "fridge", label: "냉장고" },
];
