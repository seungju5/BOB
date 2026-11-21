"use client";

// 앱이 열려 있는 동안 받을 수 있는 휴대폰 알림.
import { useEffect, useSyncExternalStore } from "react";
import { appPath } from "@/lib/app-path";
import { alertCopy, alertUrl } from "@/lib/alerts/copy";
import type { AppView } from "@/lib/data/view";

const SEEN_KEY = "bapmutna.push.seen";
const EVENT = "bapmutna:push";

export type PushState = "unsupported" | "default" | "granted" | "denied";

function readState(): PushState {
  if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator)) return "unsupported";
  return Notification.permission as PushState;
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("focus", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("focus", cb);
  };
}

/** 알림 권한 상태. 서버 렌더링 중에는 'unsupported'. */
export function usePushState(): PushState {
  return useSyncExternalStore(subscribe, readState, () => "unsupported");
}

export async function enablePush(_mode: "demo" | "live" | null, alertIds: string[]): Promise<PushState> {
  if (readState() === "unsupported") return "unsupported";
  const permission = await Notification.requestPermission();
  window.dispatchEvent(new Event(EVENT));
  if (permission !== "granted") return permission as PushState;

  await navigator.serviceWorker.register(appPath("/sw.js"), { scope: appPath("/") });
  // 지금 있는 알림은 이미 본 것으로 두어, 켜자마자 알림이 쏟아지지 않게 한다
  markSeen(alertIds);

  return "granted";
}

function readSeen(): string[] {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]");
  } catch {
    return [];
  }
}
function markSeen(ids: string[]) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...new Set([...readSeen(), ...ids])].slice(-200)));
  } catch {
    // 저장소를 못 쓰면 이번만
  }
}

/**
 * 앱이 열려 있는 동안 새 알림을 휴대폰 알림으로 띄운다.
 * 서버 푸시와 같은 tag(알림 id)를 써서, 둘 다 와도 한 번만 보인다.
 */
export function useAlertNotifications(view: AppView | null) {
  const state = usePushState();
  useEffect(() => {
    if (!view || state !== "granted") return;
    const seen = new Set(readSeen());
    const fresh = view.alerts.filter((a) => !a.acknowledgedAt && !a.resolvedAt && !seen.has(a.id));
    if (!fresh.length) return;
    markSeen(fresh.map((a) => a.id));
    void navigator.serviceWorker.getRegistration(appPath("/")).then((reg) => {
      for (const a of fresh) {
        const copy = alertCopy(a.type, view.senior.relation, {
          missed: view.alertSettings.missedMealsThreshold,
          fasting: view.alertSettings.fastingHours,
          emergency: view.alertSettings.emergencyHours,
          plugRegistered: !!view.plug.deviceId,
          payload: a.payload,
        });
        const options = { body: copy.body, tag: a.id, icon: appPath("/icon.svg"), data: { url: appPath(alertUrl(a.type)) } };
        if (reg) void reg.showNotification(copy.title, options);
        else new Notification(copy.title, options);
      }
    });
  }, [view, state]);
}
