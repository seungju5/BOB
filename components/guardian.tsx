// 보호자 화면 공통 조각

import type { AlertType, MealStatus } from "@/lib/judge/types";
import { IconCheck, IconClock, IconSuitcase, IconUtensils } from "./icons";

export const STATUS_META: Record<MealStatus, { label: string; className: string }> = {
  confirmed: { label: "확인됨", className: "bg-sage text-sage-deep" },
  eat_out: { label: "외식", className: "bg-butter-soft text-cocoa" },
  away: { label: "부재", className: "bg-sky text-sky-deep" },
  unconfirmed: { label: "미확인", className: "bg-blush text-blush-deep" },
  pending: { label: "대기 중", className: "bg-line/60 text-muted" },
};

export function StatusIcon({ status, className = "h-4 w-4" }: { status: MealStatus; className?: string }) {
  if (status === "confirmed") return <IconCheck className={className} />;
  if (status === "eat_out") return <IconUtensils className={className} />;
  if (status === "away") return <IconSuitcase className={className} />;
  return <IconClock className={className} />;
}

/** 알림 문구. "판정"이 아니라 안부를 물을 계기로 쓴다 (CLAUDE.md 금지 항목). */
export function alertCopy(
  type: AlertType,
  relation: string,
  s: { missed: number; fasting: number; emergency: number; plugRegistered?: boolean },
) {
  switch (type) {
    case "missed_meals":
      return { title: `${relation} 식사 소식이 ${s.missed}끼째 없어요`, body: "안부 전화 한 통 어떠세요?" };
    case "fasting":
      return { title: `${s.fasting}시간 넘게 밥솥 소식이 없어요`, body: `${relation}께 한번 연락해 보세요.` };
    case "emergency":
      return { title: `${s.emergency}시간째 소식이 없어요`, body: "지정한 연락처에도 알렸어요. 바로 확인해 주세요." };
    case "help_request":
      return { title: `${relation}께서 도움을 요청하셨어요`, body: "지금 바로 연락해 주세요." };
    case "device_offline":
      if (s.plugRegistered === false)
        return { title: "밥솥 플러그를 연결해 주세요", body: "플러그가 연결되어야 끼니 소식을 전해 드릴 수 있어요. 설정에서 연결할 수 있어요." };
      return { title: "밥솥 플러그 연결이 끊겼어요", body: "와이파이나 플러그 전원을 확인해 주세요. 그동안은 끼니 알림을 보내지 않아요." };
  }
}

export const ALERT_TONE: Record<AlertType, string> = {
  missed_meals: "bg-butter-soft",
  fasting: "bg-butter-soft",
  emergency: "bg-blush",
  help_request: "bg-blush",
  device_offline: "bg-sky",
};

export const ALERT_PRIORITY: AlertType[] = ["help_request", "emergency", "fasting", "missed_meals", "device_offline"];

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];
export function fmtDateLong(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  const wd = WEEKDAY[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${m}월 ${d}일 ${wd}요일`;
}
/** 받침에 따라 '와/과'를 붙인다. 호칭을 직접 입력할 수 있어서 ("이모와", "삼촌과") */
export function withWa(word: string) {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  const batchim = code >= 0 && code <= 11171 && code % 28 !== 0;
  return `${word}${batchim ? "과" : "와"}`;
}

export const fmtMonthDay =(date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
