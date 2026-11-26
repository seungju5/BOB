"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { canReadConnection, changeCapturedMeals, refreshCapturedMeals, useFirebaseAccount } from "@/lib/data/firebase";
import { COOKER_RECORD_DAYS } from "@/config/detection";
import { mealSlotLabel } from "@/lib/data/view";
import type { MealWindow } from "@/lib/judge/types";
import { addDays, kstDate } from "@/lib/judge/time";
import { readKoreanClock, slotForCapture, type CaptureReading } from "@/lib/smartthings/meter-screenshot";
import { Button } from "./ui";

const secondsKst = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Seoul", hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit",
});
const prettyKst = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul", dateStyle: "long", timeStyle: "medium",
});
const hint = "mt-2 text-[15px] leading-relaxed text-muted";

export function MeterScreenshotCheck({ uid, revision, windows }: { uid: string; revision: number; windows: MealWindow[] }) {
  const [reading, setReading] = useState<CaptureReading | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [confirmedAt, setConfirmedAt] = useState<number | null>(null);
  const [saved, setSaved] = useState<"saved"|"duplicate"|null>(null);
  const [writing, setWriting] = useState(false);
  const [erase, setErase] = useState(false);
  const writeId = useRef(0);
  const panel = useRef<HTMLDetailsElement>(null);
  const account = useFirebaseAccount(false);
  const active = useRef<AbortController | null>(null);
  const inputId = useId();

  const cancel = useCallback(() => {
    active.current?.abort();
    active.current = null;
  }, []);
  const cancelEdits = useCallback(() => { writeId.current++; },[]);
  const clear = useCallback(() => {
    cancel();
    cancelEdits();
    setBusy(false); setReading(null); setMessage(""); setDate(""); setTime(""); setConfirmedAt(null);
    setSaved(null); setWriting(false); setErase(false);
  }, [cancel,cancelEdits]);
  useEffect(() => {
    window.addEventListener("pagehide", clear);
    if (window.location.hash === "#meter-screenshot" && panel.current) {
      panel.current.open = true;
      panel.current.scrollIntoView();
    }
    return () => { cancelEdits(); cancel(); window.removeEventListener("pagehide", clear); };
  }, [clear, cancel, cancelEdits]);

  async function openFile(file: File) {
    clear();
    if (!canReadConnection(uid, revision)) return;
    const controller = new AbortController();
    active.current = controller;
    const current = () => active.current === controller && canReadConnection(uid, revision);
    setBusy(true);
    try {
      const { readMeterImage } = await import("@/lib/smartthings/read-meter-image");
      if (!current()) return;
      const result = await readMeterImage(file, controller.signal);
      if (!current()) return;
      if (!result) {
        setMessage("순간 전력 한 건을 찾지 못했어요. 밥솥 플러그 화면에서 ‘Power meter’ 또는 ‘전력’과 숫자·단위(W)가 함께 보이게 잘라 주세요.");
        return;
      }
      setReading(result);
      if (result.measuredAt !== null) {
        setDate(kstDate(new Date(result.measuredAt)));
        setTime(secondsKst.format(result.measuredAt));
      }
    } catch (error) {
      if (current()) setMessage(error instanceof Error && /^[가-힣0-9]/.test(error.message) ?
        error.message : "캡처를 읽지 못했어요. PNG나 JPG로 저장한 뒤 다시 선택해 주세요.");
    } finally {
      if (current()) { active.current = null; setBusy(false); }
    }
  }

  const selectedTime = readKoreanClock(date, time);
  const day = confirmedAt === null ? null : kstDate(new Date(confirmedAt));
  const dayWindows = account.captures?.find(d => d.date === day)?.windows ?? windows;
  const slot = confirmedAt !== null ? slotForCapture(confirmedAt, dayWindows).window : null;
  const withinPeriod = !!day && day >= addDays(kstDate(new Date()),1 - COOKER_RECORD_DAYS);
  const fromImage = reading?.measuredAt != null && selectedTime === Math.floor(reading.measuredAt / 1000) * 1000;
  const finding = reading?.cooking ? "취사 기준에 맞는 신호예요" : "이 측정은 취사 기준 미만이에요";

  async function changeRecord(remove:boolean) {
    if (writing || !canReadConnection(uid, revision) || (!remove && (!reading || confirmedAt === null || !withinPeriod))) return;
    const id = ++writeId.current;
    const current = () => id === writeId.current && canReadConnection(uid,revision);
    setWriting(true); setMessage("");
    try {
      const result = await changeCapturedMeals(uid,revision, remove ? null : {at:confirmedAt!,cooking:reading!.cooking,windows:dayWindows});
      if (!current()) return;
      if (remove) { clear(); setMessage("이 계정의 캡처 기록을 지웠어요."); }
      else setSaved(result === "duplicate" ? "duplicate" : "saved");
    } catch (e) {
      if (current()) setMessage(e instanceof Error && /^[가-힣]/.test(e.message) ? e.message :
        "서버에서 반영을 확인하지 못했어요. 연결을 확인하고 다시 시도해 주세요. 같은 측정은 한 번만 반영돼요.");
    } finally { if (current()) setWriting(false); }
  }

  return <details ref={panel} id="meter-screenshot" className="mt-4 border-t border-line pt-1"
    onToggle={event => { if (!event.currentTarget.open) clear(); }}>
    <summary className="min-h-12 cursor-pointer content-center text-[17px] font-bold text-cocoa">스마트싱스 캡처 읽기</summary>
    <p className={hint}>밥솥 전용 플러그의 전력과 측정 시각이 보이는 화면을 고르세요. 사진은 이 기기 안에서만 읽어요.</p>
    <input type="file" disabled={writing} accept="image/png,image/jpeg,image/webp" id={inputId} className="peer sr-only" onChange={event => {
      const file = event.currentTarget.files?.[0];
      event.currentTarget.value = "";
      if (file) void openFile(file);
    }}/>
    <label htmlFor={inputId} className="mt-3 inline-flex min-h-12 cursor-pointer items-center rounded-full border border-line bg-paper px-5 text-[16px] font-bold text-cocoa peer-focus-visible:outline-2">{reading || busy ? "다른 캡처 선택" : "캡처 이미지 선택"}</label>
    {busy && <p role="status" className={hint}>기기에서 글자를 읽고 있어요… <button type="button" className="min-h-11 font-bold underline" onClick={clear}>취소</button></p>}
    {message && <p role="alert" className={hint}>{message}</p>}
    {reading && confirmedAt === null && <form className="mt-3 space-y-3 rounded-xl border border-line p-4" onSubmit={event => {
      event.preventDefault();
      const valid = readKoreanClock(date, time);
      if (valid !== null && canReadConnection(uid, revision)) setConfirmedAt(valid);
    }}>
      <h3 className="font-bold text-cocoa">원본과 맞는지 확인해 주세요</h3>
      <p className="text-[16px] text-cocoa">{finding}.</p>
      <p className={hint}>{reading.measuredAt === null ? "캡처에서 측정 시각을 읽지 못했어요. SmartThings의 ‘기록’에서 같은 측정의 날짜와 시간을 확인해 입력해 주세요." : "우리 집 밥솥 플러그가 맞는지, 아래 시각이 원본과 같은지 확인해 주세요."} 휴대폰 상단 시계와 그래프 평균은 사용하지 않아요.</p>
      <div className="flex flex-wrap gap-3">
        <label className="grid gap-1 text-[15px] font-semibold">측정 날짜 (한국)<input required type="date" value={date} max={kstDate(new Date())} className="min-h-11 rounded-lg border border-line bg-paper px-2" onChange={e => setDate(e.target.value)}/></label>
        <label className="grid gap-1 text-[15px] font-semibold">측정 시각 (한국)<input required type="time" step="1" value={time} className="min-h-11 rounded-lg border border-line bg-paper px-2" onChange={e => setTime(e.target.value)}/></label>
      </div>
      {date && time && selectedTime === null && <p role="alert" className={hint}>실제 측정이 끝난 날짜와 시각을 입력해 주세요.</p>}
      <Button type="submit" variant="dark" disabled={selectedTime === null}>우리 집 측정이 맞아요 · 결과 보기</Button>
    </form>}
    {reading && confirmedAt !== null && <section aria-label="캡처 판독 결과" aria-live="polite" className="mt-3 rounded-xl bg-butter-soft p-4">
      <p className="text-[15px] text-muted">직접 가져온 캡처 한 장</p>
      <h3 className="mt-1 text-[19px] font-bold text-cocoa">{finding}</h3>
      <p className="mt-2 text-[16px] text-cocoa">{prettyKst.format(confirmedAt)} (한국 시간)</p>
      <p className="text-[15px] text-muted">{fromImage ? "캡처에서 읽은 측정 시각" : "직접 확인해 입력한 측정 시각"}</p>
      <p className="mt-2 text-[16px] text-cocoa">{slot ? "기록에 적용할 시간대 · " + mealSlotLabel(slot.slot, dayWindows) + " 시간대 (" + slot.start + "–" + slot.end + ")" : "설정한 끼니 시간대 밖이에요."}</p>
      <p className={hint}>{reading.cooking ? "시간대 밖의 신호도 취사 횟수에 담겨요. 실제 식사 여부는 가족에게 확인해 주세요." : "이 측정에서 확인된 취사는 0회예요. 그날 식사를 거르셨다는 뜻은 아니에요."}</p>
      {saved && day ? <>
        <p role="status" className="mt-3 font-bold text-cocoa">{saved === "duplicate" ? "이미 반영한 측정이에요." : "우리 집 날짜별 기록에 반영했어요."}</p>
        <Link className="inline-flex min-h-12 items-center font-bold text-cocoa underline" href={"/records/?day="+day}>이 날짜의 밥솥 기록 보기</Link>
      </> : withinPeriod ? <>
        <p className={hint}>반영을 누르면 측정 시각, 취사 기준 충족 여부, 적용할 끼니 시간대를 내 계정에 저장해요. 사진과 전력 원값은 저장하지 않아요.</p>
        <Button type="button" variant="dark" className="mt-3" disabled={writing || !dayWindows.length} onClick={() => void changeRecord(false)}>{writing ? "저장 확인 중…" : "우리 집 기록에 반영"}</Button>
      </> : <p className={hint}>날짜별 기록에는 최근 {COOKER_RECORD_DAYS}일의 측정을 담을 수 있어요.</p>}
      <button type="button" disabled={writing} className="mt-2 min-h-11 font-bold text-cocoa underline" onClick={clear}>판독 결과 지우기</button>
    </section>}
    {account.captureError && <p role="alert" className={hint}>저장한 캡처 기록을 불러오지 못했어요. <button type="button" className="min-h-11 font-bold underline" onClick={()=>void refreshCapturedMeals(uid,revision)}>다시 불러오기</button></p>}
    {!!account.captures?.length && <div className="mt-3 border-t border-line pt-2">
      {erase ? <><p className={hint}>모든 날짜의 캡처 기록을 이 계정에서 삭제할까요?</p>
        <button type="button" disabled={writing} className="mr-4 min-h-11 font-bold text-cocoa underline" onClick={()=>void changeRecord(true)}>캡처 기록 모두 삭제</button>
        <button type="button" disabled={writing} className="min-h-11 text-muted" onClick={()=>setErase(false)}>취소</button></> :
        <button type="button" disabled={writing} className="min-h-11 text-muted underline" onClick={()=>setErase(true)}>저장한 캡처 기록 삭제하기</button>}
    </div>}
  </details>;
}
