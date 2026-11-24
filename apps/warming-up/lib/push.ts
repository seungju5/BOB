"use client";

import { useEffect } from "react";
import { alertUrl } from "@/lib/alerts/copy";
import type { AppView } from "@/lib/data/view";
import { permissionState, pushOwner, requestNotificationWorker, saveDevicePreference, showNewNotices, useEnabledSince, usePushState } from "./push-device";

export async function enablePush(mode: "live" | "demo" | null, owner: string | null) {
  if (mode !== "live" || !owner) return "unsupported";
  const worker = await requestNotificationWorker();
  if (worker) saveDevicePreference(owner, true);
  return permissionState();
}

export async function disablePush(owner: string) {
  saveDevicePreference(owner, false);
}

export function useAlertNotifications(view: AppView | null, accountKey?: string) {
  const owner = pushOwner(accountKey);
  const since = useEnabledSince(owner);
  const permission = usePushState();
  useEffect(() => {
    if (!owner || !since || permission !== "granted" || view?.mode !== "live" ||
        view.dataSource !== "firebase" || !view.seniorConsent) return;
    const notices = view.alerts.filter(a => !a.acknowledgedAt && !a.resolvedAt)
      .map(a => ({id: a.id, at: a.triggeredAt, url: alertUrl(a.type)}));
    const signal = view.plug.powerNoticeAt;
    if (view.plug.status === "connected" && view.plug.isVirtual !== true && signal) {
      notices.push({id: `cooker-${signal}`, at: signal, url: "/alerts"});
    }
    let active = true;
    void showNewNotices(owner, notices, () => active).catch(() => {});
    return () => { active = false; };
  }, [view, owner, since, permission]);
}
