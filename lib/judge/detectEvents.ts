import { DETECTION } from "@/config/detection.ts";
import { continuesCookRun, isCookingPower } from "@/server/smartthings/cooking-signal.mjs";
import { MINUTE_MS } from "./time.ts";
import type { CookerEvent, PowerReading } from "./types.ts";

type Config = typeof DETECTION;

/**
 * 전력 시계열 → 밥솥 이벤트(cook, lid_open). design.md 4.1.
 * 취사는 첫 고전력 측정 시각부터 인정한다. 보온 중 뚜껑 열림은 구간으로 판단한다.
 */
export function detectEvents(readings: PowerReading[], cfg: Config = DETECTION): CookerEvent[] {
  const sorted = readings.filter(r => Number.isFinite(r?.watts) && r.watts >= 0 &&
    r.measuredAt instanceof Date && Number.isFinite(r.measuredAt.getTime()))
    .sort((a, b) => a.measuredAt.getTime() - b.measuredAt.getTime());
  const events = [...detectCooks(sorted, cfg), ...detectLidOpens(sorted, cfg)];
  return events.sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
}

const interval = (cfg: Config) => cfg.READING_INTERVAL_MIN * MINUTE_MS;
const gapTooLong = (prev: PowerReading, next: PowerReading, cfg: Config) =>
  next.measuredAt.getTime() - prev.measuredAt.getTime() > cfg.MAX_READING_GAP_MIN * MINUTE_MS;

/** 수신 공백을 넘어 합치지 않는다. 실제 표본이 있는 짧은 저전력 구간만 병합한다. */
function detectCooks(readings: PowerReading[], cfg: Config): CookerEvent[] {
  const events: CookerEvent[] = [];
  let run: CookerEvent | null = null;
  let previousTime: number | null = null;
  for (const reading of readings) {
    const time = reading.measuredAt.getTime();
    if (previousTime !== null && time - previousTime > cfg.MAX_READING_GAP_MIN * MINUTE_MS) run = null;
    if (isCookingPower(reading.watts, cfg.COOK_MIN_WATTS)) {
      if (run && continuesCookRun(time, previousTime, run.endedAt.getTime(),
        cfg.MAX_READING_GAP_MIN, cfg.COOK_MERGE_GAP_MIN, cfg.READING_INTERVAL_MIN)) {
        run.endedAt = reading.measuredAt;
      } else {
        run = { type: "cook", startedAt: reading.measuredAt, endedAt: reading.measuredAt };
        events.push(run);
      }
    }
    previousTime = time;
  }
  return events;
}

/**
 * 보온이 일정 시간 이어진 상태에서, 기준선보다 크게 오른 전력을 뚜껑 열림으로 본다.
 * 자연 히터 사이클은 상승폭이 작다고 가정한다 (실측으로 확인 필요, test.md T-DET-05).
 */
function detectLidOpens(readings: PowerReading[], cfg: Config): CookerEvent[] {
  const events: CookerEvent[] = [];
  const isKeepWarm = (w: number) => w >= cfg.KEEP_WARM_MIN_WATTS && w <= cfg.KEEP_WARM_MAX_WATTS;

  let warmStart: Date | null = null; // 현재 보온 구간 시작
  let established = false; // 보온이 최소 시간 이상 이어졌는가
  let baseline: number[] = []; // 최근 보온 전력값
  let spike: { start: Date; end: Date } | null = null;
  let prev: PowerReading | null = null;

  const reset = () => {
    warmStart = null;
    established = false;
    baseline = [];
    spike = null;
  };
  const closeSpike = () => {
    if (!spike) return;
    const last = events.at(-1);
    if (last && spike.start.getTime() - last.endedAt.getTime() <= cfg.LID_OPEN_DEBOUNCE_MIN * MINUTE_MS) {
      last.endedAt = spike.end;
    } else {
      events.push({ type: "lid_open", startedAt: spike.start, endedAt: spike.end });
    }
    spike = null;
  };

  for (const r of readings) {
    if (prev && gapTooLong(prev, r, cfg)) reset();
    prev = r;
    const w = r.watts;

    if (isKeepWarm(w)) {
      closeSpike();
      warmStart ??= r.measuredAt;
      baseline = [...baseline.slice(-9), w];
      if (r.measuredAt.getTime() - warmStart.getTime() + interval(cfg) >= cfg.KEEP_WARM_MIN_MINUTES * MINUTE_MS) {
        established = true;
      }
      continue;
    }

    if (w >= cfg.COOK_MIN_WATTS || w < cfg.KEEP_WARM_MIN_WATTS) {
      // 취사로 돌아갔거나 꺼짐 → 보온 상태가 아니다.
      spike = null;
      reset();
      continue;
    }

    // 보온 범위 위, 취사 아래: 히터 재가동
    const base = baseline.reduce((a, b) => a + b, 0) / Math.max(baseline.length, 1);
    if (established && w - base >= cfg.LID_OPEN_DELTA_WATTS) {
      const end = new Date(r.measuredAt.getTime() + interval(cfg));
      spike = spike ? { start: spike.start, end } : { start: r.measuredAt, end };
    } else {
      closeSpike();
    }
  }
  closeSpike();
  return events;
}
