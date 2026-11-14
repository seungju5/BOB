import { Mascot } from "@/components/Mascot";
import { Button } from "@/components/ui";
import { FlowProgress } from "./FlowProgress";
import type { AppView } from "@/lib/data/view";

export function HouseholdSummary({ state, busy, error, onContinue, onHome, onEdit }: {
  state: AppView;
  busy: boolean;
  error: string;
  onContinue: () => void;
  onHome: () => void;
  onEdit: () => void;
}) {
  const household = state.household;
  return (
    <main className="flex flex-1 flex-col bg-butter" aria-busy={busy}>
      <div className="px-6 pt-6 pb-7">
        <FlowProgress current="household" isDemo={state.mode === "demo"} />
        <div className="mt-7 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[16px] font-semibold text-cocoa/75">반가워요!</p>
            <h1 className="mt-2 break-words text-[28px] leading-snug font-bold text-cocoa">{state.senior.name} {state.senior.relation} 댁<br />안부를 함께<br />챙겨 드릴게요</h1>
          </div>
          <Mascot className="h-20 w-20 shrink-0" />
        </div>
      </div>
      <div className="flex flex-1 flex-col rounded-t-[2rem] bg-paper px-6 pt-7 pb-8">
        <h2 className="text-[18px] font-bold text-cocoa">입력하신 정보</h2>
        <dl className="mt-4 flex flex-col gap-4 rounded-2xl border border-line p-4 text-[16px]">
          <div className="flex flex-wrap justify-between gap-2"><dt className="text-muted">부르는 이름</dt><dd className="break-words font-semibold text-cocoa">{state.senior.name} {state.senior.relation}</dd></div>
          <div className="flex flex-wrap justify-between gap-2"><dt className="text-muted">함께 사는 분</dt><dd className="font-semibold text-cocoa">{household.residentCount >= 3 ? "3명 이상" : `${household.residentCount}명`}</dd></div>
          <div className="flex flex-wrap justify-between gap-2"><dt className="text-muted">반려견</dt><dd className="font-semibold text-cocoa">{household.hasPet ? "함께해요" : "없어요"}</dd></div>
        </dl>
        <p role="status" className="mt-3 text-[16px] leading-relaxed text-muted">{state.mode === "demo" ? "예시 정보가 이 브라우저에 저장됐어요." : "우리 집 정보를 저장했어요."}</p>
        <h2 className="mt-6 text-[18px] font-bold text-cocoa">이제 이렇게 준비해요</h2>
        <ol className="mt-3 flex flex-col gap-3">
          {["평소 식사 시간과 외식 횟수", "밥솥을 쓰는 생활 습관", "안부를 물어볼 알림 기준"].map((label, index) => <li key={label} className="flex items-center gap-3 rounded-2xl bg-butter-soft px-4 py-3 text-[16px] text-cocoa"><span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-paper font-bold">{index + 1}</span>{label}</li>)}
        </ol>
        <p className="mt-4 text-[16px] leading-relaxed text-muted">지금 정하지 않아도 괜찮아요. 기기 연결과 생활 기준은 홈에서 이어갈 수 있어요.</p>
        {error ? <p role="alert" className="mt-4 text-[16px] font-semibold text-blush-deep">{error}</p> : null}
        <div className="mt-auto flex flex-col gap-3 pt-7">
          <Button disabled={busy} onClick={onContinue}>이제 생활 설정하기</Button>
          <Button variant="outline" disabled={busy} onClick={onHome}>{busy ? "저장하고 있어요…" : "홈에서 나중에 설정하기"}</Button>
          <Button variant="ghost" disabled={busy} onClick={onEdit}>우리 집 정보 수정</Button>
        </div>
      </div>
    </main>
  );
}
