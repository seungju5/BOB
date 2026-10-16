// GENERATED from lib/data/view.ts. Run npm run sync:firebase at repository root.
// 화면이 읽는 공통 모양. 데모(localStorage)와 실서비스(Supabase) 모두 이 모양으로 바꿔서 넘긴다.
// 가족 화면에 필요한 요약만 담는다: 끼니 상태, 날짜별 횟수, 마지막 시각. (취사 시각 목록은 없음)
import { resolveMealSlots } from "../judge/resolveMealSlots.mjs";
import { addDays, kstDate } from "../judge/time.mjs";
export const DEFAULT_WINDOWS = [
    { slot: "breakfast", start: "06:00", end: "10:00" },
    { slot: "lunch", start: "11:00", end: "14:30" },
    { slot: "dinner", start: "17:00", end: "21:00" },
];
export const SLOT_LABEL = { breakfast: "아침", lunch: "점심", dinner: "저녁" };
const ORDER = { breakfast: 0, lunch: 1, dinner: 2 };
/** 하루치 끼니. 아직 서버 판정이 없는 오늘은 시간대 기준으로 채운다. */
export function slotsForDate(v, date, now) {
    const found = v.slots.filter((s) => s.date === date).sort((a, b) => ORDER[a.slot] - ORDER[b.slot]);
    if (found.length || date !== kstDate(now))
        return found;
    return resolveMealSlots({ date, windows: v.mealProfile.windows, events: [], eatOutChecks: [], absences: v.absences, now });
}
export function recentSlots(v, now, days) {
    const today = kstDate(now);
    const out = [];
    for (let d = days - 1; d >= 0; d--)
        out.push(...slotsForDate(v, addDays(today, -d), now));
    return out;
}
export function statsRange(v, from, to) {
    const out = {};
    for (let d = from; d <= to; d = addDays(d, 1))
        out[d] = v.stats[d] ?? { cook: 0, lid: 0 };
    return out;
}
export const unackedAlerts = (v) => v.alerts.filter((a) => !a.resolvedAt && !a.acknowledgedAt);
/** 패턴 변화 리포트: 최근 7일 vs 그 전 28일 끼니 확인율 (어제까지) */
export function patternReport(v, now) {
    const today = kstDate(now);
    const rate = (fromDay, toDay) => {
        let ok = 0;
        let total = 0;
        for (let d = fromDay; d <= toDay; d++) {
            for (const slot of slotsForDate(v, addDays(today, -d), now)) {
                if (slot.status === "away" || slot.status === "pending")
                    continue;
                total++;
                if (slot.status === "confirmed" || slot.status === "eat_out")
                    ok++;
            }
        }
        return { ok, total, rate: total ? ok / total : null };
    };
    return { recent: rate(1, 7), before: rate(8, 35) };
}
