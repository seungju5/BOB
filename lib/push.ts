"use client";

import { useEffect, useState } from "react";
import { appPath } from "@/lib/app-path";
import { alertUrl } from "@/lib/alerts/copy";
import type { AppView } from "@/lib/data/view";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import { listenForPushChanges, permissionState, pushOwner, requestNotificationWorker, saveDevicePreference, showNewNotices, useEnabledSince, usePushState } from "./push-device";

const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
export const backgroundAvailable = (source?: AppView["dataSource"]) =>
  source === "supabase" && supabaseConfigured && Boolean(VAPID) && typeof window !== "undefined" && "PushManager" in window;

async function endpointRegistered(owner: string, endpoint: string) {
  const {data, error} = await supabase().from("push_subscriptions")
    .select("id").eq("user_id", owner).eq("endpoint", endpoint).maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

async function currentSubscription() {
  const worker = await navigator.serviceWorker.getRegistration(appPath("/"));
  return (await worker?.pushManager?.getSubscription()) ?? null;
}

export function useDelivery(owner: string | null, source?: AppView["dataSource"]) {
  const since = useEnabledSince(owner);
  const permission = usePushState();
  const checkRemote = backgroundAvailable(source) && permission === "granted" && !!owner;
  const [saved, setSaved] = useState<{owner: string; since: number; result: "on" | "off" | "unknown"} | null>(null);
  useEffect(() => {
    if (!owner || !checkRemote) return;
    let active = true;
    let generation = 0;
    async function refresh() {
      const version = ++generation;
      let result: "on" | "off" | "unknown";
      try {
        const sub = await currentSubscription();
        result = sub && VAPID && currentServerKey(sub, VAPID) && await endpointRegistered(owner!, sub.endpoint) ? "on" : "off";
      } catch { result = "unknown"; }
      if (active && generation === version) setSaved({owner: owner!, since, result});
    }
    void refresh();
    const stop = listenForPushChanges(refresh);
    return () => { active = false; stop(); };
  }, [owner, since, checkRemote]);
  if (checkRemote) {
    if (!saved || saved.owner !== owner || saved.since !== since) return "checking";
    if (saved.result === "on") return "background";
    if (saved.result === "unknown") return "unknown";
  }
  return since ? "foreground" : "off";
}

function publicKeyBytes(key: string) {
  const raw = atob(key.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

function currentServerKey(sub: PushSubscription, expected: string) {
  const stored = sub.options.applicationServerKey;
  if (!stored) return false;
  const actual = new Uint8Array(stored);
  const key = publicKeyBytes(expected);
  return key.length === actual.length && key.every((value, i) => value === actual[i]);
}

export async function enablePush(mode: "live" | "demo" | null, owner: string | null, source?: AppView["dataSource"]) {
  if (mode !== "live" || !owner) return "unsupported";
  const worker = await requestNotificationWorker();
  if (!worker) return permissionState();
  if (!VAPID || !backgroundAvailable(source)) {
    saveDevicePreference(owner, true);
    return permissionState();
  }
  const db = supabase();
  const user = await db.auth.getUser();
  if (user.error || user.data.user?.id !== owner) throw new Error("먼저 다시 로그인해 주세요.");
  let sub = await worker.pushManager.getSubscription();
  if (sub && (!currentServerKey(sub, VAPID) || !await endpointRegistered(owner, sub.endpoint))) {
    // A shared browser can still hold another account's endpoint.
    if (!await sub.unsubscribe()) throw new Error("기기의 이전 알림 연결을 확인해 주세요.");
    sub = null;
  }
  if (!sub) {
    sub = await worker.pushManager.subscribe({userVisibleOnly: true, applicationServerKey: publicKeyBytes(VAPID)});
    try {
      const {endpoint, keys} = sub.toJSON();
      if (!endpoint || !keys?.auth || !keys.p256dh) throw new Error("기기의 알림 주소를 확인해 주세요.");
      const {error} = await db.from("push_subscriptions").upsert({user_id: owner, endpoint, keys}, {onConflict: "endpoint"});
      if (error) throw error;
    } catch (error) {
      await sub.unsubscribe().catch(() => {});
      throw error;
    }
  }
  try {
    saveDevicePreference(owner, true);
  } catch (error) {
    // A newly saved endpoint must not continue sending after enrollment reports failure.
    await retireSubscription(owner);
    throw error;
  }
  return permissionState();
}

async function retireSubscription(owner: string) {
  const sub = await currentSubscription();
  if (!sub) return;
  // Either an inactive endpoint or removal from this account's sender list stops delivery.
  const stopped = await sub.unsubscribe().catch(() => false);
  try {
    const {error} = await supabase().from("push_subscriptions").delete().eq("user_id", owner).eq("endpoint", sub.endpoint);
    if (error) throw error;
  } catch (error) {
    if (!stopped) throw error;
  }
}

export async function disablePush(owner: string, source?: AppView["dataSource"]) {
  try {
    if (source === "supabase" && "serviceWorker" in navigator) await retireSubscription(owner);
  } finally {
    saveDevicePreference(owner, false);
  }
}

/** Revoke this device before the session disappears. Other devices retain their subscriptions. */
export async function signOutWithNotifications(scope: "local" | "global", knownOwner?: string) {
  const db = supabase();
  try {
    const owner = knownOwner ?? (await db.auth.getSession()).data.session?.user.id;
    if (owner) await disablePush(owner, "supabase");
  } catch {
    // Removing this notifications-only worker retires the endpoint if both ordinary
    // browser unsubscribe and the account's server cleanup were unavailable.
    if ("serviceWorker" in navigator) {
      await navigator.serviceWorker.getRegistration(appPath("/")).then(r => r?.unregister()).catch(() => {});
    }
  }
  const {error} = await db.auth.signOut({scope});
  if (error) throw error;
}

export function useAlertNotifications(view: AppView | null, accountKey?: string) {
  const owner = pushOwner(accountKey);
  const since = useEnabledSince(owner);
  const permission = usePushState();
  useEffect(() => {
    if (!owner || !since || permission !== "granted" || view?.mode !== "live" ||
        (view.dataSource !== "supabase" && view.dataSource !== "firebase") || !view.seniorConsent) return;
    const notices = view.alerts.filter(a => !a.acknowledgedAt && !a.resolvedAt)
      .map(a => ({id: a.id, at: a.triggeredAt, url: alertUrl(a.type)}));
    let active = true;
    void showNewNotices(owner, notices, () => active).catch(() => {});
    return () => { active = false; };
  }, [view, owner, since, permission]);
}
