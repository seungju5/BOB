// GENERATED from lib/data/senior-schedule.ts. Run npm run sync:firebase at repository root.
import { addDays, kstDate, kstDateTime } from "../judge/time.mjs";
export const SLOT_LABEL = { breakfast: "첫 끼", lunch: "두 끼", dinner: "세 끼", fourth: "네 끼" };
const ORDINAL_LABELS = ["첫 끼", "두 끼", "세 끼", "네 끼"];
export function mealSlotLabel(slot, windows) {
    const index = windows.findIndex((window) => window.slot === slot);
    return ORDINAL_LABELS[index] ?? SLOT_LABEL[slot];
}
export function mealRecordTime(date, window, now) {
    const start = kstDateTime(date, window.start).getTime();
    const end = kstDateTime(date, window.end).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end || start > now.getTime())
        return null;
    return new Date(Math.min(now.getTime(), start + (end - start) / 2));
}
export function resolveMealChoice(choice, windows, now) {
    if (typeof choice !== "object" || choice === null || !("date" in choice) || !("slot" in choice))
        return null;
    const today = kstDate(now);
    if (choice.date !== today && choice.date !== addDays(today, -1))
        return null;
    const selected = windows.find((window) => window.slot === choice.slot);
    const at = selected && mealRecordTime(choice.date, selected, now);
    if (!at || !selected)
        return null;
    return { at, date: choice.date, slot: selected.slot, label: mealSlotLabel(selected.slot, windows) };
}
