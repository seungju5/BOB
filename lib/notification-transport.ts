"use client";

import { TEAM_NOTIFICATION_ORIGIN, TEAM_PROJECT_ID } from "@/config/team";
import { appPath } from "@/lib/app-path";
import { connectFirebase } from "@/lib/firebase/bridge";

import {isQuietHours} from "@/server/smartthings/notification-policy.mjs";
import {localQuietHours, saveQuietHours, syncWorkerDelivery, type QuietHours} from "./push-device";
import {noticeDay, recordNoticePath, validCookerTicket} from "@/public/notification-content";

const prefix = "/api/smartthings/";
type PushState = "background" | "off" | "unavailable";

function serviceURL(path: string) {
  if (!TEAM_NOTIFICATION_ORIGIN) return appPath(prefix + path);
  const pinned = new URL(TEAM_NOTIFICATION_ORIGIN);
  if (pinned.protocol !== "https:" || pinned.origin !== TEAM_NOTIFICATION_ORIGIN)
    throw Error("팀 알림 서버 주소를 확인해 주세요.");
  return new URL(prefix + path, pinned).href;
}

function browserSupportsPush() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
}

async function serverKey(): Promise<string | null> {
  const value = await fetch(serviceURL("config"), { credentials: "omit", cache: "no-store",
    redirect: "error", headers: { Accept: "application/json" }, signal: AbortSignal.timeout(6000) });
  if (!value.ok) throw Error("알림 서버 상태를 확인하지 못했어요.");
  const config = await value.json();
  if (config?.projectId !== TEAM_PROJECT_ID) throw Error("팀 알림 서버를 확인해 주세요.");
  const key = config.webPush?.publicKey;
  return typeof key === "string" && /^B[\w-]{86}$/.test(key) ? key : null;
}

async function call(owner: string, body: Record<string, unknown>, confirmedKey?: string) {
  if (!confirmedKey && !await serverKey()) throw Error("알림 서버 연결을 준비하고 있어요.");
  const provider = await connectFirebase();
  const token = await provider.getIdToken(owner);
  const response = await fetch(serviceURL("notification-subscription"), {
    method: "POST", credentials: "omit", redirect: "error", cache: "no-store", referrerPolicy: "no-referrer",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify(body), signal: AbortSignal.timeout(9000),
  });
  if (!response.ok) {
    if (response.status === 429) throw Error("시험 알림은 1분 뒤에 다시 보낼 수 있어요.");
    if (response.status === 403) throw Error("가구 정보 이용 동의와 로그인 상태를 확인해 주세요.");
    if (response.status === 410) throw Error("알림 연결이 끝났어요. 이 기기에서 다시 켜 주세요.");
    if (response.status === 409) throw Error("이 기기의 알림 연결을 다시 확인해 주세요.");
    throw Error("알림 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.");
  }
  return response.json() as Promise<{registered?: boolean; accepted?: boolean; quietHours?: QuietHours | null;
    ticket?: string | null; target?: {date:string; slot?:string} | null}>;
}

