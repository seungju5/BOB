import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { exportPersonalMeter } from "../../scripts/export-personal-meter.mjs";
import { parsePersonalMeter, PERSONAL_METER_FORMAT } from "./personal-meter";

const now = Date.UTC(2025, 4, 1, 12);
const example = {
  format: PERSONAL_METER_FORMAT, deviceKind: "virtual", checkedAt: now,
  reading: { watts: 0, measuredAt: now - 1 }, energy: { kwh: 2.7, measuredAt: now - 5000 },
};

describe("personal meter file", () => {
  it("retains zero and independent original times, including a meter with only an energy reading", () => {
    expect(parsePersonalMeter(example, now)).toEqual(example);
    expect(parsePersonalMeter({ ...example, reading: null }, now)?.energy).toEqual(example.energy);
  });

  it.each([
    { ...example, deviceId: "private-id" }, { ...example, format: "other" },
    { ...example, deviceKind: "automatic" }, { ...example, checkedAt: now + 1 },
    { ...example, reading: { ...example.reading, measuredAt: now + 1 } },
    { ...example, reading: null, energy: null }, { ...example, energy: { ...example.energy, kwh: -3 } },
    { ...example, reading: { ...example.reading, label: "private name" } },
    { ...example, energy: { ...example.energy, kwh: Infinity } },
  ])("rejects unknown or inconsistent file content", input => expect(parsePersonalMeter(input, now)).toBeNull());

  it("exports only the selected outlet in an exclusive private file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bapmunna-meter-test-"));
    const target = join(dir, "record.json");
    const components = [{ id: "outlet", capabilities: [{ id: "powerMeter" }] }];
    const device = { deviceId: "test-outlet-1", label: "내 테스트", type: "VIRTUAL", components };
    const status = vi.fn(async () => ({ components: {
      outlet: { powerMeter: { power: { value: 0, unit: "W", timestamp: new Date(now - 1).toISOString() } },
        energyMeter: { energy: { value: 2700, unit: "Wh", timestamp: new Date(now - 5000).toISOString() } } },
      other: { powerMeter: { power: { value: 60, unit: "W", timestamp: new Date(now).toISOString() } } },
    } }));
    const args = { device: device.label, target, list: async () => [device], status, now: () => now };
    try {
      await exportPersonalMeter(args);
      expect(status).toHaveBeenCalledWith(device.deviceId);
      expect(JSON.parse(await readFile(target, "utf8"))).toEqual(example);
      if (process.platform !== "win32") expect((await stat(target)).mode & 0o077).toBe(0);
      await expect(exportPersonalMeter(args)).rejects.toMatchObject({ code: "EEXIST" });
      status.mockClear();
      await expect(exportPersonalMeter({ ...args, list: async () => [device, { ...device, deviceId: "another-device" }] })).rejects.toThrow("이름이 같은");
      await expect(exportPersonalMeter({ ...args, list: async () => [{ ...device, components: [...components, ...components] }] })).rejects.toThrow("전력계 한 개");
      expect(status).not.toHaveBeenCalled();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
