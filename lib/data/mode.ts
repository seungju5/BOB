"use client";

import { useSyncExternalStore } from "react";

// 실제 계정과 이 브라우저의 체험 기록을 구분한다.
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
