import { ALERT_DEFAULTS } from "@/config/detection";
import type { SmartThingsEnergy, SmartThingsReading } from "@/lib/firebase/smartthings";
import { formatDeviceTime } from "@/lib/smartthings/presentation";

const textClass = "text-[16px] leading-relaxed text-muted";

export function MeterReadings({ reading, energy, checkedAt, physicalPlug }: {
  reading: SmartThingsReading | null;
  energy: SmartThingsEnergy | null;
  checkedAt?: number | null;
  physicalPlug: boolean;
}) {
  const old = reading && checkedAt && checkedAt - reading.measuredAt >= ALERT_DEFAULTS.DEVICE_OFFLINE_HOURS * 3600000;
  return <div role="status" className="mt-3 rounded-xl bg-paper p-3">
    {reading ? <>
      <p className="text-[17px] font-bold text-cocoa">{physicalPlug
        ? reading.cooking ? "이 측정에서 취사 기준에 맞는 신호가 있었어요" : "이 측정은 취사 기준 미만이에요"
        : "기기의 전력 측정 신호를 확인했어요"}</p>
      <p className={textClass}>측정 시각 · {formatDeviceTime(reading.measuredAt)} (한국 시간)</p>
      {old ? <p className="mt-1 text-[15px] font-semibold text-cocoa">조회 시점보다 {ALERT_DEFAULTS.DEVICE_OFFLINE_HOURS}시간 이상 앞선 기록이에요.</p> : null}
    </> : <p className={textClass}>기기에서 측정 시각이 있는 전력값을 받지 못했어요.</p>}
    {energy && <div className="mt-2 border-t border-line pt-2">
      <p className={textClass}>누적량 기록 시각 · {formatDeviceTime(energy.measuredAt)} (한국 시간)</p>
    </div>}
  </div>;
}
