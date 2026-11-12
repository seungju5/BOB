// GENERATED from lib/judge/time.ts. Run npm run sync:firebase at repository root.
// 판정은 KST(UTC+9, 서머타임 없음) 기준, 저장은 UTC Date.
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
export const MINUTE_MS = 60 * 1000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;
/** UTC Date → KST 날짜 문자열 'YYYY-MM-DD' */
export function kstDate(d) {
    return new Date(d.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}
/** KST 날짜 + 'HH:MM' → UTC Date */
export function kstDateTime(date, hhmm) {
    const [y, m, d] = date.split("-").map(Number);
    const [hh, mm] = hhmm.split(":").map(Number);
    return new Date(Date.UTC(y, m - 1, d, hh, mm) - KST_OFFSET_MS);
}
/** KST 기준 'HH:MM' */
export function kstTime(d) {
    return new Date(d.getTime() + KST_OFFSET_MS).toISOString().slice(11, 16);
}
/** KST 날짜에 n일 더하기 */
export function addDays(date, n) {
    const [y, m, d] = date.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
