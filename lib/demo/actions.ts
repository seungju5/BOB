"use client";

import type { AppActions } from "@/lib/data/view";
import { updateDemo } from "./store";
import { assertOnboardingConsent } from "@/lib/data/consent";

const nowIso = () => new Date().toISOString();
const ok = async () => {};

export const demoActions: AppActions = {
  saveOnboarding: async (step, patch = {}) => updateDemo((s) => {
    assertOnboardingConsent(s, step, patch);
    return { ...s, ...patch, onboardingStep: s.onboardingStep >= 8 ? 8 : step };
  }),
  registerPlug: async (deviceId) => {
    updateDemo((s) => {
      if (!s.seniorConsent) throw new Error("기기를 연결하기 전에 어르신의 동의를 확인해 주세요.");
      return { ...s, plug: { deviceId, online: true, offlineSince: null } };
    });
    return { connected: true, checkedAt: nowIso() };
  },
  skipPlug: ok,
  issuePairingCode: async () => updateDemo((s) => {
    if (!s.seniorConsent) throw new Error("연결하기 전에 어르신의 동의를 확인해 주세요.");
    return s;
  }),
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
