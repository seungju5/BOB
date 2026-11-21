"use client";

// 어르신의 예시 체험은 이 브라우저에만 저장한다.

import { useSyncExternalStore } from "react";
import { addDays, kstDate } from "@/lib/judge/time";
import type { Absence } from "@/lib/judge/types";
import { lastCookerAt } from "@/lib/demo/derive";
import { updateDemo, useDemo } from "@/lib/demo/store";
import { resetSeniorStepsConsent } from "@/lib/steps/consent";

const KEY = "bapmutna.senior.token";
const EVENT = "bapmutna:senior";
const DEMO = "demo";

export type SeniorStatus = { seniorName: string; lastCookerAt: string | null; absence: Absence | null };
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

/** 화면을 열 때의 기기와 현재 기기가 같을 때만 행동을 보낸다. */
export async function performSeniorAction(token: string | null | undefined, op: SeniorOp, days?: number) {
  if (!token || token !== readToken()) throw new Error("연결이 바뀌었어요. 화면을 다시 확인해 주세요.");
  if (token !== DEMO) throw new Error("가족 휴대폰 연결을 먼저 확인해 주세요.");
  const iso = new Date().toISOString();
  const today = kstDate(new Date());
  updateDemo((s) => {
    const actions = [...s.seniorActions, { type: op === "back" ? ("away" as const) : op, at: iso }];
    if (op === "help")
      return { ...s, seniorActions: actions, alerts: [...s.alerts, { id: `help-${iso}`, type: "help_request", triggeredAt: iso, acknowledgedAt: null, resolvedAt: null }] };
    if (op === "away") {
      const endDate = addDays(today, (days ?? 1) - 1);
      return {
        ...s,
        seniorActions: actions,
        absences: [...s.absences.filter((a) => !(a.startDate <= today && today <= a.endDate)), { startDate: today, endDate }],
        alerts: [...s.alerts, { id: `away-${iso}`, type: "away", triggeredAt: iso, acknowledgedAt: null, resolvedAt: null, payload: { endDate } }],
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
    return { ...s, seniorActions: actions, alerts: [...s.alerts, { id: `eat_out-${iso}`, type: "eat_out", triggeredAt: iso, acknowledgedAt: null, resolvedAt: null }] };
  });
}

export function useSenior() {
  const token = useSyncExternalStore(subscribe, readToken, () => undefined);
  const demo = useDemo();
  const isDemo = token === DEMO;
  const status: SeniorStatus | null = isDemo
    ? demo
      ? {
          seniorName: demo.senior.name,
          lastCookerAt: lastCookerAt(demo)?.toISOString() ?? null,
          absence: demo.absences.find((a) => a.startDate <= kstDate(new Date()) && kstDate(new Date()) <= a.endDate) ?? null,
        }
      : null
    : null;

  const act = (op: SeniorOp, days?: number) => performSeniorAction(token, op, days);
  return {
    token, paired: isDemo, isDemo, status, error: null as string | null,
    pair: pairSenior, startDemo: startSeniorDemo, disconnect: disconnectSenior, canPair: false,
    refresh: async () => {}, act,
  };
}
