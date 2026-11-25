"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {Suspense, useEffect, useState, type ReactNode} from "react";
import { guardianStartPath, isDemoView } from "@/lib/data/view";
import { useApp } from "@/lib/data/useApp";
import { useAlertNotifications } from "@/lib/push";
import { pushOwner } from "@/lib/push-device";
import { clearNoticeReturn, readNoticeReturn, rememberNoticeReturn, resolveNoticeReturn } from "@/lib/alerts/notification-return";

const waiting = <main className="p-6" role="status">내 정보를 확인하고 있어요…</main>;

export function GuardianGate({ children }: { children: ReactNode }) {
  return <Suspense fallback={waiting}><GuardianSession>{children}</GuardianSession></Suspense>;
}

function GuardianSession({children}: {children: ReactNode}) {
  const {view, needsLogin, accountKey, error} = useApp();
  const router = useRouter();
  const query = useSearchParams();
  const fromNotice = query.get("from") === "notice";
  const noticeQuery = fromNotice ? query.toString() : null;
  const [attempt, retry] = useState(0);
  const [failed, setFailed] = useState<{owner:string; query:string | null; attempt:number} | null>(null);
  const needsRealAccount = fromNotice && view?.mode === "demo";
  const owner = pushOwner(accountKey);
  useAlertNotifications(view, accountKey);
  useEffect(() => {
    if (needsLogin || needsRealAccount) {
      rememberNoticeReturn();
      router.replace("/login");
    } else if (view && view.onboardingStep <= 7) {
      rememberNoticeReturn();
      router.replace(guardianStartPath(view.onboardingStep));
    }
  }, [view, needsLogin, needsRealAccount, router]);

  const ready = !needsLogin && view?.mode === "live" && view.onboardingStep > 7;
  useEffect(() => {
    if (!ready || !owner) return;
    // Preserve the saved intent across Strict Mode replay; consume only after verification.
    if (fromNotice) rememberNoticeReturn();
    const incoming = fromNotice ? new URL(location.href) : readNoticeReturn();
    if (!incoming) return;
    let current = true;
    void resolveNoticeReturn(incoming, owner).then(target => {
      if (current) { setFailed(null); clearNoticeReturn(); router.replace(target); }
    }, () => {
      if (current) setFailed({owner,query:noticeQuery,attempt});
    });
    return () => { current = false; };
  }, [ready, owner, router, fromNotice, noticeQuery, attempt]);
  if (error) return <main className="p-6"><p role="alert">{error}</p><button className="mt-4 min-h-12 rounded-full bg-butter px-6" onClick={() => location.reload()}>다시 확인</button></main>;
  if (ready && failed?.owner === owner && failed?.query === noticeQuery) {
    if (failed.attempt !== attempt) return waiting;
    return <main className="p-6"><p role="alert">밥솥 기록을 불러오지 못했어요. 연결을 확인한 뒤 다시 열어 주세요.</p>
      <button type="button" className="mt-4 min-h-12 rounded-full bg-butter px-6" onClick={()=>retry(n=>n+1)}>기록 다시 확인</button>
      <button type="button" className="ml-2 min-h-12 px-3 underline" onClick={()=>{setFailed(null);clearNoticeReturn();router.replace("/alerts/");}}>알림함 열기</button>
    </main>;
  }
  if (needsLogin || fromNotice || !view || view.onboardingStep <= 7) return waiting;
  return <div key={accountKey} className="flex flex-1 flex-col">
    {isDemoView(view) && <p className="border-b border-line bg-butter-soft px-6 py-2 text-sm text-cocoa"><strong>예시 체험 중</strong> · 화면의 기기와 가족 기록은 가상 데이터예요.</p>}
    {children}
  </div>;
}
