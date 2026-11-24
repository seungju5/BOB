import { DETECTION } from "@/config/detection";
import { type AppView } from "@/lib/data/view";
import { detectEvents } from "@/lib/judge/detectEvents";
import { MINUTE_MS } from "@/lib/judge/time";
import { DEFAULT_SMARTTHINGS_PROFILE } from "@/lib/smartthings/account-model";

const datasetDate = "2026-11-18";
const exampleRows: ReadonlyArray<readonly [string, number, number, number]> = [
  ["07:20", 38, 220.0, 0.17], ["07:30", 699.9, 220.1, 3.18], ["07:40", 700, 220.0, 3.18],
  ["07:50", 852, 219.8, 3.88], ["08:00", 39, 220.1, 0.18], ["08:20", 1.2, 220.4, 0.01],
  ["08:30", 845, 220.2, 3.84], ["08:40", 36, 220.2, 0.16], ["08:50", 0.8, 220.5, 0.01],
];

function buildDemoTranscript() {
  const samples = exampleRows.map(([time, watts, voltage, currentA]) => ({
    timestamp: datasetDate + "T" + time + ":00+09:00", watts, voltage, currentA,
  }));
  const readings = samples.map((sample) => ({ measuredAt: new Date(sample.timestamp), watts: sample.watts }));
  const events = detectEvents(readings).map(({ type, startedAt, endedAt }) => ({
    type, startedAt: startedAt.toISOString(), endedAt: endedAt.toISOString(),
  }));
  const gapCount = readings.slice(1).filter((r, i) =>
    r.measuredAt.getTime() - readings[i].measuredAt.getTime() > DETECTION.POWER_CHECK_INTERVAL_MIN * MINUTE_MS
  ).length;
  return {
    specVersion: "bapmunna-power-transcription-v6",
    source: "demo" as const,
    dataOrigin: "SYNTHETIC_NOT_HOUSEHOLD_DATA" as const,
    datasetDate, timeZone: "Asia/Seoul",
    device: { id: DEFAULT_SMARTTHINGS_PROFILE.deviceId, label: DEFAULT_SMARTTHINGS_PROFILE.deviceLabel },
    samples,
    interpretation: {
      method: "threshold_rules", minimumCookWatts: DETECTION.COOK_MIN_WATTS,
      minimumCookSamples: 1, cookMergeGapMinutes: DETECTION.COOK_MERGE_GAP_MIN,
      checkIntervalMinutes: DETECTION.POWER_CHECK_INTERVAL_MIN,
      gapCount, peakSampleWatts: Math.max(...samples.map((sample) => sample.watts)), events,
      coverage: gapCount > 0 ? "gaps" : "continuous",
    },
  };
}

export function demoPowerTranscript(view: Pick<AppView, "mode" | "dataSource"> | null) {
  if (view?.mode !== "demo" || view.dataSource && view.dataSource !== "demo") return null;
  return buildDemoTranscript();
}
export type DemoTranscript = NonNullable<ReturnType<typeof demoPowerTranscript>>;
