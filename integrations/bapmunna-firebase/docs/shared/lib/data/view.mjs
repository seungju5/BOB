// GENERATED from lib/data/view.ts. Run npm run sync:firebase at repository root.
// 화면이 읽는 공통 모양. 데모(localStorage)와 실서비스(Supabase) 모두 이 모양으로 바꿔서 넘긴다.
// 가족 화면에 필요한 요약만 담는다: 끼니 상태, 날짜별 횟수, 마지막 시각. (취사 시각 목록은 없음)
import { resolveMealSlots } from "../judge/resolveMealSlots.mjs";
import { addDays, kstDate } from "../judge/time.mjs";
/** 기존 저장 번호를 유지한다. 1·2번 기기 단계는 이제 홈 이후의 선택 기능이다. */
export const ONBOARDING_COMPLETE = 8;
export const HOUSEHOLD_STEP = 3;
export function visibleOnboardingStep(savedStep) {
    return Number.isInteger(savedStep) && savedStep >= HOUSEHOLD_STEP ? Math.min(savedStep, ONBOARDING_COMPLETE) : HOUSEHOLD_STEP;
}
export function guardianStartPath(savedStep) {
    if (savedStep >= ONBOARDING_COMPLETE)
        return "/home";
    return savedStep >= HOUSEHOLD_STEP ? "/onboarding" : "/tutorial";
}
export function tutorialExitPath(savedStep) {
    return savedStep >= ONBOARDING_COMPLETE ? "/home" : "/onboarding";
}
export const DEFAULT_WINDOWS = [
    { slot: "breakfast", start: "06:00", end: "10:00" },
    { slot: "lunch", start: "11:00", end: "14:30" },
    { slot: "dinner", start: "17:00", end: "21:00" },
];
/** 네 끼를 새로 선택할 때만 쓰는 편집 가능한 초기 시간. 기본값은 여전히 세 끼다. */
export const FOUR_MEAL_WINDOWS = [
    ...DEFAULT_WINDOWS,
    { slot: "fourth", start: "21:00", end: "23:00" },
];
export { SLOT_LABEL, mealSlotLabel } from "./senior-schedule.mjs";
/** 1·2끼 기존 저장 ID를 유지한다. 표시 순서는 mealSlotLabel로 정한다. */
export function mealSlotsForCount(count) {
    if (count === 1)
        return ["lunch"];
    if (count === 2)
        return ["breakfast", "dinner"];
    if (count === 4)
        return ["breakfast", "lunch", "dinner", "fourth"];
    return ["breakfast", "lunch", "dinner"];
}
/** A paired phone can report an outing before the cooker is connected. */
export function familyPairingAvailable(view) {
    return view.dataSource === "supabase" || careDataAvailable(view);
}
/** Only a recent opted-in signal from the selected physical meter is a guardian notice. */
export function recentPowerNotice(view, now) {
    const { meterKind, powerNoticeEnabled, observingSince, lastPowerNoticeAt } = view.plug;
    if (view.mode !== "live" || !view.seniorConsent || !powerNoticeEnabled || meterKind !== "recognized" || !observingSince || !lastPowerNoticeAt)
        return null;
    const notice = Date.parse(lastPowerNoticeAt);
    const age = now.getTime() - notice;
    return notice >= Date.parse(observingSince) && age >= 0 && age < 24 * 60 * 60_000 ? lastPowerNoticeAt : null;
}
/** 실제 가족 데이터가 아직 연결되지 않았다면 미확인을 새로 판정하지 않는다. */
export function careDataAvailable(v) {
    return v.careAvailable ?? (v.dataSource !== "firebase");
}
const ORDER = { breakfast: 0, lunch: 1, dinner: 2, fourth: 3 };
/** 하루치 끼니. 아직 서버 판정이 없는 오늘은 시간대 기준으로 채운다. */
export function slotsForDate(v, date, now) {
    const found = v.slots.filter((s) => s.date === date).sort((a, b) => ORDER[a.slot] - ORDER[b.slot]);
    if (found.length || date !== kstDate(now))
        return found;
    if (!careDataAvailable(v) || v.dataSource === "supabase")
        return [];
    return resolveMealSlots({ date, windows: v.mealProfile.windows, events: [], eatOutChecks: [], absences: v.absences, now });
}
/** 하루 색은 확인 비율로 정한다. 외식은 확인, 부재는 제외한다. 진행일은 예정된 끼니 수도 보여 준다. */
export function mealDaySummary(v, date, now) {
    const slots = slotsForDate(v, date, now);
    const counted = slots.filter((slot) => slot.status !== "away");
    const ok = counted.filter((slot) => slot.status === "confirmed" || slot.status === "eat_out").length;
    const total = slots.length && date === kstDate(now) ? Math.max(counted.length, v.mealProfile.windows.length - (slots.length - counted.length)) : counted.length;
    if (!slots.length)
        return { tone: "empty", ok, total };
    if (slots.every((slot) => slot.status === "away"))
        return { tone: "away", ok: 0, total: 0 };
    // 오늘 진행 중인 시간대나 아직 수신되지 않은 슬롯이 남으면 완료 비율로 오해하지 않게 한다.
    if (slots.some((slot) => slot.status === "pending") || (date === kstDate(now) && slots.length < v.mealProfile.windows.length)) {
        return { tone: "pending", ok, total };
    }
    return { tone: !total ? "empty" : ok === total ? "all" : ok / total >= 0.5 ? "half" : "low", ok, total };
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
/** 리포트 요약: 홈 카드와 리포트 화면이 같은 문구를 쓰도록. 데이터가 모자라면 null. */
export function reportSummary(v, now) {
    const { recent, before } = patternReport(v, now);
    if (recent.rate === null || before.total < 14)
        return null;
    const r = Math.round(recent.rate * 100);
    const b = Math.round((before.rate ?? 0) * 100);
    const diff = r - b;
    const trend = diff <= -10 ? "down" : diff >= 10 ? "up" : "same";
    const message = trend === "down" ? `평소(${b}%)보다 식사 소식이 줄었어요.` : trend === "up" ? `평소(${b}%)보다 소식이 많아졌어요.` : `평소(${b}%)와 비슷하게 지내고 계세요.`;
    return { recent, before, r, b, trend, message };
}
