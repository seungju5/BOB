"use client";

import { useEffect, useState } from "react";
import type { AppView } from "@/lib/data/view";
import { checkBackgroundPush, disableBackgroundPush, enableBackgroundPush } from "./notification-transport";
import {
  clearFeaturePreview, listenForPushChanges, notifyPushChange, permissionState, pushOwner, requestNotificationWorker,
  saveDevicePreference, showNewNotices, useEnabledSince, usePushState, type DeviceNotice,
} from "./push-device";

export function useDelivery(owner: string | null, consent: boolean) {
  const [saved, setSaved] = useState<{owner: string; status: "background" | "off" | "unavailable" | "unknown"} | null>(null);
  const since = useEnabledSince(owner);
  const permission = usePushState();
  useEffect(() => {
    if (!owner || !consent || (permission !== "granted" && permission !== "default")) return;
    let active = true;
    let generation = 0;
    async function refresh() {
      const request = ++generation;
      const status = await checkBackgroundPush(owner!).catch(() => "unknown" as const);
      if (active && generation === request) setSaved({owner: owner!, status});
    }
    void refresh();
    const stop = listenForPushChanges(refresh);
    return () => { active = false; stop(); };
  }, [owner, consent, permission, since]);
  if (owner && consent && saved?.owner === owner) return saved.status;
  return "unavailable";
}

export async function enablePush(mode: "live" | "demo" | null, owner: string | null) {
  if (mode !== "live" || !owner) return "unsupported";
  const worker = await requestNotificationWorker();
  if (worker) {
    const registered = worker.pushManager && await enableBackgroundPush(owner, worker);
    try { saveDevicePreference(owner, true); } catch (e) {
      if (registered) await disableBackgroundPush(owner);
      throw e;
    }
  }
  return permissionState();
}

export async function disablePush(owner: string) {
  try { saveDevicePreference(owner, false); }
  finally {
    try { await Promise.all([clearFeaturePreview(owner), disableBackgroundPush(owner)]); }
    finally { notifyPushChange(); }
  }
}

export function useAlertNotifications(view: AppView | null, accountKey?: string) {
  const owner = pushOwner(accountKey);
  const since = useEnabledSince(owner);
  const permission = usePushState();
  const delivery = useDelivery(owner, Boolean(since && view?.mode === "live" && view.seniorConsent));
  useEffect(() => {
    if (!owner || !since || permission !== "granted" || view?.mode !== "live" ||
        view.dataSource !== "firebase" || !view.seniorConsent) return;
    const notices: DeviceNotice[] = view.alerts.filter(a => !a.acknowledgedAt && !a.resolvedAt)
      .map(a => ({id: a.id, at: a.triggeredAt, kind: a.type, date: a.payload?.meal?.date}));
    const signal = view.plug.powerNoticeAt;
    if (delivery !== "background" && view.plug.status === "connected" && view.plug.isVirtual === false && signal) {
      notices.push({id: "cooker-" + signal, at: signal, kind: "cooker_signal"});
    }
    let active = true;
    void showNewNotices(owner, notices, () => active).catch(() => {});
    return () => { active = false; };
  }, [view, owner, since, permission, delivery]);
}
