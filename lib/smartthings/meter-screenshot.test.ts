import { describe, it, expect } from "vitest";
import { readKoreanClock, readMeterText, slotForCapture } from "./meter-screenshot";
import type { MealWindow } from "../judge/types";

const now = Date.parse("2026-03-10T12:00:00Z");
const time = "2026-03-09T15:12:43.001Z";
const attribute = (n: string, unit = "W", at = time) => [
  "SmartThings CLI", "devices:capability-status / powerMeter", "{", '"power": {',
  '"value": ' + n + ",", '"unit": "' + unit + '",', '"timestamp": "' + at + '"', "}", "}",
].join("\n");

describe("one screenshot of a power meter", () => {
  it("keeps the measured time and the shared 700 W result, including an exact boundary", () => {
    expect(readMeterText(attribute("699.999"), now)).toEqual({ cooking: false, measuredAt: Date.parse(time) });
    expect(readMeterText(attribute("0.700", "kW"), now)).toEqual({ cooking: true, measuredAt: Date.parse(time) });
    expect(readMeterText(attribute("0", "W").replace('"W",', '"w" ’'), now)).toEqual({ cooking: false, measuredAt: Date.parse(time) });
    expect(readMeterText("전력 미터\n700W\n측정 시각: 2026. 3. 10. 오전 12:12 KST", now))
      .toEqual({ cooking: true, measuredAt: Date.parse("2026-03-09T15:12:00Z") });
  });
  it("does not date an instantaneous reading from a status bar, a chart tooltip or an energy counter", () => {
    const screen = "12:41\nPower meter\n690 W\n31 days\nAvg.\n810 W\nNov 22\nEnergy meter\n1.3 kWh";
    expect(readMeterText(screen, now)).toEqual({ cooking: false, measuredAt: null });
    expect(readMeterText("Power meter\nAvg.\n850 W\nEnergy meter\n1.3 kWh", now)).toBeNull();
    expect(readMeterText("Power meter\n31 days\n1000 W", now)).toBeNull();
    expect(readMeterText("Power meter\n0 kWh\n700 W", now)).toBeNull();
  });
  it.each(["Power meter\n1.2.3 W", "Power meter\n800 Wh", "Energy meter\n0.85 kWh",
    "Power meter\n-800 W", "Power meter\n700 W\n800 W", "Our review is still pending.",
    "700 W", "Virtual plug\nPower meter\n800 W", attribute("100", "kWh")])("rejects ambiguous or unrelated input %#", text => {
    expect(readMeterText(text, now)).toBeNull();
  });
  it("requires a valid full date and explicit measurement zone, rejecting future or invalid times", () => {
    for (const stamp of ["2026-02-30T12:00:00Z", "2026-03-12T00:00:00Z", "2026-03-10 09:05", "12:41"]) {
      expect(readMeterText(attribute("0", "W", stamp), now)).toEqual({ cooking: false, measuredAt: null });
    }
    expect(readKoreanClock("2026-02-30", "10:30", now)).toBeNull();
    expect(readKoreanClock("2026-03-12", "10:30", now)).toBeNull();
    expect(readKoreanClock("2026-03-10", "24:00", now)).toBeNull();
  });
  it("maps KST midnight and half-open boundaries against the family's actual windows", () => {
    const windows: MealWindow[] = [{ slot: "fourth", start: "00:00", end: "00:13" }, { slot: "fifth", start: "00:13", end: "02:00" }];
    expect(slotForCapture(Date.parse(time), windows)).toEqual({ date: "2026-03-10", window: windows[0] });
    expect(slotForCapture(readKoreanClock("2026-03-10", "00:13", now)!, windows).window).toEqual(windows[1]);
    expect(slotForCapture(readKoreanClock("2026-03-10", "02:00", now)!, windows).window).toBeUndefined();
  });
});
