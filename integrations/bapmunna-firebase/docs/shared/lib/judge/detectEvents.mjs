// GENERATED from lib/judge/detectEvents.ts. Run npm run sync:firebase at repository root.
import { DETECTION } from "../../config/detection.mjs";
import { MINUTE_MS } from "./time.mjs";
/**
 * 전력 시계열 → 밥솥 이벤트(cook, lid_open). design.md 4.1.
 * 순간값이 아니라 구간 단위로 판단한다.
 */
export function detectEvents(readings, cfg = DETECTION) {
    const sorted = [...readings].sort((a, b) => a.measuredAt.getTime() - b.measuredAt.getTime());
    const events = [...detectCooks(sorted, cfg), ...detectLidOpens(sorted, cfg)];
    return events.sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
}
const interval = (cfg) => cfg.READING_INTERVAL_MIN * MINUTE_MS;
const gapTooLong = (prev, next, cfg) => next.measuredAt.getTime() - prev.measuredAt.getTime() > cfg.MAX_READING_GAP_MIN * MINUTE_MS;
/** 조건을 만족하는 연속 구간들. 수신이 너무 오래 끊기면 구간을 나눈다. */
function runs(readings, match, cfg) {
    const out = [];
    let cur = null;
    let prev = null;
    for (const r of readings) {
        if (cur && prev && gapTooLong(prev, r, cfg)) {
            out.push(cur);
            cur = null;
        }
        if (match(r)) {
            const end = new Date(r.measuredAt.getTime() + interval(cfg));
            cur = cur ? { start: cur.start, end } : { start: r.measuredAt, end };
        }
        else if (cur) {
            out.push(cur);
            cur = null;
        }
        prev = r;
    }
    if (cur)
        out.push(cur);
    return out;
}
function detectCooks(readings, cfg) {
    const high = runs(readings, (r) => r.watts >= cfg.COOK_MIN_WATTS, cfg);
    // 짧게 끊긴 고전력 구간은 한 번의 취사로 합친다.
    const merged = [];
    for (const run of high) {
        const last = merged.at(-1);
        if (last && run.start.getTime() - last.end.getTime() <= cfg.COOK_MERGE_GAP_MIN * MINUTE_MS) {
            last.end = run.end;
        }
        else {
            merged.push({ ...run });
        }
    }
    return merged
        .filter((r) => r.end.getTime() - r.start.getTime() >= cfg.COOK_MIN_MINUTES * MINUTE_MS)
        .map((r) => ({ type: "cook", startedAt: r.start, endedAt: r.end }));
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
