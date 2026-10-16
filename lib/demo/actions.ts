"use client";

import type { AppActions } from "@/lib/data/view";
import { updateDemo } from "./store";

const nowIso = () => new Date().toISOString();
const ok = async () => {};

export const demoActions: AppActions = {
  saveOnboarding: async (step, patch = {}) => updateDemo((s) => ({ ...s, ...patch, onboardingStep: step })),
  registerPlug: async (deviceId) => {
    updateDemo((s) => ({ ...s, plug: { deviceId, online: true, offlineSince: null } }));
    return { watts: 45 };
  },
  skipPlug: async () => updateDemo((s) => ({ ...s, plug: { deviceId: "demo-plug-01", online: true, offlineSince: null } })),
  issuePairingCode: ok,
  ackAlert: async (id) => updateDemo((s) => ({ ...s, alerts: s.alerts.map((a) => (a.id === id ? { ...a, acknowledgedAt: nowIso() } : a)) })),
  ackAll: async () => updateDemo((s) => ({ ...s, alerts: s.alerts.map((a) => (a.acknowledgedAt ? a : { ...a, acknowledgedAt: nowIso() })) })),
  saveAlertSettings: async (alertSettings) => updateDemo((s) => ({ ...s, alertSettings })),
  saveWindows: async (windows) => updateDemo((s) => ({ ...s, mealProfile: { ...s.mealProfile, windows } })),
  saveSenior: async (senior) => updateDemo((s) => ({ ...s, senior: { ...s.senior, ...senior } })),
  addAbsence: async (a) => updateDemo((s) => ({ ...s, absences: [...s.absences, a] })),
  removeAbsence: async (a) =>
    updateDemo((s) => {
      const i = s.absences.findIndex((x) => x.startDate === a.startDate && x.endDate === a.endDate);
      return { ...s, absences: s.absences.filter((_, j) => j !== i) };
    }),
};
