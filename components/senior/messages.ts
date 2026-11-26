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

// The Seoul calendar date advances this rotation even while the home stays open.
const encouragements = [
  "오늘도 내 속도로, 한 걸음씩 가요.",
  "잠깐 쉬어 가도 좋아요. 곁에 있을게요.",
  "오늘은 어떤 꽃이 피었을까요?",
  "반가운 얼굴이 떠오르면 안부를 건네요.",
  "오늘도 작은 기쁨 하나 만나세요.",
  "창밖 하늘을 함께 올려다볼까요?",
  "느긋한 발걸음도 멋진 산책이에요.",
  "따뜻한 햇살 한 줌, 마음에 담아 가요.",
  "좋아하는 노래를 흥얼거려 볼까요?",
  "오늘도 만나서 참 반가워요.",
] as const;

export function dailyEncouragement(seoulDate: string): string {
  const day = Date.parse(seoulDate + "T00:00:00Z") / 86_400_000;
  const index = ((day % encouragements.length) + encouragements.length) % encouragements.length;
  return encouragements[index];
}
