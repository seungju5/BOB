"use client";

// 어르신 앱 데이터. 실서비스는 Edge Function `senior`(기기 토큰 인증), 데모는 브라우저 저장소.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { mealWindowsOn } from "@/lib/judge/resolveMealSlots";
import { addDays, kstDate } from "@/lib/judge/time";
import type { Absence, MealWindow } from "@/lib/judge/types";
import { lastCookerAt } from "@/lib/demo/derive";
import { updateDemo, useDemo } from "@/lib/demo/store";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import { resetSeniorStepsConsent } from "@/lib/steps/consent";

import { resolveMealChoice, type SeniorWhen } from "./senior-schedule";

export { mealRecordTime, type SeniorWhen } from "./senior-schedule";

const KEY = "bapmutna.senior.token";
const EVENT = "bapmutna:senior";
const DEMO = "demo";

export type SeniorStatus = { seniorName: string; lastCookerAt: string | null; absence: Absence | null; cookerObserved?: boolean; mealWindows?: MealWindow[]; yesterdayMealWindows?: MealWindow[]; scheduledActions?: boolean };
export type SeniorOp = "eat_out" | "help" | "away" | "back";

function readToken(): string | null {
  try {
    return localStorage.getItem(KEY);
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

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase().functions.invoke("senior", { body });
  if (error) {
    const msg = error instanceof FunctionsHttpError ? ((await error.context.json().catch(() => null)) as { error?: string } | null)?.error : null;
    const err = new Error(msg ?? "잠시 후 다시 시도해 주세요.") as Error & { status?: number };
    err.status = error instanceof FunctionsHttpError ? error.context.status : undefined;
    throw err;
  }
  return data as T;
}

/** 실제 연결은 서버 성공만 인정한다. 예시 코드로 실패를 대신하지 않는다. */
export async function pairSenior(code: string) {
  if (!/^\d{6}$/.test(code)) throw new Error("숫자 여섯 개를 다시 확인해 주세요.");
  if (!supabaseConfigured) throw new Error("실제 가족 연결은 아직 준비 중이에요.");
  const previousToken = readToken();
  const result = await call<{ token?: unknown }>({ op: "pair", code });
  if (typeof result?.token !== "string" || result.token.length < 32 || result.token === DEMO) {
    throw new Error("연결을 확인하지 못했어요. 다시 시도해 주세요.");
  }
  if (readToken() !== previousToken) throw new Error("연결이 바뀌었어요. 화면을 다시 확인해 주세요.");
  writeToken(result.token);
}

/** 사용자가 명시적으로 예시 체험을 선택했을 때만 호출한다. */
export function startSeniorDemo() {
  updateDemo((s) => ({ ...s, seniorPaired: true }));
  writeToken(DEMO);
}

export function disconnectSenior() {
  writeToken(null);
}

/** 화면을 열 때의 기기와 현재 기기가 같을 때만 행동을 보낸다. */
export async function performSeniorAction(token: string | null | undefined, op: SeniorOp, days?: number, when: SeniorWhen = {}) {
  if (!token || token !== readToken()) throw new Error("연결이 바뀌었어요. 화면을 다시 확인해 주세요.");
  if (token === DEMO) {
    const now = new Date();
    const iso = now.toISOString();
    const today = kstDate(now);
    updateDemo((s) => {
      const meal = op === "eat_out" && when.meal ? resolveMealChoice(when.meal, mealWindowsOn(when.meal.date, s.mealProfile.windows, s.mealScheduleHistory), now) : null;
      if (when.meal && !meal) throw new Error("선택한 날짜와 끼니를 다시 확인해 주세요.");
      const actions = [...s.seniorActions, { type: op === "back" ? ("away" as const) : op, at: meal?.at.toISOString() ?? iso }];
      if (op === "help")
        return { ...s, seniorActions: actions, alerts: [...s.alerts, { id: `help-${iso}`, type: "help_request", triggeredAt: iso, acknowledgedAt: null, resolvedAt: null }] };
      if (op === "away") {
        const startDate = when.startDate ?? today;
        if (![today, addDays(today, 1)].includes(startDate)) throw new Error("오늘 또는 내일을 선택해 주세요.");
        const endDate = addDays(startDate, (days ?? 1) - 1);
        return {
          ...s,
          seniorActions: actions,
          absences: [...s.absences.filter((a) => !(startDate <= a.startDate && a.endDate <= endDate)), { startDate, endDate }],
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
      return { ...s, seniorActions: actions, alerts: [...s.alerts, { id: `eat_out-${iso}`, type: "eat_out", triggeredAt: iso, acknowledgedAt: null, resolvedAt: null, ...(meal && { payload: { meal: { date: meal.date, label: meal.label } } }) }] };
    });
    return;
  }
  if (!supabaseConfigured) throw new Error("실제 가족 연결은 아직 준비 중이에요.");
  // Older Edge releases reject these distinct verbs instead of recording “now” or “today”.
  const serverOp = op === "eat_out" && when.meal ? "selected_meal" : op === "away" && when.startDate ? "planned_away" : op;
  const result = await call<{ ok?: boolean; applied?: SeniorWhen }>({ op: serverOp, token, days, ...(when.meal && { meal: when.meal }), ...(when.startDate && { startDate: when.startDate }) });
  if (result?.ok !== true || (when.meal && (result.applied?.meal?.date !== when.meal.date || result.applied?.meal?.slot !== when.meal.slot)) ||
      (when.startDate && result.applied?.startDate !== when.startDate)) {
    throw new Error("요청 접수를 확인하지 못했어요. 다시 시도해 주세요.");
  }
  if (token !== readToken()) throw new Error("연결이 바뀌었어요. 화면을 다시 확인해 주세요.");
}

export function useSenior() {
  const token = useSyncExternalStore(subscribe, readToken, () => undefined);
  const isDemo = token === DEMO;
  const demo = useDemo(isDemo);
  const [live, setLive] = useState<{ token: string; status: SeniorStatus } | null>(null);
  const [error, setError] = useState<{ token: string; message: string } | null>(null);

  const latestRead = useRef(0);
  const refresh = useCallback(async () => {
    const t = readToken();
    if (!t || t === DEMO) return;
    const request = ++latestRead.current;
    try {
      const status = await call<SeniorStatus>({ op: "status", token: t, includeSchedule: true });
      if (readToken() !== t || request !== latestRead.current) return;
      setLive({ token: t, status });
      setError(null);
    } catch (e) {
      if (readToken() !== t || request !== latestRead.current) return;
      setLive(null);
      setError({ token: t, message: (e as {status?:number}).status === 403 ? "어르신 동의가 필요해요. 보호자에게 확인해 주세요." : "소식을 불러오지 못했어요. 다시 시도해 주세요." });
      if ((e as { status?: number }).status === 401) writeToken(null); // 연결이 끊김 → 다시 연결
    }
  }, []);

  useEffect(() => {
    if (!token || isDemo) return;
    const first = setTimeout(() => void refresh(), 0);
    const id = setInterval(() => void refresh(), 60_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [token, isDemo, refresh]);

  const status: SeniorStatus | null = isDemo
    ? demo
      ? {
          seniorName: demo.senior.name,
          mealWindows: demo.mealProfile.windows,
          yesterdayMealWindows: mealWindowsOn(addDays(kstDate(new Date()), -1), demo.mealProfile.windows, demo.mealScheduleHistory),
          scheduledActions: true,
          lastCookerAt: lastCookerAt(demo)?.toISOString() ?? null,
          absence: demo.absences.find((a) => a.startDate <= kstDate(new Date()) && kstDate(new Date()) <= a.endDate) ?? null,
        }
      : null
    : live && live.token === token ? live.status : null;

  const act = async (op: SeniorOp, days?: number, when?: SeniorWhen) => {
    await performSeniorAction(token, op, days, when);
    if (!isDemo) await refresh();
  };

  return { token, paired: !!token, isDemo, status, error: error && error.token === token ? error.message : null, pair: pairSenior, startDemo: startSeniorDemo, disconnect: disconnectSenior, canPair: supabaseConfigured, refresh, act };
}
