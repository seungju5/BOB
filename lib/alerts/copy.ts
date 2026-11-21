// 기기와 사용자 행동의 요약을 보호자가 읽는 안부 문구로 바꾼다.
import type { AlertPayload, AlertType } from "../judge/types.ts";

export function alertCopy(
  type: AlertType,
  relation: string,
  s: { missed: number; fasting: number; emergency: number; plugRegistered?: boolean; payload?: AlertPayload },
) {
  switch (type) {
    case "eat_out":
      return { title: `${relation}께서 밖에서 식사하셨어요`, body: "맛있게 드셨는지 전화로 여쭤보면 어떨까요?" };
    case "away": {
      const end = s.payload?.endDate;
      const until = end ? `${Number(end.slice(5, 7))}월 ${Number(end.slice(8, 10))}일까지 ` : "";
      return { title: `${relation}께서 ${until}자리를 비우세요`, body: "그동안은 끼니 알림을 쉬어요. 잘 다녀오시라고 인사 건네 보세요." };
    }
    case "weekly_report":
      return {
        title: "주간 리포트가 발행되었어요",
        body: typeof s.payload?.rate === "number" ? `지난 7일 끼니 확인율은 ${s.payload.rate}%예요. 한 주 패턴을 확인해 보세요.` : "지난 한 주 패턴을 확인해 보세요.",
      };
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

/** 알림을 눌렀을 때 열 화면 */
export const alertUrl = (type: AlertType) => (type === "weekly_report" ? "/report" : "/alerts");
