// 리포트 화면 공통 조각: 섹션 카드, 막대

import type { ReactNode } from "react";

export function ReportCard({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-[1.75rem] border border-line p-5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-bold text-cocoa">{title}</h2>
        {aside ? <span className="text-[12px] text-muted">{aside}</span> : null}
      </div>
      {children}
    </section>
  );
}

export function Bar({ label, pct, value, strong }: { label: string; pct: number; value?: string; strong?: boolean }) {
  return (
    <div className="mt-3">
      <div className="flex justify-between text-[13px]">
        <span className={strong ? "font-bold text-cocoa" : "text-muted"}>{label}</span>
        <span className={strong ? "font-bold text-cocoa" : "text-muted"}>{value ?? `${pct}%`}</span>
      </div>
      <div className="mt-1.5 h-3 overflow-hidden rounded-full bg-line/60">
        <div className={`h-full rounded-full ${strong ? "bg-butter-deep" : "bg-butter-deep/40"}`} style={{ width: `${Math.min(Math.max(pct, 0), 100)}%` }} />
      </div>
    </div>
  );
}
