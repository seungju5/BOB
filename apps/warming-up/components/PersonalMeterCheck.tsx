"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { canReadConnection } from "@/lib/data/firebase";
import { MAX_PERSONAL_METER_BYTES, parsePersonalMeter, type PersonalMeter } from "@/lib/smartthings/personal-meter";
import { formatDeviceTime } from "@/lib/smartthings/presentation";
import { MeterReadings } from "./MeterReadings";

const deviceText = { virtual: "가상 기기 · 테스트용", recognized: "플러그 전력 기록", unknown: "종류가 확인되지 않은 기기" };
const invalidFile = "밥뭇나에서 만든 개인 전력 점검 파일(.json)을 선택해 주세요.";

export function PersonalMeterCheck({ uid, revision }: { uid: string; revision: number }) {
  const [record, setRecord] = useState<PersonalMeter | null>(null);
  const [message, setMessage] = useState("");
  const request = useRef(0);
  const id = useId();
  const clear = useCallback(() => {
    request.current++;
    setRecord(null);
    setMessage("");
  }, []);
  useEffect(() => {
    window.addEventListener("pagehide", clear);
    return () => { request.current++; window.removeEventListener("pagehide", clear); };
  }, [clear]);

  async function read(file: File) {
    clear();
    const current = request.current;
    if (!canReadConnection(uid, revision)) return;
    if (!file.size || file.size > MAX_PERSONAL_METER_BYTES) { setMessage(invalidFile); return; }
    let result: PersonalMeter | null = null;
    try { result = parsePersonalMeter(JSON.parse(await file.text())); } catch { /* invalid input */ }
    if (current !== request.current || !canReadConnection(uid, revision)) return;
    if (result) setRecord(result);
    else setMessage(invalidFile);
  }

  return <details id="personal-meter" className="mt-4 border-t border-line pt-1"
    onToggle={event => { if (!event.currentTarget.open) clear(); }}>
    <summary className="min-h-12 cursor-pointer content-center text-[16px] font-bold text-cocoa">개인 전력 점검 파일 열기</summary>
    <p className="text-[16px] leading-relaxed text-muted">내 컴퓨터에서 삼성 전력을 한 번 조회해 만든 파일을 고르세요. 이 화면에서만 보이며, 닫으면 기록이 사라져요.</p>
    <input id={id} type="file" accept=".json,application/json" className="peer sr-only"
      onChange={event => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = "";
        if (file) void read(file);
      }}/>
    <label htmlFor={id} className="mt-3 inline-flex min-h-12 cursor-pointer items-center rounded-full border border-line bg-paper px-5 text-[16px] font-bold text-cocoa peer-focus-visible:outline-2">내 점검 파일 선택</label>
    {message && <p role="alert" className="mt-2 text-[16px] font-semibold text-blush-deep">{message}</p>}
    {record && <div className="mt-3 rounded-xl bg-butter-soft p-4">
      <h3 className="text-[17px] font-bold text-cocoa">파일에서 읽은 전력 기록</h3>
      <p className="mt-1 text-[16px] text-cocoa">{deviceText[record.deviceKind]}</p>
      <p className="mt-1 text-[15px] text-muted">삼성 조회 시각 · {formatDeviceTime(record.checkedAt)} (한국 시간)</p>
      <MeterReadings reading={record.reading} energy={record.energy} checkedAt={record.checkedAt} physicalPlug={record.deviceKind === "recognized"}/>
      <p className="mt-2 text-[15px] text-muted">파일을 여는 동안 자동 수신과 식사 알림은 시작되지 않아요.</p>
      <button type="button" className="mt-1 min-h-11 font-semibold text-cocoa underline" onClick={clear}>화면에서 기록 지우기</button>
    </div>}
  </details>;
}
