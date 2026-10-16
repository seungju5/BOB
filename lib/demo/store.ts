"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { syncAlerts } from "./derive";
import { createDemoState, type DemoState } from "./state";

const KEY = "bapmutna.demo.v1";
const EVENT = "bapmutna:update";

let cache: { raw: string | null; value: DemoState | null } = { raw: null, value: null };

function read(): DemoState | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return cache.value;
  }
  if (raw !== cache.raw) {
    try {
      cache = { raw, value: raw ? (JSON.parse(raw) as DemoState) : null };
    } catch {
      cache = { raw, value: null };
    }
  }
  return cache.value;
}

function write(state: DemoState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // 저장소를 쓸 수 없는 환경(사생활 보호 모드 등): 이번 세션 메모리에만 둔다.
    cache = { raw: JSON.stringify(state), value: state };
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(EVENT, cb);
  };
}

export function updateDemo(fn: (s: DemoState) => DemoState) {
  const cur = read() ?? createDemoState(new Date());
  write(syncAlerts(fn(cur), new Date()));
}

export function resetDemo() {
  write(createDemoState(new Date()));
}

/**
 * 데모 상태 구독. 서버 렌더링과 첫 렌더에서는 null(스켈레톤)을 돌려주고,
 * 브라우저에서만 현재 시각을 읽는다.
 */
export function useDemo(): DemoState | null {
  const state = useSyncExternalStore(subscribe, read, () => null);
  useEffect(() => {
    if (!read()) write(createDemoState(new Date()));
  }, []);
  return state;
}

/** 1분마다 갱신되는 현재 시각. 서버에서는 null. */
export function useNow(): Date | null {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 60_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);
  return now;
}

/** 보호자 화면이 열려 있는 동안 1분마다 알림 조건을 다시 판단한다 (check-alerts 대역). */
export function useAlertSync(now: Date | null) {
  const sync = useCallback(() => {
    const cur = read();
    if (!cur) return;
    const next = syncAlerts(cur, new Date());
    if (next !== cur) write(next);
  }, []);
  useEffect(() => {
    if (now) sync();
  }, [now, sync]);
}
