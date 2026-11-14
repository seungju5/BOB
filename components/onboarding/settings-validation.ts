import { kstDate, kstTime } from "@/lib/judge/time";
import type { AppView } from "@/lib/data/view";

/** 전화번호는 선택 사항이다. 국내·국제 번호의 구분기호는 허용한다. */
export function seniorDetailsProblems(senior: AppView["senior"]) {
  const name = senior.name.trim();
  const relation = senior.relation.trim();
  const phone = senior.phone.trim();
  const digits = phone.replace(/\D/g, "");
  return {
    relation: relation.length >= 1 && relation.length <= 30 ? null : "부르는 호칭을 한 가지 골라 30자 이내로 입력해 주세요.",
    name: name.length >= 1 && name.length <= 30 ? null : "대표자 성함을 1~30자로 입력해 주세요.",
    phone: !phone || (phone.length <= 24 && /^\+?[0-9 ()-]+$/.test(phone) && /^\d{7,15}$/.test(digits)) ? null : "전화번호는 숫자 7~15개, 전체 24자 이내로 입력해 주세요. +는 맨 앞에 한 번만 쓸 수 있어요.",
  };
}

/** 확인된 수신 시각만 표시한다. 누락·잘못된 날짜를 현재 시각으로 대체하지 않는다. */
export function deviceReadingLabel(lastReadingAt: string | null): string {
  if (!lastReadingAt || !Number.isFinite(Date.parse(lastReadingAt))) return "아직 수신한 기록이 없어요.";
  const date = new Date(lastReadingAt);
  return `${kstDate(date)} ${kstTime(date)} (한국 시간·KST)`;
}
