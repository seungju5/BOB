"use client";

import type { ComponentProps, ReactNode } from "react";
import { SLOT_LABEL } from "@/lib/data/view";
import type { MealWindow } from "@/lib/judge/types";

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[15px] font-bold text-cocoa">{label}</span>
      {children}
      {hint ? <span className="text-[13px] leading-relaxed text-muted">{hint}</span> : null}
    </div>
  );
}

export function TextInput(props: ComponentProps<"input">) {
  return (
    <input
      {...props}
      className={`h-14 rounded-2xl border-2 border-line bg-paper px-4 text-[16px] text-cocoa outline-none placeholder:text-muted/70 focus:border-butter-deep ${props.className ?? ""}`}
    />
  );
}

export function Choice<T extends string | number | boolean>({
  value,
  options,
  onChange,
  cols = 3,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
  cols?: number;
}) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`h-12 rounded-full border-2 text-[15px] font-bold transition-colors ${
            value === o.value ? "border-butter bg-butter text-cocoa" : "border-line bg-paper text-cocoa/70 hover:border-butter-deep"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Stepper({ value, min, max, step = 1, unit, onChange }: { value: number; min: number; max: number; step?: number; unit: string; onChange: (v: number) => void }) {
  const btn = "grid h-11 w-11 place-items-center rounded-full bg-butter-soft text-[22px] font-bold text-cocoa disabled:opacity-30";
  return (
    <div className="flex items-center justify-between rounded-2xl border-2 border-line px-3 py-2">
      <button type="button" className={btn} disabled={value <= min} onClick={() => onChange(Math.max(min, value - step))} aria-label="줄이기">
        −
      </button>
      <span className="text-[20px] font-extrabold text-cocoa" aria-live="polite">
        {value}
        <span className="ml-0.5 text-[15px] font-bold">{unit}</span>
      </span>
      <button type="button" className={btn} disabled={value >= max} onClick={() => onChange(Math.min(max, value + step))} aria-label="늘리기">
        +
      </button>
    </div>
  );
}

export function MealWindowsEditor({ windows, onChange }: { windows: MealWindow[]; onChange: (w: MealWindow[]) => void }) {
  const set = (i: number, key: "start" | "end", v: string) => onChange(windows.map((w, j) => (j === i ? { ...w, [key]: v } : w)));
  return (
    <div className="flex flex-col gap-2">
      {windows.map((w, i) => (
        <div key={w.slot} className="flex items-center gap-2 rounded-2xl border-2 border-line px-4 py-2">
          <span className="w-10 text-[15px] font-bold text-cocoa">{SLOT_LABEL[w.slot]}</span>
          <input type="time" value={w.start} onChange={(e) => set(i, "start", e.target.value)} aria-label={`${SLOT_LABEL[w.slot]} 시작`} className="min-w-0 flex-1 bg-transparent text-[16px] text-cocoa outline-none" />
          <span className="text-muted">~</span>
          <input type="time" value={w.end} onChange={(e) => set(i, "end", e.target.value)} aria-label={`${SLOT_LABEL[w.slot]} 끝`} className="min-w-0 flex-1 bg-transparent text-[16px] text-cocoa outline-none" />
        </div>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${checked ? "bg-sage-deep" : "bg-line"}`}
    >
      <span className={`absolute top-1 h-6 w-6 rounded-full bg-paper shadow transition-[left] ${checked ? "left-7" : "left-1"}`} />
    </button>
  );
}

/** 시간대가 올바른지: 시작 < 끝, 겹치지 않음 */
export function windowsValid(windows: MealWindow[]) {
  return windows.every((w, i) => w.start < w.end && (i === 0 || windows[i - 1].end <= w.start));
}
