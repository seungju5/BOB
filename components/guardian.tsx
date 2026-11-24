// 보호자 화면 공통 조각

import Link from "next/link";
import type { AlertType, MealStatus } from "@/lib/judge/types";
import { IconChart, IconCheck, IconClock, IconPhone, IconSuitcase, IconUtensils } from "./icons";

export const STATUS_META: Record<MealStatus, { label: string; className: string }> = {
  confirmed: { label: "확인됨", className: "bg-sage text-sage-deep" },
  eat_out: { label: "외식", className: "bg-butter text-cocoa" },
  away: { label: "부재", className: "bg-sky text-sky-deep" },
  unconfirmed: { label: "미확인", className: "bg-neutral-300 text-neutral-800" },
  pending: { label: "대기 중", className: "bg-white text-muted/60 ring-1 ring-inset ring-line" },
};

export function StatusIcon({ status, className = "h-4 w-4" }: { status: MealStatus; className?: string }) {
  if (status === "confirmed") return <IconCheck className={className} />;
  if (status === "eat_out") return <IconUtensils className={className} />;
  if (status === "away") return <IconSuitcase className={className} />;
  if (status === "unconfirmed") return <span aria-hidden className={`inline-grid shrink-0 place-items-center ${className}`}><span className="w-2/3 border-t-2 border-current" /></span>;
  return <IconClock className={className} />;
}

/** 알림 문구는 푸시와 같이 쓰려고 lib/alerts/copy.ts에 둔다 */
export { alertCopy, alertUrl } from "@/lib/alerts/copy";

export const ALERT_TONE: Record<AlertType, string> = {
  missed_meals: "bg-butter-soft",
  fasting: "bg-butter-soft",
  emergency: "bg-blush",
  help_request: "bg-blush",
  device_offline: "bg-sky",
  eat_out: "bg-butter-soft",
  away: "bg-sky",
  weekly_report: "bg-sage",
};

export const ALERT_PRIORITY: AlertType[] = ["help_request", "emergency", "fasting", "missed_meals", "device_offline", "eat_out", "away", "weekly_report"];

/** 알림 카드 아래 바로가기: 외식·도움 요청은 전화, 주간 리포트는 리포트 화면 */
export function hasAlertCall(type: AlertType | undefined, phone: string) {
  return Boolean(phone) && (type === "eat_out" || type === "help_request");
}

export function AlertShortcut({ type, relation, phone }: { type: AlertType; relation: string; phone: string }) {
  const pill = "flex min-h-12 items-center gap-1.5 rounded-full border border-cocoa/20 bg-paper px-4 text-[16px] font-bold text-cocoa";
  if (hasAlertCall(type, phone))
    return (
      <a href={`tel:${phone.replace(/(?!^\+)\D/g, "")}`} className={pill}>
        <IconPhone className="h-4 w-4" />
        {relation}께 전화하기
      </a>
    );
  if (type === "weekly_report")
    return (
      <Link href="/report" className={pill}>
        <IconChart className="h-4 w-4" />
        리포트 보기
      </Link>
    );
  return null;
}

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
