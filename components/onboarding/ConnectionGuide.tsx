import { IconArrowRight, IconCheckSquare, IconLock, IconPlug, IconSmartphone, IconWifi } from "@/components/icons";

const guides = [
  {
    title: "1. 삼성 계정에서 권한 허용",
    description: "본인 계정인지 확인하고 요청한 권한을 읽어 주세요. 허용 여부는 직접 선택하며, 원하지 않으면 연결을 취소할 수 있어요.",
    steps: [
      { text: "내 삼성 계정 확인", Icon: IconSmartphone },
      { text: "요청한 권한 읽기", Icon: IconLock },
      { text: "허용 여부 선택", Icon: IconCheckSquare },
    ],
  },
  {
    title: "2. 플러그 선택과 신호 확인",
    description: "전력 측정을 지원하는 밥솥 플러그를 골라요. 연결 상태와 실제 수신 시각을 따로 확인해요. 신호가 없다는 이유만으로 식사 여부를 판단하지 않아요.",
    steps: [
      { text: "밥솥 플러그 선택", Icon: IconPlug },
      { text: "연결 상태 확인", Icon: IconWifi },
      { text: "실제 수신 시각 확인", Icon: IconCheckSquare },
    ],
  },
];

/** 설명용 도식이다. 인증·기기 선택·API 호출을 실행하는 조작 요소를 두지 않는다. */
export function ConnectionGuide() {
  return (
    <section aria-label="기기 연결 안내 예시" className="flex flex-col gap-3">
      <h2 className="text-[17px] font-bold text-cocoa">연결 순서 미리 보기</h2>
      <p className="text-[16px] leading-relaxed text-muted">아래는 안내 예시예요. 실제 계정이나 기기에 연결하지 않아요.</p>
      {guides.map((guide) => (
        <details key={guide.title} className="rounded-2xl border border-line px-4">
          <summary className="min-h-12 cursor-pointer py-3 text-[16px] leading-relaxed font-bold text-cocoa">{guide.title}</summary>
          <div className="flex flex-col gap-4 pb-4">
            <p className="text-[16px] leading-relaxed text-muted">{guide.description}</p>
            <figure className="rounded-2xl bg-butter-soft p-3">
              <figcaption className="mb-3 text-[16px] font-semibold text-cocoa">안내 예시 · 실제 동작 없음</figcaption>
              <ol className="flex flex-col gap-2">
                {guide.steps.map(({ text, Icon }, index) => (
                  <li key={text} className="flex flex-col items-center gap-2">
                    <div className="connection-guide-step flex w-full items-center gap-3 rounded-xl border border-line bg-paper p-3" style={{ animationDelay: `${index * 2}s` }}>
                      <Icon className="h-5 w-5 shrink-0 text-cocoa" />
                      <span className="text-[16px] leading-relaxed text-cocoa"><span className="font-bold">{index + 1}. </span>{text}</span>
                    </div>
                    {index < guide.steps.length - 1 ? <IconArrowRight className="h-5 w-5 rotate-90 text-cocoa/60" /> : null}
                  </li>
                ))}
              </ol>
            </figure>
          </div>
        </details>
      ))}
      <style>{`
        @keyframes connection-guide-highlight {
          0%, 34%, 100% { border-color: var(--color-line); transform: translateY(0); }
          12%, 24% { border-color: var(--color-butter-deep); transform: translateY(-2px); }
        }
        @media (prefers-reduced-motion: no-preference) {
          .connection-guide-step { animation: connection-guide-highlight 6s ease-in-out infinite; }
        }
        @media (prefers-reduced-motion: reduce) {
          .connection-guide-step { animation: none; }
        }
      `}</style>
    </section>
  );
}
