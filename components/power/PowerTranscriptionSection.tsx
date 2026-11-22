"use client";

import { useId, useState } from "react";
import type { DemoTranscript } from "@/lib/power/power-transcription-model";

const tabs = [{ id: "rules", label: "규칙 해석" }, { id: "input", label: "입력값" }, { id: "json", label: "JSON" }] as const;

export function PowerTranscriptionSection({ transcript }: { transcript: DemoTranscript }) {
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState<(typeof tabs)[number]["id"]>("rules");
  const [copyStatus, setCopyStatus] = useState("");
  const { interpretation, samples } = transcript;
  const json = JSON.stringify(transcript, null, 2);

  async function copy() {
    try {
      await navigator.clipboard.writeText(json);
      setCopyStatus("출처를 포함한 예시 JSON을 복사했어요.");
    } catch {
      setCopyStatus("자동 복사를 사용할 수 없어요. 아래 JSON을 직접 선택해 복사해 주세요.");
    }
  }

  return (
    <section className="mt-6 rounded-3xl border border-line bg-paper p-5" aria-label="예시 전력 해석">
      <h2 className="text-lg font-bold text-cocoa">전력 전사·해석 예시</h2>
      <p className="mt-1 text-sm text-muted">고정 샘플 · {transcript.datasetDate} (한국시간) · {samples.length}개 입력값</p>
      <p className="mt-2 text-sm text-cocoa">화면을 설명하기 위해 만든 값이에요. 위에서 선택한 날짜나 가족 기기의 기록과는 별개예요.</p>
      <button aria-expanded={expanded} aria-controls={id} className="mt-3 min-h-11 rounded-full border border-line px-4 font-semibold text-cocoa" onClick={() => setExpanded(!expanded)}>
        {expanded ? "예시 닫기" : "전력 해석 예시 열기"}
      </button>
      {expanded && <div id={id} className="mt-4">
        <div aria-label="예시 보기 선택" role="group" className="flex flex-wrap gap-2">
          {tabs.map((item) => <button key={item.id} aria-pressed={tab === item.id} onClick={() => setTab(item.id)}
            className={"min-h-11 rounded-full px-4 text-sm font-bold " + (tab === item.id ? "bg-cocoa text-white" : "border border-line text-cocoa")}>{item.label}</button>)}
        </div>
        {tab === "rules" && <div className="mt-4 space-y-2 text-sm leading-relaxed text-cocoa">
          <h3 className="font-bold">예시 입력에 규칙을 적용한 결과</h3>
          <p>밥솥 플러그에서 {interpretation.minimumCookWatts}W 이상이 한 번 측정되면 그 시각에 취사 신호를 기록해요.</p>
          <p>기준 이상인 두 측정의 간격이 {interpretation.cookMergeGapMinutes}분 이하면 같은 취사 한 건으로 묶어요. 그보다 길면 새 건으로 세요.</p>
          <p>이 예시에는 측정이 {interpretation.maximumGapMinutes}분 넘게 비어 있는 곳이 {interpretation.gapCount}곳 있어요. 그 사이의 전력은 알 수 없어요.</p>
          <p className="rounded-xl bg-butter-soft p-3 font-semibold">예시 입력에서 찾은 취사 신호 {interpretation.events.filter(event => event.type === "cook").length}건</p>
        </div>}
        {tab === "input" && <div className="mt-4 overflow-x-auto">
          <table className="w-full text-right text-sm tabular-nums text-cocoa">
            <caption className="pb-2 text-left font-bold">{transcript.datasetDate} 가상 입력값</caption>
            <thead><tr>{["시각 (KST)", "전력 (W)", "전압 (V)", "전류 (A)"].map((label) => <th key={label} scope="col" className="px-1 py-2">{label}</th>)}</tr></thead>
            <tbody>{samples.map((sample) => <tr key={sample.timestamp} className="border-t border-line">
              <th scope="row" className="px-1 py-2">{sample.timestamp.slice(11, 16)}</th><td>{sample.watts}</td><td>{sample.voltage}</td><td>{sample.currentA}</td>
            </tr>)}</tbody>
          </table>
        </div>}
        {tab === "json" && <div className="mt-4 text-sm">
          <button className="min-h-11 rounded-full bg-butter px-4 font-bold text-cocoa" onClick={copy}>예시 JSON 복사</button>
          <p role="status" className="mt-2 text-cocoa">{copyStatus}</p>
          <pre aria-label="출처를 포함한 예시 JSON" className="mt-2 max-h-80 overflow-auto rounded-xl bg-butter-soft p-3 text-xs text-cocoa">{json}</pre>
        </div>}
      </div>}
    </section>
  );
}