function keyBytes(key: string) {
  return Uint8Array.from(atob(key.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
}

function sameSender(sub: PushSubscription, key: string) {
  const stored = sub.options.applicationServerKey;
  if (!stored) return false;
  const actual = new Uint8Array(stored), expected = keyBytes(key);
  return actual.length === expected.length && actual.every((n, i) => n === expected[i]);
}

async function currentSubscription() {
  return (await navigator.serviceWorker.getRegistration(appPath("/")))?.pushManager?.getSubscription();
}

export async function checkBackgroundPush(owner: string): Promise<PushState> {
  if (!browserSupportsPush()) return "unavailable";
  const key = await serverKey();
  if (!key) return "unavailable";
  const sub = await currentSubscription();
  if (!sub || !sameSender(sub, key)) return "off";
  return (await call(owner, {op: "check", endpoint: sub.endpoint}, key)).registered ? "background" : "off";
}

export async function enableBackgroundPush(owner: string, worker: ServiceWorkerRegistration): Promise<boolean> {
  if (!browserSupportsPush() || !worker.pushManager) return false;
  const key = await serverKey();
  if (!key) return false;
  const provider = await connectFirebase();
  await provider.getIdToken(owner);
  let sub = await worker.pushManager.getSubscription();
  if (sub) {
    if (sameSender(sub, key) && (await call(owner, {op: "check", endpoint: sub.endpoint}, key)).registered) return true;
    if (!await sub.unsubscribe()) throw Error("이전 기기 연결을 해제한 뒤 다시 시도해 주세요.");
  }
  sub = await worker.pushManager.subscribe({userVisibleOnly: true, applicationServerKey: keyBytes(key)});
  try {
    const result = await call(owner, {op: "register", subscription: sub.toJSON()}, key);
    if (!result.registered) throw Error("알림 연결을 확인하지 못했어요.");
    const hours = localQuietHours(owner);
    if (hours) await call(owner, {op: "quiet", endpoint: sub.endpoint, quietHours: hours}, key);
    return true;
  } catch (error) {
    await sub.unsubscribe().catch(() => false);
    throw error;
  }
}

export async function disableBackgroundPush(owner: string) {
  if (!browserSupportsPush()) return;
  const sub = await currentSubscription();
  if (!sub) return;
  // Either the device revocation or deletion of its owner-bound server entry
  // stops delivery, including when sign-out happens without network access.
  const [browser, server] = await Promise.allSettled([
    sub.unsubscribe(), call(owner, {op: "remove", endpoint: sub.endpoint}),
  ]);
  if (browser.status === "fulfilled" && browser.value ||
      server.status === "fulfilled" && server.value.registered === false) return;
  throw Error("알림 연결을 해제하지 못했어요. 기기의 알림 설정을 확인해 주세요.");
}

export async function testBackgroundPush(owner: string) {
  if (!browserSupportsPush()) throw Error("이 기기의 알림을 먼저 켜 주세요.");
  const sub = await currentSubscription();
  if (!sub || !(await call(owner, {op: "test", endpoint: sub.endpoint})).accepted)
    throw Error("이 기기의 알림을 먼저 켜 주세요.");
}

export async function currentCookerTicket(owner: string, at: string) {
  const result = await call(owner, {op:"ticket", at:Date.parse(at)});
  return validCookerTicket(result.ticket) ? result.ticket : null;
}

export async function resolveCookerTicket(owner: string, ticket: string) {
  const result = await call(owner, {op:"resolve", ticket});
  if (result.target === null) return "/alerts/";
  if (!result.target || !noticeDay(result.target.date)) throw Error("밥솥 소식을 확인하지 못했어요.");
  return recordNoticePath(result.target.date, result.target.slot);
}

export async function readBackgroundQuiet(owner: string): Promise<QuietHours | null> {
  const sub = await currentSubscription();
  if (!sub) throw Error("이 기기의 알림을 먼저 켜 주세요.");
  const result = await call(owner, {op: "check", endpoint: sub.endpoint});
  if (!result.registered) throw Error("이 기기의 알림 연결을 확인해 주세요.");
  const hours = isQuietHours(result.quietHours) ? result.quietHours : null;
  saveQuietHours(owner, hours);
  await syncWorkerDelivery(owner, "quiet", hours);
  return hours;
}

export async function setBackgroundQuiet(owner: string, hours: QuietHours | null) {
  if (hours !== null && !isQuietHours(hours)) throw Error("시작과 끝에 서로 다른 시각을 골라 주세요.");
  const sub = await currentSubscription();
  if (!sub) throw Error("이 기기의 알림을 먼저 켜 주세요.");
  const result = await call(owner, {op: "quiet", endpoint: sub.endpoint, quietHours: hours});
  if (!result.registered || result.quietHours?.start !== hours?.start || result.quietHours?.end !== hours?.end)
    throw Error("알림 시간을 저장하지 못했어요.");
  saveQuietHours(owner, hours);
  await syncWorkerDelivery(owner, "quiet", hours);
}
