"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { IconChart, IconCooker, IconHeart } from "@/components/icons";
import { previewOwner, setFeaturePreview } from "@/lib/push-device";
import { noticeText } from "@/public/notification-content";
import { appPath } from "@/lib/app-path";

const examples = [
  { kind: "cooker_signal", label: "밥솥 소식", target: "그날의 기록 · 연결된 끼니가 있으면 그 끼니", Icon: IconCooker },
  { kind: "help_request", label: "받은 안부", target: "해당 안부가 있는 알림함", Icon: IconHeart },
  { kind: "weekly_report", label: "주간 리포트", target: "한 주 패턴 리포트", Icon: IconChart },
] as const;

export function NoticePreview({owner, enabled, demo}: {owner: string | null; enabled: boolean; demo: boolean}) {
  const [selected, select] = useState(0);
  const [feature, setFeature] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void previewOwner().then(saved => { if (active) setFeature(!!owner && saved === owner); });
    return () => { active = false; };
  }, [owner, enabled]);
  const example = examples[selected];
  const message = noticeText(example.kind, true);

  async function change(next: boolean) {
    if (!owner || !enabled || busy) return;
    setBusy(true);
    setError("");
    try {
      await setFeaturePreview(owner, next);
      setFeature(next);
    } catch {
      setError("이 기기에 표시 설정을 저장하지 못했어요. 다시 눌러 주세요.");
    } finally { setBusy(false); }
  }

  return <div className="mt-4 border-t border-cocoa/15 pt-1">
    <details open={demo || undefined}>
      <summary className="cursor-pointer py-3 text-[15px] font-bold">잠금화면 알림 예시</summary>
      <div role="group" aria-label="알림 예시 선택" className="flex flex-wrap gap-1.5">
        {examples.map(({kind, label, Icon}, index) => <button type="button" key={kind} aria-pressed={selected === index}
          onClick={() => select(index)} className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold ${selected === index ? "border-cocoa bg-cocoa text-paper" : "border-line bg-paper text-cocoa"}`}>
          <Icon aria-hidden="true" className="h-4 w-4"/>{label}
        </button>)}
      </div>
      <div aria-live="polite" aria-atomic="true" className="mt-3">
        <div className="flex items-center gap-3 rounded-2xl border border-line bg-paper p-3.5 shadow-sm">
          <span aria-hidden="true" className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] bg-butter"><Image src={appPath("/brand/rice-mark.png")} alt="" width={38} height={38}/></span>
          <div className="min-w-0"><p className="text-[16px] font-bold leading-snug">{message.title}</p>
          <p className="mt-1 text-[14px] leading-snug">{message.body}</p></div>
        </div>
        <p className="mb-3 mt-2 text-sm text-muted">열리는 화면 · {example.target}</p>
      </div>
    </details>
    {owner && enabled && !demo && <label className="mt-1 flex min-h-12 items-start gap-3 rounded-2xl bg-paper p-3 text-[15px]">
      <input type="checkbox" checked={feature} disabled={busy} onChange={e => void change(e.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-cocoa"/>
      <span><strong>잠금화면에 소식 종류 표시</strong><span className="mt-0.5 block text-sm text-muted">끄면 ‘새 소식’으로 보여요. 자세한 안부는 앱에서 확인해요.</span></span>
    </label>}
    {error && <p role="alert" className="mt-2 text-sm">{error}</p>}
  </div>;
}
