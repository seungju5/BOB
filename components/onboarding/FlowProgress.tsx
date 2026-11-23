const stages = ["login", "intro", "household", "home"] as const;
type Stage = (typeof stages)[number];

/** 소개와 우리 집 설정에서 공유하는 전체 시작 순서. 이동·저장은 각 화면이 맡는다. */
export function FlowProgress({ current, isDemo = false }: { current: Stage; isDemo?: boolean }) {
  const labels = [isDemo ? "체험 선택" : "로그인", "소개", "우리 집", "홈"];
  const currentIndex = stages.indexOf(current);
  return (
    <ol aria-label="시작 순서" className="grid grid-cols-4 gap-2">
      {stages.map((stage, index) => (
        <li key={stage} aria-current={stage === current ? "step" : undefined} className="flex min-w-0 flex-col gap-2 text-center">
          <span aria-hidden className={`h-1.5 rounded-full ${index <= currentIndex ? "bg-cocoa" : "bg-cocoa/15"}`} />
          <span className={`text-[16px] leading-snug ${stage === current ? "font-bold text-cocoa" : "text-cocoa/65"}`}>
            {labels[index]}
            {index < currentIndex ? <span className="sr-only"> 완료</span> : null}
            {stage === current ? <span className="sr-only"> 진행 중</span> : null}
          </span>
        </li>
      ))}
    </ol>
  );
}
