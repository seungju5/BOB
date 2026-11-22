import { ALERT_DEFAULTS } from "@/config/detection";
import type { SmartThingsEnergy, SmartThingsReading } from "@/lib/firebase/smartthings";
import { formatDeviceTime } from "@/lib/smartthings/presentation";

const number = new Intl.NumberFormat("ko-KR", { maximumSignificantDigits: 7 });
const textClass = "text-[16px] leading-relaxed text-muted";

export function MeterReadings({ reading, energy, checkedAt }: {
  reading: SmartThingsReading | null;
  energy: SmartThingsEnergy | null;
  checkedAt?: number | null;
}) {
  const old = reading && checkedAt && checkedAt - reading.measuredAt >= ALERT_DEFAULTS.DEVICE_OFFLINE_HOURS * 3600000;
  return <div role="status" className="mt-3 rounded-xl bg-paper p-3">
    {reading ? <>
      <p className="text-[15px] text-muted">기기가 마지막으로 측정한 전력</p>
      <p className="text-[20px] font-bold text-cocoa">{number.format(reading.watts)} W</p>
      <p className={textClass}>측정 시각 · {formatDeviceTime(reading.measuredAt)} (한국 시간)</p>
      {old ? <p className="mt-1 text-[15px] font-semibold text-cocoa">조회 시점보다 {ALERT_DEFAULTS.DEVICE_OFFLINE_HOURS}시간 이상 앞선 기록이에요.</p> : null}
    </> : <p className={textClass}>기기에서 측정 시각이 있는 전력값을 받지 못했어요.</p>}
    {energy && <div className="mt-2 border-t border-line pt-2">
      <p className="text-[16px] font-semibold text-cocoa">누적 전력량 · {number.format(energy.kwh)} kWh</p>
      <p className={textClass}>누적량 기록 시각 · {formatDeviceTime(energy.measuredAt)} (한국 시간)</p>
    </div>}
  </div>;
}
