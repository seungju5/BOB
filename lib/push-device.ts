"use client";

import { useSyncExternalStore } from "react";
import { appPath } from "@/lib/app-path";
import {matchesNoticeOwner, noticeCookerReceiptKey, noticeDeliveryKey, noticeText, noticePath, noticePreferenceKey, noticePreferenceCache, noticeTestReceiptKey, scopedNotice} from "@/public/notification-content";

import {isQuietHours, untilQuiet} from "@/server/smartthings/notification-policy.mjs";

export type QuietHours = {start:string; end:string};
const eventName = "bapmunna:device-notifications";
const storagePrefix = "bapmunna.notifications.";
export type PermissionState = NotificationPermission | "install" | "unsupported" | "loading";

export function permissionState(): PermissionState {
  if (typeof window === "undefined") return "loading";
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  const installed = window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & {standalone?: boolean}).standalone;
  if (ios && !installed) return "install";
  if (!("Notification" in window) || !("serviceWorker" in navigator)) return "unsupported";
  return Notification.permission;
}

export function listenForPushChanges(listener: () => void) {
  function storageChanged(event: StorageEvent) {
    if (event.key === null || (event.key.startsWith(storagePrefix) && !event.key.endsWith(".seen"))) listener();
  }
  window.addEventListener(eventName, listener);
  window.addEventListener("focus", listener);
  window.addEventListener("storage", storageChanged);
  return () => {
    window.removeEventListener(eventName, listener);
    window.removeEventListener("focus", listener);
    window.removeEventListener("storage", storageChanged);
  };
}

export function usePushState(): PermissionState {
  return useSyncExternalStore(listenForPushChanges, permissionState, () => "loading");
}

export function notifyPushChange() {
  window.dispatchEvent(new Event(eventName));
}

export function pushOwner(accountKey?: string) {
  // Firebase adds a render revision to the UID. Supabase supplies the bare UID.
  const owner = accountKey?.replace(/:\d+$/, "");
  return owner && owner !== "signed-out" && owner !== "demo" ? owner : null;
}

const prefKey = (owner: string) => storagePrefix + owner;
export function localQuietHours(owner: string): QuietHours | null {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(prefKey(owner) + ".quiet") ?? "null");
    return isQuietHours(saved) ? saved : null;
  } catch { return null; }
}
export function saveQuietHours(owner: string, quiet: QuietHours | null) {
  if (quiet) localStorage.setItem(prefKey(owner) + ".quiet", JSON.stringify(quiet));
  else localStorage.removeItem(prefKey(owner) + ".quiet");
}

