import { isCookingPower } from "../../server/smartthings/cooking-signal.mjs";
import { kstDate, kstDateTime, kstTime } from "../judge/time.ts";
import { validMealWindows } from "../judge/resolveMealSlots.ts";
import type { MealWindow } from "../judge/types.ts";

// Keep only the threshold result and measurement time after parsing local OCR text.
export type CaptureReading = { cooking: boolean; measuredAt: number | null };
const powerNumber = /^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/;
const clock = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const iso = /^(\d{4}-\d{2}-\d{2})T((?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d)(?:\.\d{1,3})?(Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/i;
const label = /^\s*(?:power\s*meter|instantaneous power|current power|현재\s*전력|순간\s*전력|소비\s*전력|전력\s*미터|전력계|전력)(?![a-z가-힣])/i;
const chart = /(?:\bavg\b|\baverage\b|\bdays?\b|\b(?:min|max)\b|평균|최대|최소|누적|사용량|에너지|energy|기록\s*그래프)/i;
const timeLabel = /^(?:measured\s+at|measurement\s+time|(?:마지막\s*)?측정\s*(?:시각|일시|시간))\s*[:：]?\s*/i;

function validDate(date: string) {
  if (!datePattern.test(date)) return false;
  const ms = Date.parse(date + "T00:00:00Z");
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === date;
}

export function readKoreanClock(date: string, time: string, now = Date.now()): number | null {
  if (!validDate(date) || !clock.test(time)) return null;
  const ms = kstDateTime(date, time.slice(0, 5)).getTime() + Number(time.slice(6) || 0) * 1000;
  return ms > 0 && ms <= now ? ms : null;
}

function measuredTime(value: string, now: number): number | null {
  const clean = value.trim().replace(/^["'\s]+|["',\s]+$/g, "");
  const utc = iso.exec(clean);
  if (utc && validDate(utc[1])) {
    const ms = Date.parse(clean);
    return ms > 0 && ms <= now ? ms : null;
  }
  const ko = /^(\d{4})\s*(?:[-./]|년)\s*(\d{1,2})\s*(?:[-./]|월)\s*(\d{1,2})(?:일|\.)?\s+(?:(오전|오후)\s*)?(\d{1,2})(:[0-5]\d(?::[0-5]\d)?)\s*(?:KST|한국\s*시간)$/i.exec(clean);
  if (!ko) return null;
  let hour = Number(ko[5]);
  if (ko[4]) {
    if (hour < 1 || hour > 12) return null;
    hour = hour % 12 + (ko[4] === "오후" ? 12 : 0);
  }
  return readKoreanClock([ko[1], ko[2].padStart(2, "0"), ko[3].padStart(2, "0")].join("-"),
    String(hour).padStart(2, "0") + ko[6], now);
}

function threshold(value: string, unit: string): boolean | null {
  if (!powerNumber.test(value) || !/^(?:kW|W)$/i.test(unit)) return null;
  const watts = Number(value.replaceAll(",", "")) * (unit.toLowerCase() === "kw" ? 1000 : 1);
  return Number.isFinite(watts) ? isCookingPower(watts) : null;
}

/** A device's single instantaneous reading. Chart summaries, axes and kWh never supply a reading. */
export function readMeterText(text: string, now = Date.now()): CaptureReading | null {
  if (!text || text.length > 18000) return null;
  const lines = text.normalize("NFKC").replace(/[“”]/g, '"').replace(/[‘’]/g, "'")
    .replace(/[‐‑–−]/g, "-").split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (lines.some(line => /virtual\s+(?:plug|device)|가상\s*(?:기기|플러그)/i.test(line))) return null;
  // The official CLI displays the power, unit and timestamp on separate JSON lines.
  const powerFields = lines.flatMap((line, i) => /^["']?power["']?\s*:\s*\{/.test(line) ? [i] : []);
  if (powerFields.length) {
    if (powerFields.length !== 1) return null;
    const start = powerFields[0] + 1;
    const end = lines.findIndex((line, i) => i >= start && /^\}/.test(line));
    const fields = lines.slice(start, end < 0 ? start + 3 : end);
    const values = fields.filter(l => /^["']?value["']?\s*:/i.test(l));
    const units = fields.filter(l => /^["']?unit["']?\s*:/i.test(l));
    const stamps = fields.filter(l => /^["']?timestamp["']?\s*:/i.test(l));
    if (values.length !== 1 || units.length !== 1 || stamps.length > 1) return null;
    const val = /^["']?value["']?\s*:\s*([\d.,]+?)\s*,?$/i.exec(values[0]);
    const unit = /^["']?unit["']?\s*:\s*["']?(k?w)[\s"',]*$/i.exec(units[0]);
    const cooking = val && unit ? threshold(val[1], unit[1]) : null;
    return cooking === null ? null : { cooking, measuredAt: stamps.length ?
      measuredTime(stamps[0].replace(/^["']?timestamp["']?\s*:/i, ""), now) : null };
  }
  const headings = lines.flatMap((line, i) => label.test(line) ? [i] : []);
  if (headings.length !== 1) return null;
  const i = headings[0];
  const headingRemainder = lines[i].replace(label, "").trim().replace(/^[:：]\s*/, "");
  if (chart.test(headingRemainder)) return null;
  const candidates = [headingRemainder, ...lines.slice(i + 1, i + 4)];
  const readings: boolean[] = [];
  for (const row of candidates) {
    if (chart.test(row) || timeLabel.test(row)) break;
    const power = /^([\d.,]+)\s*(k?w)$/i.exec(row);
    if (power) {
      const cooked = threshold(power[1], power[2]);
      if (cooked === null) return null;
      readings.push(cooked);
    } else if (/\d/.test(row)) break;
  }
  if (readings.length !== 1) return null;
  // Only a timestamp labelled as a measurement can set the date. Ignore the phone clock and chart dates.
  const headerRows = lines.slice(i + 1);
  const boundary = headerRows.findIndex(line => chart.test(line) || /energy\s*meter|전력량/i.test(line));
  const meterRows = boundary < 0 ? headerRows : headerRows.slice(0, boundary);
  const stamps = meterRows.flatMap((line, n) => timeLabel.test(line) ?
    [line.replace(timeLabel, "") || meterRows[n + 1] || ""] : []);
  return { cooking: readings[0], measuredAt: stamps.length === 1 ? measuredTime(stamps[0], now) : null };
}

export function slotForCapture(measuredAt: number, windows: MealWindow[]) {
  const date = new Date(measuredAt);
  const time = kstTime(date);
  const window = validMealWindows(windows) ? windows.find(w => w.start <= time && time < w.end) : undefined;
  return { date: kstDate(date), window };
}
