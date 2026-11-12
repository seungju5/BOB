"use client";

// 휴대폰 알림 (Web Push).
// - 알림 권한을 받고 서비스 워커(public/sw.js)를 등록한다.
// - 실서비스: VAPID 공개키(NEXT_PUBLIC_VAPID_PUBLIC_KEY)가 있으면 구독을 push_subscriptions에 저장해,
//   앱을 닫아 둬도 서버(Edge Function)가 보낸 알림을 받는다.
// - 데모·키 없음: 앱이 열려 있는 동안 새 알림을 휴대폰 알림으로 띄운다 (useAlertNotifications).
// iPhone은 홈 화면에 추가한 앱에서만 알림을 받을 수 있다 (iOS 16.4+).

import { useEffect, useSyncExternalStore } from "react";
import { appPath } from "@/lib/app-path";
import { alertCopy, alertUrl } from "@/lib/alerts/copy";
import type { AppView } from "@/lib/data/view";
import { supabase, supabaseConfigured } from "@/lib/supabase";

const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
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

function base64ToBytes(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** 알림 켜기: 권한 요청 → 서비스 워커 등록 → (실서비스+키 있으면) 서버 구독 저장 */
export async function enablePush(mode: "demo" | "live" | null, alertIds: string[]): Promise<PushState> {
  if (readState() === "unsupported") return "unsupported";
  const permission = await Notification.requestPermission();
  window.dispatchEvent(new Event(EVENT));
  if (permission !== "granted") return permission as PushState;

  const reg = await navigator.serviceWorker.register(appPath("/sw.js"), { scope: appPath("/") });
  // 지금 있는 알림은 이미 본 것으로 두어, 켜자마자 알림이 쏟아지지 않게 한다
  markSeen(alertIds);

  if (mode === "live" && supabaseConfigured && VAPID) {
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64ToBytes(VAPID) }));
    const json = sub.toJSON();
    const { data } = await supabase().auth.getUser();
    if (data.user && json.endpoint && json.keys) {
      await supabase().from("push_subscriptions").upsert({ user_id: data.user.id, endpoint: json.endpoint, keys: json.keys }, { onConflict: "endpoint" });
    }
  }
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
