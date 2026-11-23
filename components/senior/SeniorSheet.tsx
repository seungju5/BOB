"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** 큰 글씨에서도 스크롤할 수 있고, 키보드 초점은 확인창 안에 머문다. */
export function SeniorSheet({ open, onClose, children, label }: { open: boolean; onClose: () => void; children: ReactNode; label: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || !open) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.showModal();
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
      previousFocus?.focus();
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label={label}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
      className="fixed inset-x-0 top-auto bottom-0 mx-auto mb-0 max-h-[90dvh] w-full max-w-[440px] overflow-y-auto overscroll-contain rounded-t-[2rem] border-0 bg-paper p-0 text-cocoa backdrop:bg-cocoa/40"
    >
      {open ? <div className="animate-rise px-6 pt-3 pb-8 motion-reduce:animate-none">
        <div aria-hidden className="mx-auto mb-5 h-1.5 w-12 rounded-full bg-line" />
        {children}
      </div> : null}
    </dialog>
  );
}
