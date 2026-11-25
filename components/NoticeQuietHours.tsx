"use client";

import { useEffect, useState } from "react";
import {localQuietHours, saveQuietHours, syncWorkerDelivery, type QuietHours} from "@/lib/push-device";
import { readBackgroundQuiet, setBackgroundQuiet } from "@/lib/notification-transport";
import { isQuietHours } from "@/server/smartthings/notification-policy.mjs";

export function NoticeQuietHours({owner, background}: {owner:string; background:boolean}) {
  const [times, setTimes] = useState<QuietHours>({start:"22:00", end:"07:00"});
  const [on, setOn] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [revision, refresh] = useState(0);
  useEffect(() => {
    let active = true;
    const request = background ? readBackgroundQuiet(owner) : Promise.resolve(localQuietHours(owner));
    void request.then(saved => {
      if (!active) return;
      if (saved) setTimes(saved);
      setOn(Boolean(saved)); setLoaded(true);
    }, () => { if (active) setMessage("서버의 알림 시간을 확인하지 못했어요."); });
    return () => { active = false; };
  }, [owner, background, revision]);

  async function save() {
    const next = on ? times : null;
    if (next && !isQuietHours(next)) { setMessage("시작과 끝에 서로 다른 시각을 골라 주세요."); return; }
    setBusy(true);
    try {
      if (background) await setBackgroundQuiet(owner, next);
      else { saveQuietHours(owner, next); await syncWorkerDelivery(owner,"quiet",next); }
      setMessage(next ? `한국시간 ${next.start}부터 ${next.end}까지 밥솥 알림을 쉬어요.` : "밥솥 알림을 모든 시간에 받아요.");
    } catch { setMessage("시간을 저장하지 못했어요. 다시 시도해 주세요."); }
    finally { setBusy(false); }
  }
  return <details className="mt-2 border-t border-cocoa/15">
    <summary className="cursor-pointer py-3 text-[15px] font-bold">밥솥 알림을 쉴 시간</summary>
    <fieldset disabled={!loaded || busy} className="space-y-2 rounded-2xl bg-paper p-3 text-sm">
      <label className="flex min-h-11 items-center gap-3 font-semibold"><input type="checkbox" className="h-5 w-5 accent-cocoa" checked={on} onChange={e=>{setOn(e.target.checked);setMessage("");}}/>이 기기에서 쉴 시간 정하기</label>
      {on && <div className="flex flex-wrap gap-3">{(["start","end"] as const).map(k=><label key={k} className="min-w-0">
        <span className="block text-muted">한국시간 · {k === "start" ? "쉬기 시작" : "다시 받기"}</span>
        <input type="time" required value={times[k]} className="min-h-11 max-w-full rounded-xl border border-line px-2" onChange={e=>{setTimes({...times,[k]:e.target.value});setMessage("");}}/>
      </label>)}</div>}
      <button type="button" className="min-h-11 rounded-full border border-cocoa/30 px-4 font-bold" onClick={()=>void save()}>알림 시간 저장</button>
    </fieldset>
    {message && <p role="status" className="mt-2 text-sm">{message}</p>}
    {message && !loaded && <button type="button" className="min-h-11 underline" onClick={()=>{setMessage("");refresh(v=>v+1);}}>시간 설정 다시 확인</button>}
  </details>;
}
