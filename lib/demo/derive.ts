// 데모 상태 → 화면용 AppView. 판단은 lib/judge의 순수 함수를 그대로 쓴다.

import { evaluateAlerts } from "@/lib/judge/evaluateAlerts";
import { mealWindowsOn, resolveMealSlots } from "@/lib/judge/resolveMealSlots";
import { addDays, kstDate } from "@/lib/judge/time";
import type { CookerEvent, MealSlot } from "@/lib/judge/types";
import { reportSummary, type AppView } from "@/lib/data/view";
import type { DemoState, StoredAlert } from "./state";

const toEvents = (s: DemoState): CookerEvent[] =>
  s.events.map((e) => ({ type: e.type, startedAt: new Date(e.startedAt), endedAt: new Date(e.endedAt) }));

function demoSlots(s: DemoState, date: string, now: Date, events = toEvents(s)): MealSlot[] {
  return resolveMealSlots({
    date,
    windows: mealWindowsOn(date, s.mealProfile.windows, s.mealScheduleHistory),
    events,
    eatOutChecks: s.seniorActions.filter((a) => a.type === "eat_out").map((a) => new Date(a.at)),
    absences: s.absences,
    now,
  });
}

export function lastCookerAt(s: DemoState): Date | null {
  const t = s.events.reduce((m, e) => Math.max(m, Date.parse(e.startedAt)), 0);
  return t ? new Date(t) : null;
}

function lastActivityAt(s: DemoState): Date | null {
  const t = Math.max(lastCookerAt(s)?.getTime() ?? 0, ...s.seniorActions.map((a) => Date.parse(a.at)));
  return t ? new Date(t) : null;
}

function lastReadingAt(s: DemoState, now: Date): Date | null {
  if (!s.plug.deviceId) return null;
  return s.plug.online ? now : s.plug.offlineSince ? new Date(s.plug.offlineSince) : null;
}

export function toView(s: DemoState, now: Date): AppView {
  const today = kstDate(now);
  const events = toEvents(s);
  const slots: MealSlot[] = [];
  const stats: AppView["stats"] = {};
  for (let d = 34; d >= 0; d--) {
    const date = addDays(today, -d);
    slots.push(...demoSlots(s, date, now, events));
    stats[date] = { cook: 0, lid: 0 };
  }
  for (const e of s.events) {
    const d = kstDate(new Date(e.startedAt));
    if (stats[d]) stats[d][e.type === "cook" ? "cook" : "lid"]++;
  }
  return {
    mode: "demo", dataSource: "demo",
    onboardingStep: s.onboardingStep,
    plug: { deviceId: s.plug.deviceId, online: s.plug.online, lastReadingAt: lastReadingAt(s, now)?.toISOString() ?? null },
    senior: s.senior,
    household: s.household,
    mealProfile: s.mealProfile,
    mealScheduleHistory: s.mealScheduleHistory,
    alertSettings: s.alertSettings,
    seniorConsent: s.seniorConsent,
    pairingCode: s.pairingCode,
    seniorPaired: s.seniorPaired,
    slots,
    stats,
    lastCookerAt: lastCookerAt(s)?.toISOString() ?? null,
    lastActivityAt: lastActivityAt(s)?.toISOString() ?? null,
    absences: s.absences,
    alerts: s.alerts,
  };
}

/** 알림 조건을 다시 판단해 생성·해제한다 (jobs?job=alerts 대역). 바뀐 게 없으면 같은 객체. */
export function syncAlerts(s: DemoState, now: Date): DemoState {
  if (s.onboardingStep <= 7) return s;
  const today = kstDate(now);
  const recent = [2, 1, 0].flatMap((d) => demoSlots(s, addDays(today, -d), now));
  const open = s.alerts.filter((a) => !a.resolvedAt);
  const { create, resolve } = evaluateAlerts({
    now,
    slots: recent,
    lastActivityAt: lastActivityAt(s),
    settings: s.alertSettings,
    absences: s.absences,
    lastReadingAt: lastReadingAt(s, now),
    openAlerts: open.map((a) => a.type),
  });
  const weekly = weeklyReportDue(s, now);
  if (create.length === 0 && resolve.length === 0 && !weekly) return s;
  const iso = now.toISOString();
  const alerts: StoredAlert[] = s.alerts.map((a) => (!a.resolvedAt && resolve.includes(a.type) ? { ...a, resolvedAt: iso } : a));
  for (const type of create) alerts.push({ id: `${type}-${now.getTime()}`, type, triggeredAt: iso, acknowledgedAt: null, resolvedAt: null });
  if (weekly) alerts.push({ id: `weekly_report-${now.getTime()}`, type: "weekly_report", triggeredAt: iso, acknowledgedAt: null, resolvedAt: null, payload: weekly });
  return { ...s, alerts };
}

/**
 * 주간 리포트 소식 (jobs?job=weekly 대역): 지난 7일 이상 발행하지 않았고 비교할 기록이 있으면 한 번.
 * 실서비스는 매주 월요일 09:00 KST에 발행한다.
 */
function weeklyReportDue(s: DemoState, now: Date) {
  const last = s.alerts.filter((a) => a.type === "weekly_report").map((a) => new Date(a.triggeredAt).getTime());
  if (last.length && now.getTime() - Math.max(...last) < 7 * 24 * 60 * 60 * 1000) return null;
  const summary = reportSummary(toView(s, now), now);
  return summary ? { rate: summary.r } : null;
}
