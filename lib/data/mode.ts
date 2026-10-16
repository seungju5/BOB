"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, supabaseConfigured } from "@/lib/supabase";

// 보호자 앱 모드: 'live' = Supabase 로그인, 'demo' = 브라우저 저장소 데모
const KEY = "bapmutna.mode";
const EVENT = "bapmutna:mode";

export type Mode = "demo" | "live";

function read(): Mode | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "demo" || v === "live" ? v : null;
  } catch {
    return null;
  }
}

export function setMode(mode: Mode | null) {
  try {
    if (mode) localStorage.setItem(KEY, mode);
    else localStorage.removeItem(KEY);
  } catch {
    // 저장소를 못 쓰면 이번 세션만
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

/** 선택된 모드. 서버 렌더링 중에는 undefined. */
export function useMode(): Mode | null | undefined {
  return useSyncExternalStore(subscribe, read, () => undefined);
}

/** Supabase 로그인 세션. 확인 전 undefined, 없으면 null. */
export function useSession(): Session | null | undefined {
  const [session, setSession] = useState<Session | null | undefined>(supabaseConfigured ? undefined : null);
  useEffect(() => {
    if (!supabaseConfigured) return;
    const auth = supabase().auth;
    auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  return session;
}
