"use client";

import { useId, useRef } from "react";
import { PrivacyContent } from "./PrivacyContent";

/** Reading consent must neither navigate away nor discard an unsaved form. */
export function PrivacyNotice({ className = "", label = "개인정보 이용·제공 안내 읽기" }: { className?: string; label?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  return <>
    <button type="button" aria-haspopup="dialog" aria-controls={id} onClick={() => dialog.current?.showModal()} className={`min-h-12 py-3 text-left text-[16px] font-semibold text-cocoa underline underline-offset-4 ${className}`}>{label}</button>
    <dialog ref={dialog} id={id} aria-labelledby={`${id}-title`} className="m-auto max-h-[92dvh] w-[calc(100%-24px)] max-w-[480px] overflow-hidden rounded-3xl border border-line bg-paper p-0 text-cocoa shadow-xl backdrop:bg-cocoa/40">
      <div className="flex max-h-[92dvh] flex-col">
        <div className="flex shrink-0 items-center gap-3 border-b border-line px-5 py-3">
          <h2 id={`${id}-title`} className="min-w-0 flex-1 text-[20px] font-extrabold">개인정보 이용·제공 안내</h2>
          <button type="button" autoFocus onClick={() => dialog.current?.close()} className="min-h-12 shrink-0 rounded-xl bg-butter-soft px-4 text-[16px] font-bold">닫기</button>
        </div>
        <div className="min-h-0 overflow-y-auto overscroll-contain p-5"><PrivacyContent /></div>
        <div className="shrink-0 border-t border-line px-5 py-3"><button type="button" onClick={() => dialog.current?.close()} className="min-h-12 w-full rounded-full bg-cocoa px-4 py-3 text-[16px] font-bold text-paper">읽었어요 · 입력으로 돌아가기</button></div>
      </div>
    </dialog>
  </>;
}
