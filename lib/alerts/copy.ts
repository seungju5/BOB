// 기기와 사용자 행동의 요약을 보호자가 읽는 안부 문구로 바꾼다.
import type { AlertPayload, AlertType } from "../judge/types.ts";
import { addDays, kstDate } from "../judge/time.ts";

/**
 * 주간 리포트 이름 "11월 3주차". 리포트는 발행일 전날까지의 7일을 보므로 전날이 속한 주로 센다.
 * 주는 월요일에 시작하고, 그 주의 목요일이 있는 달의 주차로 센다. (가정: 기준 확정 전)
 */
export function weeklyReportLabel(issuedAt: Date): string {
  const covered = addDays(kstDate(issuedAt), -1);
  const [y, m, d] = covered.split("-").map(Number);
  const weekday = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; // 월요일 0
  const thursday = addDays(covered, 3 - weekday);
  const [, tm, td] = thursday.split("-").map(Number);
  return `${tm}월 ${Math.ceil(td / 7)}주차`;
}

const monthDay = (date: string) => `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일`;

export function alertCopy(
  type: AlertType,
  relation: string,
  s: { missed: number; fasting: number; emergency: number; plugRegistered?: boolean; payload?: AlertPayload; issuedAt?: string },
) {
  switch (type) {
    case "eat_out": {
      const meal = s.payload?.meal;
      if (meal) return { title: `${relation}께서 밖에서 식사하셨어요`, body: `${monthDay(meal.date)} ${meal.label}에 외식하셨다고 알려주셨어요.` };
      return { title: `${relation}께서 밖에서 식사하셨어요`, body: "맛있게 드셨는지 전화로 여쭤보면 어떨까요?" };
    }
    case "away": {
      const end = s.payload?.endDate;
      const start = s.payload?.startDate;
      const until = start && end ? (start === end ? `${monthDay(start)} 하루 ` : `${monthDay(start)}부터 ${monthDay(end)}까지 `)
        : end ? `${monthDay(end)}까지 ` : "";
      return { title: `${relation}께서 ${until}자리를 비우세요`, body: "그동안은 끼니 알림을 쉬어요. 잘 다녀오시라고 인사 건네 보세요." };
    }
    case "weekly_report":
      return {
        title: s.issuedAt ? `${weeklyReportLabel(new Date(s.issuedAt))} 리포트가 발행되었어요` : "주간 리포트가 발행되었어요",
        body: typeof s.payload?.rate === "number" ? `지난 7일 끼니 확인율은 ${s.payload.rate}%예요. 한 주 패턴을 확인해 보세요.` : "지난 한 주 패턴을 확인해 보세요.",
      };
    case "missed_meals":
      return { title: `${relation} 식사 소식이 ${s.missed}끼째 없어요`, body: "안부 전화 한 통 어떠세요?" };
    case "fasting":
      return { title: `${s.fasting}시간 넘게 밥솥 소식이 없어요`, body: `${relation}께 한번 연락해 보세요.` };
    case "emergency":
      return { title: `${s.emergency}시간째 소식이 없어요`, body: "지금 직접 연락해 안부를 확인해 주세요." };
    case "help_request":
      return { title: `${relation}께서 도움을 요청하셨어요`, body: "지금 바로 연락해 주세요." };
    case "device_offline":
      if (s.plugRegistered === false)
        return { title: "밥솥 플러그를 연결해 주세요", body: "플러그가 연결되어야 끼니 소식을 전해 드릴 수 있어요. 설정에서 연결할 수 있어요." };
      return { title: "밥솥 플러그 연결이 끊겼어요", body: "와이파이나 플러그 전원을 확인해 주세요. 그동안은 끼니 알림을 보내지 않아요." };
  }
}

/** 알림을 눌렀을 때 열 화면 */
export const alertUrl = (type: AlertType) => (type === "weekly_report" ? "/report" : "/alerts");
