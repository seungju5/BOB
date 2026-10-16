"use client";

// 어르신 앱 데이터. 실서비스는 Edge Function `senior`(기기 토큰 인증), 데모는 브라우저 저장소.

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { addDays, kstDate } from "@/lib/judge/time";
import type { Absence } from "@/lib/judge/types";
import { lastCookerAt } from "@/lib/demo/derive";
import { updateDemo, useDemo } from "@/lib/demo/store";
import { supabase, supabaseConfigured } from "@/lib/supabase";

const KEY = "bapmutna.senior.token";
const EVENT = "bapmutna:senior";
const DEMO = "demo";

export type SeniorStatus = { seniorName: string; lastCookerAt: string | null; absence: Absence | null };
export type SeniorOp = "eat_out" | "help" | "away" | "back";

function readToken(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}
function writeToken(token: string | null) {
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

export function useSenior() {
  const token = useSyncExternalStore(subscribe, readToken, () => undefined);
  const demo = useDemo();
  const [live, setLive] = useState<SeniorStatus | null>(null);
  const isDemo = token === DEMO;

  const refresh = useCallback(async () => {
    const t = readToken();
    if (!t || t === DEMO) return;
    try {
      setLive(await call<SeniorStatus>({ op: "status", token: t }));
    } catch (e) {
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
          lastCookerAt: lastCookerAt(demo)?.toISOString() ?? null,
          absence: demo.absences.find((a) => a.startDate <= kstDate(new Date()) && kstDate(new Date()) <= a.endDate) ?? null,
        }
      : null
    : live;

  /** 연결 숫자로 기기 연결. 실서비스 숫자가 아니면 데모 숫자인지 확인한다. */
  const pair = async (code: string) => {
    if (supabaseConfigured) {
      try {
        const { token } = await call<{ token: string }>({ op: "pair", code });
        writeToken(token);
        return;
      } catch (e) {
        if (demo?.pairingCode !== code) throw e;
      }
    }
    if (demo?.pairingCode === code) {
      updateDemo((s) => ({ ...s, seniorPaired: true }));
      writeToken(DEMO);
      return;
    }
    throw new Error("숫자가 맞지 않아요. 다시 확인해 주세요.");
  };

  const act = async (op: SeniorOp, days?: number) => {
    if (isDemo) {
      const iso = new Date().toISOString();
      const today = kstDate(new Date());
      updateDemo((s) => {
        const actions = [...s.seniorActions, { type: op === "back" ? ("away" as const) : op === "help" ? ("help" as const) : op === "away" ? ("away" as const) : ("eat_out" as const), at: iso }];
        if (op === "help")
          return { ...s, seniorActions: actions, alerts: [...s.alerts, { id: `help-${iso}`, type: "help_request", triggeredAt: iso, acknowledgedAt: null, resolvedAt: null }] };
        if (op === "away")
          return {
            ...s,
            seniorActions: actions,
            absences: [...s.absences.filter((a) => !(a.startDate <= today && today <= a.endDate)), { startDate: today, endDate: addDays(today, (days ?? 1) - 1) }],
          };
        if (op === "back")
          return {
            ...s,
            seniorActions: actions,
            absences: s.absences
              .map((a) => (a.startDate <= today && today <= a.endDate ? { ...a, endDate: addDays(today, -1) } : a))
              .filter((a) => a.endDate >= a.startDate),
          };
        return { ...s, seniorActions: actions };
      });
      return;
    }
    await call({ op, token: readToken(), days });
    await refresh();
  };

  return { token, paired: !!token, isDemo, status, pair, act };
}
