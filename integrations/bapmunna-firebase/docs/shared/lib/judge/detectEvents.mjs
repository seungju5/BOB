// GENERATED from lib/judge/detectEvents.ts. Run npm run sync:firebase at repository root.
import { DETECTION } from "../../config/detection.mjs";
import { MINUTE_MS } from "./time.mjs";
/**
 * 전력 시계열 → 밥솥 이벤트(cook, lid_open). design.md 4.1.
 * 취사는 첫 고전력 측정 시각부터 인정한다. 보온 중 뚜껑 열림은 구간으로 판단한다.
 */
export function detectEvents(readings, cfg = DETECTION) {
    const sorted = readings.filter(r => Number.isFinite(r?.watts) && r.watts >= 0 &&
        r.measuredAt instanceof Date && Number.isFinite(r.measuredAt.getTime()))
        .sort((a, b) => a.measuredAt.getTime() - b.measuredAt.getTime());
    const events = [...detectCooks(sorted, cfg), ...detectLidOpens(sorted, cfg)];
    return events.sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
}
const interval = (cfg) => cfg.READING_INTERVAL_MIN * MINUTE_MS;
const gapTooLong = (prev, next, cfg) => next.measuredAt.getTime() - prev.measuredAt.getTime() > cfg.MAX_READING_GAP_MIN * MINUTE_MS;
export function isCookingPower(watts, threshold = DETECTION.COOK_MIN_WATTS) {
    return typeof watts === "number" && Number.isFinite(watts) && watts >= threshold;
}
/** 직전 고전력 측정 시각부터 병합한다. 그 사이의 전력이나 식사 여부는 추정하지 않는다. */
function detectCooks(readings, cfg) {
    const events = [];
    let run = null;
    for (const reading of readings) {
        if (!Number.isFinite(reading.measuredAt.getTime()) || !isCookingPower(reading.watts, cfg.COOK_MIN_WATTS))
            continue;
        if (run && reading.measuredAt.getTime() - run.endedAt.getTime() <= cfg.COOK_MERGE_GAP_MIN * MINUTE_MS) {
            run.endedAt = reading.measuredAt;
        }
        else {
            run = { type: "cook", startedAt: reading.measuredAt, endedAt: reading.measuredAt };
            events.push(run);
        }
    }
    return events;
}
/**
 * 보온이 일정 시간 이어진 상태에서, 기준선보다 크게 오른 전력을 뚜껑 열림으로 본다.
 * 자연 히터 사이클은 상승폭이 작다고 가정한다 (실측으로 확인 필요, test.md T-DET-05).
 */
function detectLidOpens(readings, cfg) {
    const events = [];
    const isKeepWarm = (w) => w >= cfg.KEEP_WARM_MIN_WATTS && w <= cfg.KEEP_WARM_MAX_WATTS;
    let warmStart = null; // 현재 보온 구간 시작
    let established = false; // 보온이 최소 시간 이상 이어졌는가
    let baseline = []; // 최근 보온 전력값
    let spike = null;
    let prev = null;
    const reset = () => {
        warmStart = null;
        established = false;
        baseline = [];
        spike = null;
    };
    const closeSpike = () => {
        if (!spike)
            return;
        const last = events.at(-1);
        if (last && spike.start.getTime() - last.endedAt.getTime() <= cfg.LID_OPEN_DEBOUNCE_MIN * MINUTE_MS) {
            last.endedAt = spike.end;
        }
        else {
            events.push({ type: "lid_open", startedAt: spike.start, endedAt: spike.end });
        }
        spike = null;
    };
    for (const r of readings) {
        if (prev && gapTooLong(prev, r, cfg))
            reset();
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
        }
        else {
            closeSpike();
        }
    }
    closeSpike();
    return events;
}
