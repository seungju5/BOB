"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { canReadConnection } from "@/lib/data/firebase";
import { mealSlotLabel } from "@/lib/data/view";
import type { MealWindow } from "@/lib/judge/types";
import { kstDate } from "@/lib/judge/time";
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
  const active = useRef<AbortController | null>(null);
  const inputId = useId();

  const cancel = useCallback(() => {
    active.current?.abort();
    active.current = null;
  }, []);
  const clear = useCallback(() => {
    cancel();
    setBusy(false); setReading(null); setMessage(""); setDate(""); setTime(""); setConfirmedAt(null);
  }, [cancel]);
  useEffect(() => {
    window.addEventListener("pagehide", clear);
    return () => { cancel(); window.removeEventListener("pagehide", clear); };
  }, [clear, cancel]);

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
  const slot = confirmedAt !== null ? slotForCapture(confirmedAt, windows).window : null;
  const fromImage = reading?.measuredAt != null && selectedTime === Math.floor(reading.measuredAt / 1000) * 1000;
  const finding = reading?.cooking ? "취사 기준에 맞는 신호예요" : "이 측정은 취사 기준 미만이에요";

  return <details id="meter-screenshot" className="mt-4 border-t border-line pt-1"
    onToggle={event => { if (!event.currentTarget.open) clear(); }}>
    <summary className="min-h-12 cursor-pointer content-center text-[17px] font-bold text-cocoa">스마트싱스 캡처 읽기</summary>
    <p className={hint}>밥솥 전용 플러그의 전력과 측정 시각이 보이는 화면을 고르세요. 사진은 이 기기 안에서만 읽어요.</p>
    <input type="file" accept="image/png,image/jpeg,image/webp" id={inputId} className="peer sr-only" onChange={event => {
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
      <p className="mt-2 text-[16px] text-cocoa">{slot ? "현재 우리 집 설정 · " + mealSlotLabel(slot.slot, windows) + " 시간대 (" + slot.start + "–" + slot.end + ")" : windows.length ? "현재 설정한 끼니 시간대 밖이에요." : "우리 집 끼니 시간대를 설정하면 어느 시간대인지 볼 수 있어요."}</p>
      <p className={hint}>{reading.cooking ? "밥솥을 사용했을 가능성이 있어요. 식사 여부는 가족에게 직접 확인해 주세요." : "이 한 번의 측정만으로는 취사나 식사 여부를 알 수 없어요."} 이 결과는 이 화면에만 표시해요.</p>
      <button type="button" className="mt-2 min-h-11 font-bold text-cocoa underline" onClick={clear}>판독 결과 지우기</button>
    </section>}
  </details>;
}
