import { DETECTION } from "@/config/detection";
import { isDemoView, type AppView } from "@/lib/data/view";
import { detectEvents } from "@/lib/judge/detectEvents";
import { MINUTE_MS } from "@/lib/judge/time";
import { DEMO_SMARTTHINGS_PROFILE } from "@/lib/smartthings/account-model";

const datasetDate = "2026-11-18";
const exampleRows: ReadonlyArray<readonly [string, number, number, number]> = [
  ["07:38", 840, 220.1, 3.82], ["07:55", 852, 219.8, 3.88], ["08:12", 38, 220.0, 0.17],
  ["11:42", 1.2, 220.4, 0.01], ["14:10", 0.8, 220.5, 0.01], ["16:28", 845, 220.2, 3.84],
  ["16:45", 848, 220.0, 3.85], ["17:03", 39, 220.1, 0.18], ["17:40", 36, 220.2, 0.16],
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
    r.measuredAt.getTime() - readings[i].measuredAt.getTime() > DETECTION.MAX_READING_GAP_MIN * MINUTE_MS
  ).length;
  return {
    specVersion: "bapmunna-power-transcription-v4",
    source: "demo" as const,
    dataOrigin: "SYNTHETIC_NOT_HOUSEHOLD_DATA" as const,
    datasetDate, timeZone: "Asia/Seoul",
    device: { id: DEMO_SMARTTHINGS_PROFILE.deviceId, label: DEMO_SMARTTHINGS_PROFILE.deviceLabel },
    samples,
    interpretation: {
      method: "threshold_rules", minimumCookWatts: DETECTION.COOK_MIN_WATTS,
      minimumCookSamples: 1, maximumGapMinutes: DETECTION.MAX_READING_GAP_MIN,
      gapCount, peakSampleWatts: Math.max(...samples.map((sample) => sample.watts)), events,
      coverage: gapCount > 0 ? "gaps" : "continuous",
    },
  };
}

export function demoPowerTranscript(view: Pick<AppView, "mode" | "dataSource"> | null) {
  if (!isDemoView(view)) return null;
  return buildDemoTranscript();
}
export type DemoTranscript = NonNullable<ReturnType<typeof demoPowerTranscript>>;
