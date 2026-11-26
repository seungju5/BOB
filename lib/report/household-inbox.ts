import { useSyncExternalStore } from "react";
import type { AppView, ViewAlert } from "@/lib/data/view";
import { addDays, DAY_MS, kstDate, kstDateTime } from "@/lib/judge/time";

// A week becomes available Monday morning in Seoul. Use only retained household
// observations. A missing day says nothing about a person's meals.
export function householdReportNotices(view: AppView | null, now: Date | null): ViewAlert[] {
  if (!now || !view?.seniorConsent || view.mode !== "live" || view.dataSource !== "firebase" || !view.cookerMealDays) return [];
  const today = kstDate(now);
  const weekday = (new Date(today + "T00:00:00Z").getUTCDay() + 6) % 7;
  let monday = addDays(today, -weekday);
  if (kstDateTime(monday, "09:00") > now) monday = addDays(monday, -7);
  const dates = Object.keys(view.stats);
  const notices: ViewAlert[] = [];
  for (let week = 0; week < 5; week++) {
    const issue = addDays(monday, -7 * week);
    const startDate = addDays(issue, -7);
    const endDate = addDays(issue, -1);
    if (!dates.some(date => date >= startDate && date <= endDate && view.cookerMealDays?.[date])) continue;
    notices.push({ id: "report-" + endDate, type: "weekly_report", triggeredAt: kstDateTime(issue, "09:00").toISOString(),
      acknowledgedAt: null, resolvedAt: null, payload: { startDate, endDate } });
  }
  return notices;
}

// Each retained week has its own cell so two tabs acknowledging different
// reports cannot overwrite each other. Cells are reused after six weeks.
function receiptKey(owner: string, notice: ViewAlert) {
  const week = Math.floor(Date.parse(notice.triggeredAt) / DAY_MS / 7) % 6;
  return "bapmunna.report-read." + owner + "." + week;
}

const changeEvent = "bapmunna:report-read";
function subscribe(update: () => void) {
  const storage = (event: StorageEvent) => {
    if (!event.key || event.key.startsWith("bapmunna.report-read.")) update();
  };
  window.addEventListener("storage", storage);
  window.addEventListener(changeEvent, update);
  return () => { window.removeEventListener("storage", storage); window.removeEventListener(changeEvent, update); };
}

export function useHouseholdReportInbox(owner: string | null, view: AppView | null, now: Date | null) {
  const notices = owner ? householdReportNotices(view, now) : [];
  const markers = useSyncExternalStore(subscribe, () => {
    if (!owner) return "";
    try {
      return notices.map(notice => {
        const value = localStorage.getItem(receiptKey(owner, notice));
        const [id, at] = value?.split("|") ?? [];
        return id === notice.id && Number.isFinite(Date.parse(at)) ? at : "";
      }).join("|");
    } catch { return ""; }
  }, () => "").split("|");
  const alerts = notices.map((notice, i) => ({ ...notice, acknowledgedAt: markers[i] || null }));
  function acknowledge(ids: string[]) {
    if (!owner) return;
    const at = new Date().toISOString();
    try {
      for (const notice of alerts) {
        if (!notice.acknowledgedAt && ids.includes(notice.id)) localStorage.setItem(receiptKey(owner, notice), notice.id + "|" + at);
      }
    } finally { window.dispatchEvent(new Event(changeEvent)); }
  }
  return { alerts, acknowledge };
}
