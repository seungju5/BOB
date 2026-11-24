import { addDays } from "@/lib/judge/time";

export type RecordRange = "day" | "week" | "month";

export interface RecordSelection {
  range: RecordRange;
  date: string | null; // null follows the current KST date, including after midnight.
  openedFrom?: "week" | "month";
}

type RecordAction =
  | { type: "range"; range: RecordRange }
  | { type: "day"; date: string }
  | { type: "today" }
  | { type: "overview" }
  | { type: "move"; direction: -1 | 1; today: string };

export function navigateRecords(current: RecordSelection, action: RecordAction): RecordSelection {
  switch (action.type) {
    case "today":
      return { range: "day", date: null };
    case "day":
      return { range: "day", date: action.date, openedFrom: current.range === "day" ? current.openedFrom : current.range };
    case "overview":
      return current.openedFrom ? { range: current.openedFrom, date: current.date } : current;
    case "range":
      if (current.range === action.range) return current;
      return { range: action.range, date: current.date, openedFrom: action.range === "day" && current.range !== "day" ? current.range : undefined };
    case "move": {
      const date = shiftRecordPeriod(current.date ?? action.today, current.range, action.direction);
      return { ...current, date: date > action.today ? action.today : date };
    }
  }
}

const utcDate = (date: string) => new Date(`${date}T00:00:00Z`);
const dateString = (date: Date) => date.toISOString().slice(0, 10);

/** 로컬 타임존과 무관하게 KST 날짜 문자열로 달력 기간을 계산한다. 주는 월~일. */
export function recordPeriod(anchor: string, range: RecordRange) {
  let from = anchor;
  let to = anchor;
  if (range === "week") {
    const weekday = utcDate(anchor).getUTCDay();
    from = addDays(anchor, -(weekday === 0 ? 6 : weekday - 1));
    to = addDays(from, 6);
  } else if (range === "month") {
    from = `${anchor.slice(0, 7)}-01`;
    const date = utcDate(from);
    to = dateString(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)));
  }
  const dates: string[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) dates.push(date);
  return { from, to, dates };
}

/** 1/31에서 다음 달로 갈 때 3월로 건너뛰지 않도록 그 달 마지막 날에 맞춘다. */
export function shiftRecordPeriod(anchor: string, range: RecordRange, direction: -1 | 1): string {
  if (range !== "month") return addDays(anchor, direction * (range === "week" ? 7 : 1));
  const date = utcDate(anchor);
  const month = date.getUTCMonth() + direction;
  const last = new Date(Date.UTC(date.getUTCFullYear(), month + 1, 0)).getUTCDate();
  return dateString(new Date(Date.UTC(date.getUTCFullYear(), month, Math.min(date.getUTCDate(), last))));
}

/** 달력 머리글은 월요일부터 시작한다. */
export function monthLeadingDays(firstDate: string): number {
  return (utcDate(firstDate).getUTCDay() + 6) % 7;
}
