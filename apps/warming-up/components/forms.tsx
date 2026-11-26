"use client";

import { useId, useState, type ComponentProps, type ReactNode } from "react";
import { DEFAULT_WINDOWS, MAX_MEALS, initialMealWindowOverrides, mealSlotLabel, mealWindowsForCount } from "@/lib/data/view";
import type { MealWindow } from "@/lib/judge/types";
import { validMealWindows } from "@/lib/judge/resolveMealSlots";

export function Field({ label, hint, children, htmlFor }: { label: string; hint?: ReactNode; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="flex flex-col gap-2">
      {htmlFor ? <label htmlFor={htmlFor} className="text-[16px] font-bold text-cocoa">{label}</label> : <span className="text-[16px] font-bold text-cocoa">{label}</span>}
      {children}
      {hint ? <span className="text-[16px] leading-relaxed whitespace-pre-line text-muted">{hint}</span> : null}
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
          className={`h-12 rounded-full border-2 text-[16px] font-bold transition-colors ${
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
  id,
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
  id?: string;
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
            <span className="ml-0.5 text-[16px] font-bold">{unit}</span>
          </>
        )}
      </p>
      <input
        id={id}
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
        className="mt-1 h-12 w-full cursor-pointer appearance-none rounded-full accent-[var(--color-butter-deep)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cocoa"
        style={{ backgroundImage: `linear-gradient(to right, var(--color-butter-deep) ${pct}%, var(--color-line) ${pct}%)`, backgroundSize: "100% 0.75rem", backgroundPosition: "center", backgroundRepeat: "no-repeat" }}
      />
      {/* 눈금 라벨은 실제 위치에 둔다 (양 끝은 넘치지 않게 안쪽 정렬) */}
      <div className="relative mx-1.5 h-12">
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
              className={`absolute top-0 min-h-12 py-1 text-[16px] font-bold whitespace-nowrap ${align} ${t === value ? "text-cocoa" : "text-muted"}`}
            >
              {text(t)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const RELATIONS = ["어머니", "아버지", "부모님"];

/** 한 가구의 호칭은 한 가지를 고른다. 기존 복합 호칭은 기타에 보존한다. */
export function RelationPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [otherOn, setOtherOn] = useState(Boolean(value && !RELATIONS.includes(value)));
  const [other, setOther] = useState(RELATIONS.includes(value) ? "" : value);
  const chip = (on: boolean) => `h-12 rounded-full border-2 text-[16px] font-bold transition-colors ${on ? "border-butter bg-butter text-cocoa" : "border-line bg-paper text-cocoa/70 hover:border-butter-deep"}`;
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-4 gap-2" role="group" aria-label="호칭 한 가지 선택">
        {RELATIONS.map((relation) => <button key={relation} type="button" aria-pressed={!otherOn && value === relation} onClick={() => { setOtherOn(false); onChange(relation); }} className={chip(!otherOn && value === relation)}>{relation}</button>)}
        <button type="button" aria-pressed={otherOn} onClick={() => { setOtherOn(true); onChange(other.trim()); }} className={chip(otherOn)}>기타</button>
      </div>
      {otherOn ? <TextInput autoFocus aria-label="부르는 호칭 직접 입력" placeholder="예: 할머니" maxLength={30} value={other} onChange={(e) => { setOther(e.target.value); onChange(e.target.value.trim()); }} /> : null}
    </div>
  );
}

/** 알림 기준 슬라이더 범위. 공복 주의는 건강 위험보다 최소 GAP시간 앞서야 한다 (기존 Stepper 규칙과 같다). */
export const ALERT_RANGE = {
  missed: { min: 3, max: 10 },
  fasting: { min: 12, max: 108, step: 6 },
  emergency: { min: 24, max: 120, step: 6 },
  gap: 12,
} as const;

type AlertHours = { missedMealsThreshold: number; fastingHours: number; emergencyHours: number };

const DAY_WORDS = ["", "하루", "이틀", "사흘", "나흘", "닷새", "엿새"];

/** 결식 알림 끼니 수가 하루 끼니 수 기준으로 며칠쯤인지 풀어서 알려 준다. */
export function missedMealsHint(threshold: number, mealsPerDay: number): string {
  const base = "연속으로 이만큼 끼니 소식이 없으면 알려 드려요.";
  if (mealsPerDay < 1 || threshold < 1) return base;
  const days = Math.floor(threshold / mealsPerDay);
  const rest = threshold % mealsPerDay;
  const span = days === 0
    ? "하루가 채 안 되는 동안"
    : `${DAY_WORDS[days] ?? `${days}일`}${rest ? ` 하고 ${rest}끼` : ""} 동안`;
  return `${base}\n하루 ${mealsPerDay}끼로 설정했으니 ${threshold}끼면 ${span} 소식이 없을 때예요.`;
}

/** 한쪽 알림 시간을 바꾸면 다른 쪽을 밀어 기존 GAP을 지킨다. */
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
  const btn = "grid h-12 w-12 place-items-center rounded-full bg-butter-soft text-[22px] font-bold text-cocoa disabled:opacity-30";
  return (
    <div className="flex items-center justify-between rounded-2xl border-2 border-line px-3 py-2">
      <button type="button" className={btn} disabled={value <= min} onClick={() => onChange(Math.max(min, value - step))} aria-label="줄이기">
        −
      </button>
      <span className="text-[20px] font-extrabold text-cocoa" aria-live="polite">
        {value}
        <span className="ml-0.5 text-[16px] font-bold">{unit}</span>
      </span>
      <button type="button" className={btn} disabled={value >= max} onClick={() => onChange(Math.min(max, value + step))} aria-label="늘리기">
        +
      </button>
    </div>
  );
}

const validTime = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

export function useMealWindowDraft(savedWindows: MealWindow[]) {
  const [meals, setMeals] = useState(Math.min(MAX_MEALS, savedWindows.length || DEFAULT_WINDOWS.length));
  const [overrides, setOverrides] = useState(() => initialMealWindowOverrides(savedWindows));
  const windows = mealWindowsForCount(meals, overrides);
  function setWindows(next: MealWindow[]) {
    setOverrides(previous => initialMealWindowOverrides(next, previous));
  }
  function resetWindows() {
    setOverrides(previous => {
      const next = initialMealWindowOverrides(mealWindowsForCount(meals), previous);
      next.slotOrderByCount = { ...previous.slotOrderByCount };
      delete next.slotOrderByCount[meals];
      return next;
    });
  }
  return { meals, setMeals, windows, setWindows, resetWindows };
}

/** 고른 시간만 바꾼다. 다른 끼니를 자동으로 옮기거나 입력 중인 초안을 버리지 않는다. */
export function changeMealWindow(windows: MealWindow[], index: number, key: "start" | "end", value: string): MealWindow[] {
  return windows.map((window, i) => i === index ? { ...window, [key]: value } : { ...window });
}

/** 시간대별로 수정할 항목을 알려 준다. 판정 규칙이나 기존 알림 기준은 바꾸지 않는다. */
export function mealWindowProblems(windows: MealWindow[]): Array<string | null> {
  return windows.map((window, i) => {
    if (!validTime(window.start) || !validTime(window.end)) return "시작과 끝 시간을 모두 입력해 주세요.";
    if (window.start >= window.end) return "같은 날 안에서 끝 시간을 시작 시간보다 늦게 정해 주세요.";
    const previous = windows[i - 1];
    if (previous && validTime(previous.end) && window.start < previous.end) {
      return `${mealSlotLabel(previous.slot, windows)} 끝(${previous.end})과 겹쳐요. ${mealSlotLabel(window.slot, windows)} 시작을 ${previous.end} 이후로 정하거나 앞 끼니의 끝을 바꿔 주세요.`;
    }
    return null;
  });
}

export function MealWindowsEditor({ windows, onChange, onReset }: { windows: MealWindow[]; onChange: (w: MealWindow[]) => void; onReset?: () => void }) {
  const id = useId();
  const problems = mealWindowProblems(windows);
  return (
    <div className="flex flex-col gap-3">
      <p id={`${id}-hint`} className="text-[16px] leading-relaxed text-muted">시간은 한국 시간(KST)이에요. 한 끼를 고쳐도 다른 끼니 시간은 바뀌지 않아요.</p>
      {windows.map((w, i) => (
        <fieldset
          key={w.slot}
          className={`min-w-0 rounded-2xl border-2 px-4 pb-4 transition-colors ${problems[i] ? "border-blush-deep bg-blush" : "border-line"}`}
        >
          <legend className="px-1 text-[16px] font-bold text-cocoa">{mealSlotLabel(w.slot, windows)}</legend>
          <div className="mt-2 grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 8.5rem), 1fr))" }}>
            {(["start", "end"] as const).map((key) => (
              <label key={key} className="flex min-w-0 flex-col gap-1.5 text-[16px] font-semibold text-cocoa">
                {key === "start" ? "시작" : "끝"}
                <input
                  type="time"
                  value={w[key]}
                  step={60}
                  onChange={(event) => onChange(changeMealWindow(windows, i, key, event.target.value))}
                  aria-label={`${mealSlotLabel(w.slot, windows)} ${key === "start" ? "시작" : "끝"} 시간`}
                  aria-invalid={!!problems[i] || undefined}
                  aria-describedby={`${id}-hint${problems[i] ? ` ${id}-${w.slot}-error` : ""}`}
                  className="min-h-12 min-w-0 w-full rounded-xl border border-line bg-paper px-3 text-[17px] text-cocoa outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cocoa"
                />
              </label>
            ))}
          </div>
          {problems[i] ? <p id={`${id}-${w.slot}-error`} role="status" className="mt-3 text-[16px] leading-relaxed font-semibold text-blush-deep">{problems[i]}</p> : null}
        </fieldset>
      ))}
      {onReset && problems.some(Boolean) && <button type="button" onClick={onReset}
        className="min-h-11 self-start rounded-lg px-2 font-bold text-cocoa underline underline-offset-4">
        {windows.length}끼 기본 시간으로 맞추기
      </button>}
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
      className="grid h-12 w-16 shrink-0 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cocoa"
    >
      <span aria-hidden className={`relative h-8 w-14 rounded-full transition-colors ${checked ? "bg-sage-deep" : "bg-line"}`}><span className={`absolute top-1 h-6 w-6 rounded-full bg-paper shadow transition-[left] ${checked ? "left-7" : "left-1"}`} /></span>
    </button>
  );
}

/** 시간대가 올바른지: 시작 < 끝, 겹치지 않음 */
export function windowsValid(windows: MealWindow[]) {
  return validMealWindows(windows);
}
