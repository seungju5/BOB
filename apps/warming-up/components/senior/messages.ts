import type { SeniorOp } from "@/lib/data/senior";

/** 저장·접수 응답은 가족의 수신이나 곧 연락할 것을 보장하지 않는다. */
export function seniorActionMessage(op: SeniorOp, isDemo: boolean): string {
  if (isDemo) {
    const action = { eat_out: "외식 소식", away: "외출 소식", back: "귀가 소식", help: "도움 요청" }[op];
    return `${action}을 체험했어요.\n실제 가족에게 보내지 않아요.`;
  }
  return {
    eat_out: "외식 소식을 저장했어요.",
    away: "외출 기간을 저장했어요.",
    back: "돌아온 소식을 저장했어요.",
    help: "도움 요청을 접수했어요.\n급한 경우 가족에게 직접 전화해 주세요.",
  }[op];
}
