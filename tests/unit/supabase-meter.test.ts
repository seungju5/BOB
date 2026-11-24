import { describe, expect, it } from "vitest";
import { classifyMeter, parseMeterStatus } from "@/lib/smartthings/meter";
import { MAX_PERSONAL_METER_BYTES, parsePersonalMeter } from "@/lib/smartthings/personal-meter";

const measured = "2026-04-01T01:02:03.456Z";
const checked = Date.parse(measured) + 600_000;
const status = (value: unknown, timestamp: unknown = measured, unit: unknown = "W") => ({ power: { value, timestamp, unit } });

describe("the source meter", () => {
  it("keeps Samsung measurement time and requires finite nonnegative watts", () => {
    expect(parseMeterStatus(status(700), checked)).toEqual({ watts: 700, measuredAt: measured });
    for (const bad of [status(45, null), status(45, "2026-02-30T09:34:00Z"), status(5, "2026-04-02"), status(5, "2028-01-01T00:00:00Z"), status(5, measured, "kWh"), status(Infinity), status(-1), status("700")])
      expect(parseMeterStatus(bad, checked)).toBeNull();
  });
  it("only classifies a manufacturer-metered MQTT outlet or recognized physical transport as physical", () => {
    const main = { id: "main", capabilities: [{ id: "powerMeter" }], categories: [{ name: "SmartPlug", categoryType: "manufacturer" }] };
    expect(classifyMeter({ type: "VIRTUAL", components: [main] })).toBe("virtual");
    expect(classifyMeter({ type: "MQTT", components: [main] })).toBe("recognized");
    expect(classifyMeter({ type: "MQTT", components: [{ ...main, categories: [{ name: "SmartPlug", categoryType: "user" }] }] })).toBe("unknown");
    expect(classifyMeter({ type: "ZIGBEE", components: [main] })).toBe("recognized");
    expect(classifyMeter({ type: "ZIGBEE", components: [{ ...main, id: "other" }] })).toBe("unknown");
  });
  it("reads old local files into coarse signals without retaining raw watts, household or token", () => {
    const legacy = { format: "bapmunna.personal-meter.v1", deviceKind: "recognized", checkedAt: checked,
      reading: { measuredAt: Date.parse(measured), watts: 700 }, energy: null };
    const parsed = parsePersonalMeter(legacy, checked)!;
    expect(parsed.reading).toEqual({ measuredAt: Date.parse(measured), cooking: true });
    expect(parsePersonalMeter({ ...legacy, token: "synthetic-test" }, checked)).toBeNull();
    expect(parsePersonalMeter(parsed, checked)).toEqual(parsed);
    expect(MAX_PERSONAL_METER_BYTES).toBe(4096);
  });
});
