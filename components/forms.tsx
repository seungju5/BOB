"use client";

import { useState, type ComponentProps, type ReactNode } from "react";
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

/** 정수 슬라이더: 위에 현재 값, 아래에 눈금 라벨. 눈금을 눌러도 바뀐다. */
export function Slider({ value, min, max, unit, label, onChange }: { value: number; min: number; max: number; unit: string; label: string; onChange: (v: number) => void }) {
  const ticks = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="rounded-2xl border-2 border-line px-4 pt-3 pb-2">
      <p className="text-center text-[22px] font-extrabold text-cocoa" aria-hidden>
        {value}
        <span className="ml-0.5 text-[15px] font-bold">{unit}</span>
      </p>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        aria-label={label}
        aria-valuetext={`${value}${unit}`}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 h-3 w-full cursor-pointer appearance-none rounded-full accent-[var(--color-butter-deep)]"
        style={{ background: `linear-gradient(to right, var(--color-butter-deep) ${pct}%, var(--color-line) ${pct}%)` }}
      />
      <div className="mt-1 flex justify-between">
        {ticks.map((t) => (
          <button
            key={t}
            type="button"
            tabIndex={-1}
            onClick={() => onChange(t)}
            className={`w-8 py-1 text-center text-[13px] font-bold ${t === value ? "text-cocoa" : "text-muted"}`}
          >
            {t}
            {unit}
          </button>
        ))}
      </div>
    </div>
  );
}

const RELATIONS =["어머니", "아버지", "부모님"];
const RELATION_SEP = "·";

/**
 * 어르신 호칭: 여러 개 고를 수 있고, 기타는 직접 입력한다.
 * 저장은 한 문자열로 ("어머니·아버지", "어머니·이모"). DB 칼럼(senior_relation text)은 그대로다.
 */
export function RelationPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const parts = value.split(RELATION_SEP).map((p) => p.trim()).filter(Boolean);
  const [picked, setPicked] = useState(() => RELATIONS.filter((r) => parts.includes(r)));
  const initialOther = parts.filter((p) => !RELATIONS.includes(p)).join(" ");
  const [otherOn, setOtherOn] = useState(initialOther !== "");
  const [other, setOther] = useState(initialOther);

  const emit = (p: string[], on: boolean, text: string) =>
    onChange([...RELATIONS.filter((r) => p.includes(r)), on ? text.trim() : ""].filter(Boolean).join(RELATION_SEP));
  const toggle = (r: string) => {
    const next = picked.includes(r) ? picked.filter((x) => x !== r) : [...picked, r];
    setPicked(next);
    emit(next, otherOn, other);
  };
  const chip = (on: boolean) =>
    `h-12 rounded-full border-2 text-[15px] font-bold transition-colors ${on ? "border-butter bg-butter text-cocoa" : "border-line bg-paper text-cocoa/70 hover:border-butter-deep"}`;

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-4 gap-2">
        {RELATIONS.map((r) => (
          <button key={r} type="button" aria-pressed={picked.includes(r)} onClick={() => toggle(r)} className={chip(picked.includes(r))}>
            {r}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={otherOn}
          onClick={() => {
            setOtherOn(!otherOn);
            emit(picked, !otherOn, other);
          }}
          className={chip(otherOn)}
        >
          기타
        </button>
      </div>
      {otherOn ? (
        <TextInput
          autoFocus
          aria-label="부르는 호칭 직접 입력"
          placeholder="예: 할머니, 이모"
          maxLength={10}
          value={other}
          onChange={(e) => {
            setOther(e.target.value);
            emit(picked, true, e.target.value);
          }}
        />
      ) : null}
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
