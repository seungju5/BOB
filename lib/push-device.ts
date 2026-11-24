"use client";

import { useSyncExternalStore } from "react";
import { appPath } from "@/lib/app-path";

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

export function pushOwner(accountKey?: string) {
  // Firebase adds a render revision to the UID. Supabase supplies the bare UID.
  const owner = accountKey?.replace(/:\d+$/, "");
  return owner && owner !== "signed-out" && owner !== "demo" ? owner : null;
}

const prefKey = (owner: string) => storagePrefix + owner;
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
  window.dispatchEvent(new Event(eventName));
}

export async function requestNotificationWorker() {
  const state = permissionState();
  if (state !== "default" && state !== "granted") return null;
  // Ask inside the user's click, before awaiting any server or service-worker work.
  if (state === "default" && await Notification.requestPermission() !== "granted") {
    window.dispatchEvent(new Event(eventName));
    return null;
  }
  await navigator.serviceWorker.register(appPath("/sw.js"), {scope: appPath("/")});
  return navigator.serviceWorker.ready;
}

export type DeviceNotice = { id: string; at: string; url: string };

export async function showNewNotices(owner: string, notices: DeviceNotice[], active: () => boolean) {
  const since = enabledSince(owner);
  if (!since || permissionState() !== "granted") return;
  const key = prefKey(owner) + ".seen";
  let seen: string[] = [];
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    if (Array.isArray(stored)) seen = stored.filter((id): id is string => typeof id === "string");
  } catch { /* Start a fresh list if older browser data is missing. */ }
  const now = Date.now();
  const pending = notices.filter(({id, at}) => {
    const time = Date.parse(at);
    return time > since && time <= now && !seen.includes(id);
  });
  if (!pending.length) return;
  const worker = await navigator.serviceWorker.getRegistration(appPath("/"));
  if (!worker) return;
  for (const notice of pending) {
    if (!active() || enabledSince(owner) !== since || permissionState() !== "granted") return;
    await worker.showNotification("밥뭇나", {
      body: "워밍이가 새 소식을 가져왔어요. 앱에서 확인해 주세요.",
      tag: notice.id, icon: appPath("/icon.svg"), data: {url: appPath(notice.url)},
    });
    seen.push(notice.id);
    localStorage.setItem(key, JSON.stringify(seen.slice(-200)));
  }
}
