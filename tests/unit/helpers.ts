import type { PowerReading } from "@/lib/judge/types";
import { kstDateTime, MINUTE_MS } from "@/lib/judge/time";

/** [watts, minutes] 구간들을 1분 간격 전력값으로 펼친다. start는 KST 'YYYY-MM-DD HH:MM'. */
export function series(start: string, segments: Array<[number, number]>): PowerReading[] {
  const [date, hhmm] = start.split(" ");
  let t = kstDateTime(date, hhmm).getTime();
  const out: PowerReading[] = [];
  for (const [watts, minutes] of segments) {
    for (let i = 0; i < minutes; i++) {
      out.push({ measuredAt: new Date(t), watts });
      t += MINUTE_MS;
    }
  }
  return out;
}

/** KST 'YYYY-MM-DD HH:MM' → Date */
export function at(s: string): Date {
  const [date, hhmm] = s.split(" ");
  return kstDateTime(date, hhmm);
}
