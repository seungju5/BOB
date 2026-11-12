"use client";

import { useMemo, useSyncExternalStore } from "react";

// 계정 전환용: 이 기기에서 로그인했던 이메일을 최근 순으로 기억한다 (이메일만, 토큰은 저장하지 않는다)
const KEY = "bapmutna.accounts";
const EVENT = "bapmutna:accounts";
const MAX = 3;

function readRaw(): string {
  try {
    return localStorage.getItem(KEY) ?? "[]";
  } catch {
    return "[]";
  }
}

function parse(raw: string): string[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((e): e is string => typeof e === "string").slice(0, MAX) : [];
  } catch {
    return [];
  }
}

function save(list: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    // 저장소를 못 쓰면 기억하지 않는다
  }
  window.dispatchEvent(new Event(EVENT));
}

export function rememberAccount(email: string) {
  const e = email.trim().toLowerCase();
  if (e) save([e, ...parse(readRaw()).filter((a) => a !== e)]);
}

export function forgetAccount(email: string) {
  save(parse(readRaw()).filter((a) => a !== email));
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

/** 최근 로그인한 계정 (최대 3개). 서버 렌더링 중에는 빈 목록. */
export function useRecentAccounts(): string[] {
  const raw = useSyncExternalStore(subscribe, readRaw, () => "[]");
  return useMemo(() => parse(raw), [raw]);
}
