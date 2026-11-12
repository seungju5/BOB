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

/**
 * 정수 슬라이더: 위에 현재 값, 아래에 눈금 라벨. 눈금을 눌러도 바뀐다.
 * marks로 라벨을 붙일 눈금만 고를 수 있고(기본: 전부), format으로 값 표시를 바꿀 수 있다 (예: 0 → "거의 안 함").
 */
export function Slider({
  value,
  min,
  max,
  unit,
  label,
  onChange,
  marks,
  format,
  step = 1,
  onCommit,
}: {
  value: number;
  min: number;
  max: number;
  unit: string;
  label: string;
  onChange: (v: number) => void;
  marks?: number[];
  format?: (v: number) => string | null;
  step?: number;
  /** 끌기를 마쳤을 때(손을 뗐을 때·키를 뗐을 때·눈금을 눌렀을 때) 한 번 불린다. 바로 저장하는 화면용. */
  onCommit?: (v: number) => void;
}) {
  const ticks = marks ?? Array.from({ length: Math.floor((max - min) / step) + 1 }, (_, i) => min + i * step);
  const pct = ((value - min) / (max - min)) * 100;
  const text = (v: number) => format?.(v) ?? `${v}${unit}`;
  return (
    <div className="rounded-2xl border-2 border-line px-4 pt-3 pb-2">
      <p className="text-center text-[22px] font-extrabold text-cocoa" aria-hidden>
        {format?.(value) ?? (
          <>
            {value}
            <span className="ml-0.5 text-[15px] font-bold">{unit}</span>
          </>
        )}
      </p>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        aria-valuetext={text(value)}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={(e) => onCommit?.(Number(e.currentTarget.value))}
        onKeyUp={(e) => onCommit?.(Number(e.currentTarget.value))}
        className="mt-2 h-3 w-full cursor-pointer appearance-none rounded-full accent-[var(--color-butter-deep)]"
        style={{ background: `linear-gradient(to right, var(--color-butter-deep) ${pct}%, var(--color-line) ${pct}%)` }}
      />
      {/* 눈금 라벨은 실제 위치에 둔다 (양 끝은 넘치지 않게 안쪽 정렬) */}
      <div className="relative mx-1.5 mt-1 h-7">
        {ticks.map((t, i) => {
          const at = ((t - min) / (max - min)) * 100;
          const align = i === 0 && at === 0 ? "" : i === ticks.length - 1 && at === 100 ? "-translate-x-full" : "-translate-x-1/2";
          return (
            <button
              key={t}
              type="button"
              tabIndex={-1}
              onClick={() => {
                onChange(t);
                onCommit?.(t);
              }}
              style={{ left: `${at}%` }}
              className={`absolute top-0 py-1 text-[13px] font-bold whitespace-nowrap ${align} ${t === value ? "text-cocoa" : "text-muted"}`}
            >
              {text(t)}
            </button>
          );
        })}
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

/** 알림 기준 슬라이더 범위. 공복 주의는 건강 위험보다 최소 GAP시간 앞서야 한다 (기존 Stepper 규칙과 같다). */
export const ALERT_RANGE = {
  missed: { min: 1, max: 6 },
  fasting: { min: 12, max: 108, step: 6 },
  emergency: { min: 24, max: 120, step: 6 },
  gap: 12,
} as const;

type AlertHours = { missedMealsThreshold: number; fastingHours: number; emergencyHours: number };

/** 한쪽 시간을 바꾸면 다른 쪽을 밀어 GAP을 지킨다 (끼니 시간대의 fitWindows와 같은 방식) */
export function fitAlertHours<T extends AlertHours>(s: T, changed: "fastingHours" | "emergencyHours"): T {
  const { gap } = ALERT_RANGE;
  if (changed === "fastingHours" && s.emergencyHours - s.fastingHours < gap) return { ...s, emergencyHours: Math.min(s.fastingHours + gap, ALERT_RANGE.emergency.max) };
  if (changed === "emergencyHours" && s.emergencyHours - s.fastingHours < gap) return { ...s, fastingHours: Math.max(s.emergencyHours - gap, ALERT_RANGE.fasting.min) };
  return s;
}

/** 알림 기준 세 가지(결식·공복·건강 위험) 슬라이더. 양 끝에 최소·최대 값을 표시한다. */
export function AlertThresholdFields<T extends AlertHours>({
  value,
  onChange,
  onCommit,
  hints,
}: {
  value: T;
  onChange: (s: T) => void;
  onCommit?: (s: T) => void;
  hints: { missed: string; fasting: string; emergency: string };
}) {
  const { missed, fasting, emergency } = ALERT_RANGE;
  const set = (key: keyof AlertHours, v: number) => {
    const next = { ...value, [key]: v };
    return key === "missedMealsThreshold" ? next : fitAlertHours(next, key);
  };
  return (
    <>
      <Field label="결식 알림" hint={hints.missed}>
        <Slider
          value={value.missedMealsThreshold}
          {...missed}
          marks={[missed.min, missed.max]}
          unit="끼"
          label="결식 알림 기준"
          onChange={(v) => onChange(set("missedMealsThreshold", v))}
          onCommit={(v) => onCommit?.(set("missedMealsThreshold", v))}
        />
      </Field>
      <Field label="공복시간 주의" hint={hints.fasting}>
        <Slider
          value={value.fastingHours}
          {...fasting}
          marks={[fasting.min, fasting.max]}
          unit="시간"
          label="공복시간 주의 기준"
          onChange={(v) => onChange(set("fastingHours", v))}
          onCommit={(v) => onCommit?.(set("fastingHours", v))}
        />
      </Field>
      <Field label="건강 위험 신고" hint={hints.emergency}>
        <Slider
          value={value.emergencyHours}
          {...emergency}
          marks={[emergency.min, emergency.max]}
          unit="시간"
          label="건강 위험 신고 기준"
          onChange={(v) => onChange(set("emergencyHours", v))}
          onCommit={(v) => onCommit?.(set("emergencyHours", v))}
        />
      </Field>
    </>
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

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const toTime = (m: number) => {
  const c = Math.min(Math.max(m, 0), 23 * 60 + 59);
  return `${String(Math.floor(c / 60)).padStart(2, "0")}:${String(c % 60).padStart(2, "0")}`;
};

/**
 * 끼니 시간대가 서로 겹치지 않게 맞춘다.
 * - 시작은 앞 끼니가 끝난 뒤로만 (앞보다 이르면 앞 끼니 끝으로 당긴다)
 * - 앞 끼니를 늦추면 뒤 끼니들을 그만큼 밀어 준다 (길이는 유지, 하루 끝 23:59까지)
 */
export function fitWindows(windows: MealWindow[], changed: number): MealWindow[] {
  const out = windows.map((w) => ({ ...w }));
  const prevEnd = changed > 0 ? out[changed - 1].end : null;
  if (prevEnd && out[changed].start < prevEnd) out[changed].start = prevEnd;
  for (let j = changed + 1; j < out.length; j++) {
    const before = out[j - 1].end;
    if (out[j].start >= before) break;
    const length = Math.max(toMin(windows[j].end) - toMin(windows[j].start), 30);
    out[j].start = before;
    out[j].end = toTime(toMin(before) + length);
  }
  return out;
}

/** 시간대마다 문제가 있는지: 끝이 시작보다 빠르거나, 앞 끼니와 겹치면 true */
function windowProblems(windows: MealWindow[]) {
  return windows.map((w, i) => w.start >= w.end || (i > 0 && w.start < windows[i - 1].end));
}

export function MealWindowsEditor({ windows, onChange }: { windows: MealWindow[]; onChange: (w: MealWindow[]) => void }) {
  const set = (i: number, key: "start" | "end", v: string) => {
    if (!v) return; // 입력을 지우는 중에는 그대로 둔다
    onChange(fitWindows(windows.map((w, j) => (j === i ? { ...w, [key]: v } : w)), i));
  };
  const bad = windowProblems(windows);
  return (
    <div className="flex flex-col gap-2">
      {windows.map((w, i) => (
        <div
          key={w.slot}
          aria-invalid={bad[i] || undefined}
          className={`flex items-center gap-2 rounded-2xl border-2 px-4 py-2 transition-colors ${bad[i] ? "border-blush-deep bg-blush" : "border-line"}`}
        >
          <span className={`w-10 text-[15px] font-bold ${bad[i] ? "text-blush-deep" : "text-cocoa"}`}>{SLOT_LABEL[w.slot]}</span>
          <input
            type="time"
            value={w.start}
            min={i > 0 ? windows[i - 1].end : undefined}
            onChange={(e) => set(i, "start", e.target.value)}
            aria-label={`${SLOT_LABEL[w.slot]} 시작`}
            className={`min-w-0 flex-1 bg-transparent text-[16px] outline-none ${bad[i] ? "text-blush-deep" : "text-cocoa"}`}
          />
          <span className="text-muted">~</span>
          <input
            type="time"
            value={w.end}
            min={w.start}
            onChange={(e) => set(i, "end", e.target.value)}
            aria-label={`${SLOT_LABEL[w.slot]} 끝`}
            className={`min-w-0 flex-1 bg-transparent text-[16px] outline-none ${bad[i] ? "text-blush-deep" : "text-cocoa"}`}
          />
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
