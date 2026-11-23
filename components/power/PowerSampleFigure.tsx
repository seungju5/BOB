import type { DemoTranscript } from "@/lib/power/power-transcription-model";
import { kstTime } from "@/lib/judge/time";
import { isCookingPower } from "@/server/smartthings/cooking-signal.mjs";

/** The plotted points and the accessible table use exactly the same synthetic samples. */
export function PowerSampleFigure({ transcript }: { transcript: DemoTranscript }) {
  const { samples, interpretation, datasetDate } = transcript;
  if (!samples.length) return null;
  const threshold = interpretation.minimumCookWatts;
  const starts = new Set(interpretation.events.filter(e => e.type === "cook").map(e => Date.parse(e.startedAt)));
  const rows = samples.map(sample => {
    const at = Date.parse(sample.timestamp);
    const high = isCookingPower(sample.watts, threshold);
    const start = starts.has(at);
    return {...sample, at, clock: kstTime(new Date(at)), high, start, label: start ? "사용 시작" : high ? "같은 사용" : "기준 미만"};
  });
  const first = rows[0], last = rows[rows.length - 1];
  const maxW = Math.ceil(Math.max(interpretation.peakSampleWatts, threshold) / 100) * 100;
  const x = (t: number) => 34 + 244 * (t - first.at) / Math.max(1, last.at - first.at);
  const y = (watts: number) => 105 - 81 * watts / maxW;
  const gaps = rows.slice(1).flatMap((row, i) => row.at - rows[i].at > interpretation.checkIntervalMinutes * 60000
    ? [rows[i].clock + "–" + row.clock] : []);
  return <figure className="mt-4 text-cocoa">
    <figcaption className="font-bold">밥솥 사용 시각 · 예시 {starts.size}건</figcaption>
    <p className="mt-1 text-sm text-muted">취사 신호가 처음 잡힌 시각은 {rows.filter(r => r.start).map(r => r.clock).join(", ")}예요.</p>
    <svg role="img" aria-label={`예시 전력 그래프. 점 하나가 측정 한 번이에요. 기준선은 ${threshold}W이고 모든 값은 아래 표에 있어요.`}
      viewBox="0 0 300 134" className="mt-3 block w-full rounded-xl bg-butter-soft">
      <g fontSize="11" fill="currentColor">
        <text x="4" y="14">W</text>
        <text x="28" y={y(maxW) + 4} textAnchor="end">{maxW}</text>
        <text x="28" y={y(threshold) + 4} textAnchor="end">{threshold}</text>
        <text x="28" y="109" textAnchor="end">0</text>
        <text x={x(first.at)} y="125">{first.clock}</text>
        {rows.filter(row => row.start && x(row.at) > 75 && x(row.at) < 237).map(row =>
          <text key={row.timestamp} x={x(row.at)} y="125" textAnchor="middle" fontWeight="bold">{row.clock}</text>)}
        <text x={x(last.at)} y="125" textAnchor="end">{last.clock}</text>
      </g>
      <path d="M34 24V105H278" fill="none" stroke="currentColor" opacity=".45" />
      <line x1="34" x2="278" y1={y(threshold)} y2={y(threshold)} stroke="currentColor" strokeDasharray="4 3" />
      {rows.map(row => <g key={row.timestamp} data-sample={row.clock}>
        <title>{`${row.clock} · ${row.watts}W · ${row.label}`}</title>
        {row.high ? <rect x={x(row.at) - 3.5} y={y(row.watts) - 3.5} width="7" height="7" fill="currentColor"
          transform={`rotate(45 ${x(row.at)} ${y(row.watts)})`}/> :
          <circle cx={x(row.at)} cy={y(row.watts)} r="3.5" fill="white" stroke="currentColor" strokeWidth="1.5"/>}
      </g>)}
    </svg>
    <p className="mt-2 text-sm">◆ 기준 이상　○ 기준 미만　┄ {threshold}W</p>
    {gaps.length > 0 && <p className="mt-1 text-sm text-muted">{gaps.join(", ")} 사이에는 측정이 비어 있어요.</p>}
    <div className="mt-4 overflow-x-auto">
      <table className="w-full text-right text-sm tabular-nums">
        <caption className="pb-2 text-left font-bold">{datasetDate} 예시 측정표 · 한국시간</caption>
        <thead><tr>{["시각", "전력 W", "전압 V", "전류 A", "판독"].map(label =>
          <th key={label} scope="col" className="whitespace-nowrap px-1 py-2">{label}</th>)}</tr></thead>
        <tbody>{rows.map(row => <tr key={row.timestamp} className="border-t border-line">
          <th scope="row" className="px-1 py-2">{row.clock}</th><td>{row.watts}</td><td>{row.voltage}</td><td>{row.currentA}</td>
          <td className={row.high ? "font-bold" : "text-muted"}>{row.label}</td>
        </tr>)}</tbody>
      </table>
    </div>
  </figure>;
}
