"use client";

// 어르신의 예시 체험은 이 브라우저에만 저장한다.

import { useSyncExternalStore } from "react";
import { addDays, kstDate, kstDateTime } from "@/lib/judge/time";
import type { Absence, MealSlotName, MealWindow } from "@/lib/judge/types";
import type { DemoState } from "@/lib/demo/state";
import { updateDemo, useDemo } from "@/lib/demo/store";
import { resetSeniorStepsConsent } from "@/lib/steps/consent";
import { mealSlotLabel } from "@/lib/data/view";

const KEY = "bapmutna.senior.token";
const EVENT = "bapmutna:senior";
const DEMO = "demo";

export type SeniorStatus = { seniorName: string; hasCookSignalToday: boolean; absence: Absence | null; mealWindows: MealWindow[] };
/** 기본은 지금·오늘부터. 어르신이 따로 고르면 그 끼니나 시작일로 남긴다. */
export type SeniorWhen = { meal?: { date: string; slot: MealSlotName }; startDate?: string };
export type SeniorOp = "eat_out" | "help" | "away" | "back";

function readToken(): string | null {
  try {
    return localStorage.getItem(KEY) === DEMO ? DEMO : null;
  } catch {
    return null;
  }
}
function writeToken(token: string | null) {
  if (token !== readToken()) resetSeniorStepsConsent();
  try {
    if (token) localStorage.setItem(KEY, token);
    else localStorage.removeItem(KEY);
  } catch {
    // 무시
  }
  window.dispatchEvent(new Event(EVENT));
}
function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export async function pairSenior(code: string): Promise<void> {
  if (!/^\d{6}$/.test(code)) throw new Error("숫자 여섯 개를 다시 확인해 주세요.");
  throw new Error("가족 휴대폰 연결을 준비하고 있어요.");
}

/** 사용자가 명시적으로 예시 체험을 선택했을 때만 호출한다. */
export function startSeniorDemo() {
  updateDemo((s) => ({ ...s, seniorPaired: true }));
  writeToken(DEMO);
}

export function disconnectSenior() {
  writeToken(null);
}

/** 진행 중인 끼니는 지금까지, 이미 지난 끼니는 시간대 한가운데에 기록한다. */
export function mealRecordTime(date: string, w: Pick<MealWindow, "start" | "end">, now: Date): Date | null {
  const start = kstDateTime(date, w.start).getTime();
  if (start > now.getTime()) return null;
  return new Date(Math.min(now.getTime(), start + (kstDateTime(date, w.end).getTime() - start) / 2));
}

/** 화면을 열 때의 기기와 현재 기기가 같을 때만 행동을 보낸다. */
export async function performSeniorAction(token: string | null | undefined, op: SeniorOp, days?: number, when: SeniorWhen = {}) {
  if (!token || token !== readToken()) throw new Error("연결이 바뀌었어요. 화면을 다시 확인해 주세요.");
  if (token !== DEMO) throw new Error("가족 휴대폰 연결을 먼저 확인해 주세요.");
  const now = new Date();
  const iso = now.toISOString();
  const today = kstDate(now);
  updateDemo((s) => {
    let at = iso;
    let meal;
    if (op === "eat_out" && when.meal) {
      const {date, slot} = when.meal;
      const window = s.mealProfile.windows.find(w => w.slot === slot);
      const time = window && (date === today || date === addDays(today, -1)) && mealRecordTime(date, window, now);
      if (!time) throw new Error("선택한 날짜와 끼니를 다시 확인해 주세요.");
      at = time.toISOString();
      meal = { date, label: mealSlotLabel(slot, s.mealProfile.windows) };
    }
    const actions = [...s.seniorActions, { type: op === "back" ? ("away" as const) : op, at }];
    if (op === "help")
      return { ...s, seniorActions: actions, alerts: [...s.alerts, { id: `help-${iso}`, type: "help_request", triggeredAt: iso, acknowledgedAt: null, resolvedAt: null }] };
    if (op === "away") {
      const startDate = when.startDate && when.startDate > today ? when.startDate : today;
      const endDate = addDays(startDate, (days ?? 1) - 1);
      return {
        ...s,
        seniorActions: actions,
        absences: [...s.absences.filter((a) => !(a.startDate <= endDate && startDate <= a.endDate)), { startDate, endDate }],
        alerts: [...s.alerts, { id: `away-${iso}`, type: "away", triggeredAt: iso, acknowledgedAt: null, resolvedAt: null, payload: { startDate, endDate } }],
      };
    }
    if (op === "back")
      return {
        ...s,
        seniorActions: actions,
        absences: s.absences
          .map((a) => (a.startDate <= today && today <= a.endDate ? { ...a, endDate: addDays(today, -1) } : a))
          .filter((a) => a.endDate >= a.startDate),
      };
    return { ...s, seniorActions: actions, alerts: [...s.alerts, { id: `eat_out-${iso}`, type: "eat_out", triggeredAt: iso, acknowledgedAt: null, resolvedAt: null, ...(meal && {payload: {meal}}) }] };
  });
}

export function seniorDemoStatus(demo: DemoState, now: Date): SeniorStatus {
  const today = kstDate(now);
  const midnight = kstDateTime(today, "00:00").getTime();
  const until = now.getTime();
  const hasCookSignalToday = demo.events.some(event => {
    if (event.type !== "cook") return false;
    const started = Date.parse(event.startedAt);
    return started >= midnight && started <= until;
  });
  return {
    seniorName: demo.senior.name,
    hasCookSignalToday,
    absence: demo.absences.find(a => a.startDate <= today && today <= a.endDate) ?? null,
    mealWindows: demo.mealProfile.windows,
  };
}

export function useSenior() {
  const token = useSyncExternalStore(subscribe, readToken, () => undefined);
  const isDemo = token === DEMO;
  const demo = useDemo(isDemo);
  const status = isDemo && demo ? seniorDemoStatus(demo, new Date()) : null;

  const act = (op: SeniorOp, days?: number, when?: SeniorWhen) => performSeniorAction(token, op, days, when);
  return {
    token, paired: isDemo, isDemo, status, error: null as string | null,
    pair: pairSenior, startDemo: startSeniorDemo, disconnect: disconnectSenior, canPair: false,
    refresh: async () => {}, act,
  };
}