export function enabledSince(owner: string | null) {
  if (!owner) return 0;
  try {
    const value = Number(localStorage.getItem(prefKey(owner)));
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch { return 0; }
}

export function useEnabledSince(owner: string | null) {
  return useSyncExternalStore(listenForPushChanges, () => enabledSince(owner), () => 0);
}

export function saveDevicePreference(owner: string, enabled: boolean) {
  if (enabled) {
    if (!enabledSince(owner)) localStorage.setItem(prefKey(owner), String(Date.now()));
  } else {
    localStorage.removeItem(prefKey(owner));
    localStorage.removeItem(prefKey(owner) + ".seen");
  }
  notifyPushChange();
}

export async function requestNotificationWorker() {
  const state = permissionState();
  if (state !== "default" && state !== "granted") return null;
  // Ask inside the user's click, before awaiting any server or service-worker work.
  if (state === "default" && await Notification.requestPermission() !== "granted") {
    notifyPushChange();
    return null;
  }
  await navigator.serviceWorker.register(appPath("/sw.js"), {scope: appPath("/"), updateViaCache: "none"});
  return navigator.serviceWorker.ready;
}

export type DeviceNotice = { id: string; at: string; kind: string; date?: string; slot?: string };

function previewKey() {
  return noticePreferenceKey(new URL(appPath("/"), window.location.origin));
}

export async function previewOwner(): Promise<string | null> {
  try {
    const saved = await caches.match(previewKey(), {cacheName: noticePreferenceCache});
    return saved ? await saved.text() : null;
  } catch { return null; }
}

export async function setFeaturePreview(owner: string, enabled: boolean) {
  const cache = await caches.open(noticePreferenceCache);
  if (enabled) await cache.put(previewKey(), new Response(owner));
  else if (await previewOwner() === owner) await cache.delete(previewKey());
}

export async function clearFeaturePreview(owner: string) {
  if (await previewOwner() === owner) await setFeaturePreview(owner, false);
}

export async function syncWorkerDelivery(owner: string, action: "enable" | "disable" | "quiet", quiet = localQuietHours(owner)) {
  if (typeof caches === "undefined") return;
  const base = new URL(appPath("/"), window.location.origin);
  const key = noticeDeliveryKey(base);
  const write = async () => {
    const cache = await caches.open(noticePreferenceCache);
    const saved = await (await cache.match(key))?.json();
    // A delayed settings response or cleanup from a previous user must not
    // reactivate that user or silence the newly enrolled account.
    if (action !== "enable" && saved?.enabled && saved.owner !== owner) return;
    if (action === "quiet" && saved?.enabled === false) return;
    const next = action === "disable" ? {enabled:false} : {enabled:true, owner, quiet};
    await cache.put(key, new Response(JSON.stringify(next), {headers:{"Content-Type":"application/json"}}));
    if (action === "disable" || saved?.owner !== owner)
      await Promise.all([cache.delete(noticeTestReceiptKey(base)), cache.delete(noticeCookerReceiptKey(base))]);
  };
  if (navigator.locks) await navigator.locks.request(key, write);
  else await write();
}

async function deviceReceipt(owner: string, cooker: boolean): Promise<{receivedAt:number; observedAt?:number; openedAt?:number} | null> {
  try {
    const base = new URL(appPath("/"), window.location.origin);
    const cache = await caches.open(noticePreferenceCache);
    const key = cooker ? noticeCookerReceiptKey(base) : noticeTestReceiptKey(base);
    const [policy, receipt] = await Promise.all([cache.match(noticeDeliveryKey(base)), cache.match(key)]);
    const delivery = await policy?.json();
    if (!delivery?.enabled || delivery.owner !== owner) return null;
    const recent = await receipt?.json();
    const at = recent?.receivedAt;
    if (!Number.isSafeInteger(at) || at <= 0 || at > Date.now() || !await matchesNoticeOwner(owner, recent.scope)) return null;
    if (!cooker) return {receivedAt:at};
    const observedAt = recent.observedAt;
    if (!Number.isSafeInteger(observedAt) || observedAt <= 0 || observedAt > at || at - observedAt >= 3600000 || Date.now() - at >= 86400000) return null;
    const openedAt = recent.openedAt;
    return {receivedAt:at, observedAt, ...(Number.isSafeInteger(openedAt) && openedAt >= at && openedAt <= Date.now() && {openedAt})};
  } catch { return null; }
}

export async function lastServerTest(owner: string): Promise<Date | null> {
  const receipt = await deviceReceipt(owner, false);
  return receipt ? new Date(receipt.receivedAt) : null;
}

export function lastCookerPush(owner: string) { return deviceReceipt(owner, true); }

export async function closeOwnerNotices(owner: string) {
  const worker = await navigator.serviceWorker?.getRegistration(appPath("/"));
  if (!worker?.getNotifications) return;
  const notices = await worker.getNotifications();
  await Promise.all(notices.map(async notice => {
    if (await matchesNoticeOwner(owner, notice.data?.scope)) notice.close();
  }));
}

function display(worker: ServiceWorkerRegistration, kind: string, feature: boolean, tag: string, path: string, scope?: string, ticket?: string | null) {
  const text = noticeText(kind, feature, Boolean(ticket));
  return worker.showNotification(text.title, {body: text.body, tag, lang: "ko",
    icon: appPath("/brand/rice-logo.png"), badge: appPath("/brand/notification-badge.png"), data: {url: appPath(path), ...(scope && {scope}), ...(ticket && {ticket})}});
}

/** Delivers only to the device whose user pressed the button. It never registers a subscription. */
export async function testDeviceNotice() {
  const worker = await requestNotificationWorker();
  if (!worker) return false;
  await display(worker, "device_preview", false, "bapmunna-device-test", "/alerts/");
  return true;
}

export async function showNewNotices(owner: string, notices: DeviceNotice[], active: () => boolean, cookerTicket?: (at:string) => Promise<string | null | undefined>) {
  const since = enabledSince(owner);
  if (!since || permissionState() !== "granted") return;
  const key = prefKey(owner) + ".seen";
  let seen: string[] = [];
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    if (Array.isArray(stored)) seen = stored.filter((id): id is string => typeof id === "string");
  } catch { /* Start a fresh list if older browser data is missing. */ }
  const now = Date.now();
  const pending = notices.filter(({id, at, kind}) => {
    const time = Date.parse(at);
    return time > since && time <= now && (kind !== "cooker_signal" || now - time < 3600_000) && !seen.includes(id);
  });
  if (!pending.length) return;
  const worker = await navigator.serviceWorker.getRegistration(appPath("/"));
  if (!worker) return;
  const feature = await previewOwner() === owner;
  for (const notice of pending) {
    if (!active() || enabledSince(owner) !== since || permissionState() !== "granted") return;
    const hours = notice.kind === "cooker_signal" ? localQuietHours(owner) : null;
    if (untilQuiet(Date.parse(notice.at), hours) && untilQuiet(Date.now(), hours)) {
      const scope = await scopedNotice(owner, crypto.randomUUID().replaceAll("-", ""));
      const cooker = notice.kind === "cooker_signal";
      const ticket = cooker ? await cookerTicket?.(notice.at).catch(() => null) : null;
      if (!active() || enabledSince(owner) !== since) return;
      // A local-only device can still announce the signal. An unavailable receipt
      // opens the inbox rather than promising a potentially reassigned meal/date.
      const path = cooker && !ticket ? "/alerts/" : noticePath({...notice, tag: notice.id});
      if (!cooker || untilQuiet(Date.now(), localQuietHours(owner)))
        await display(worker, notice.kind, feature, notice.id, path, scope, ticket);
    }
    seen.push(notice.id);
    localStorage.setItem(key, JSON.stringify(seen.slice(-200)));
  }
}
