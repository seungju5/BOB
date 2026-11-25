import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { exportPersonalMeter } from "../../scripts/export-personal-meter.mjs";
import { parsePersonalMeter, PERSONAL_METER_FORMAT } from "./personal-meter";

const now = Date.UTC(2025, 4, 1, 12);
const example = {
  format: PERSONAL_METER_FORMAT, deviceKind: "virtual", checkedAt: now,
  reading: { cooking: false, measuredAt: now - 1 }, energy: { measuredAt: now - 5000 },
};

describe("personal meter file", () => {
  it("keeps the threshold result and original times, including energy-only meters", () => {
    expect(parsePersonalMeter(example, now)).toEqual(example);
    expect(parsePersonalMeter({ ...example, reading: null }, now)?.energy).toEqual(example.energy);
  });

  it("interprets earlier file versions in memory and discards raw power and energy", () => {
    const v1 = {...example, format:"bapmunna.personal-meter.v1", reading:{watts:700,measuredAt:now-1}, energy:{kwh:2.7,measuredAt:now-5000}};
    expect(parsePersonalMeter(v1,now)).toEqual({...example,reading:{cooking:true,measuredAt:now-1}});
    expect(parsePersonalMeter({...v1,reading:{watts:NaN,measuredAt:now-1}},now)).toBeNull();
  });

  it.each([
    { ...example, deviceId: "private-id" }, { ...example, format: "other" },
    { ...example, deviceKind: "automatic" }, { ...example, checkedAt: now + 1 },
    { ...example, reading: { ...example.reading, measuredAt: now + 1 } },
    { ...example, reading: null, energy: null }, { ...example, energy: { ...example.energy, kwh: -3 } },
    { ...example, reading: { ...example.reading, label: "private name" } },
    { ...example, energy: { ...example.energy, kwh: Infinity } },
  ])("rejects unknown or inconsistent file content", input => expect(parsePersonalMeter(input, now)).toBeNull());

  it("waits for a new reading on the selected partner outlet and never substitutes a device check or energy timestamp", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bapmunna-fresh-meter-"));
    const target = join(dir, "fresh.json");
    let clock = now;
    const interval = 10 * 60_000;
    const plug = { deviceId: "test-partner-plug", type: "VIPER", label: "밥솥", components: [{
      id: "main", capabilities: [{ id: "powerMeter" }], categories: [{ name: "SmartPlug", categoryType: "manufacturer" }],
    }] };
    const wait = vi.fn(async (ms: number) => {clock += ms;});
    let advancePower = false;
    const status = vi.fn(async () => ({ components: { main: {
      powerMeter: { power: { unit: "W", value: 700, timestamp: new Date(advancePower && clock >= now + 2 * interval ? clock - 1000 : now - interval).toISOString() } },
      energyMeter: { energy: { unit: "kWh", value: 1.3, timestamp: new Date(clock).toISOString() } },
    } } }));
    const options = { device: plug.label, fresh: true, list: async () => [plug], target, status, now: () => clock, wait };
    try {
      await expect(exportPersonalMeter({ ...options, list: async () => [{ ...plug, type: "VIRTUAL" }] })).rejects.toThrow("실물 기기");
      expect(status).not.toHaveBeenCalled();
      await expect(exportPersonalMeter(options)).rejects.toThrow("새 전력 측정");
      expect(status).toHaveBeenCalledTimes(4);
      expect(wait.mock.calls).toEqual([[interval], [interval], [interval]]);
      await expect(stat(target)).rejects.toMatchObject({code:"ENOENT"});
      advancePower = true;
      clock = now;
      const saved = await exportPersonalMeter(options);
      expect(saved?.reading).toEqual({ cooking: true, measuredAt: now + 2 * interval - 1000 });
      expect(saved?.deviceKind).toBe("recognized");
      expect(await readFile(target, "utf8")).not.toMatch(/밥솥|700|test-partner-plug/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

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
      const physical = { ...device, deviceId: "direct-1", type: "MQTT", components: [{
        ...components[0], categories: [{ name: "SmartPlug", categoryType: "manufacturer" }],
      }] };
      const automatic = { ...args, device: undefined, onlySmartPlug: true, target: join(dir, "physical.json") };
      const userCategory = { ...physical, components: [{ ...components[0], categories: [{ name: "SmartPlug", categoryType: "user" }] }] };
      for (const items of [[device, userCategory], [physical, { ...physical, deviceId: "direct-2" }]]) {
        await expect(exportPersonalMeter({ ...automatic, list: async () => items })).rejects.toThrow("--device");
      }
      expect(status).not.toHaveBeenCalled();
      expect(await exportPersonalMeter({ ...automatic, list: async () => [physical, device, userCategory] }))
        .toEqual({ ...example, deviceKind: "recognized" });
      expect(status.mock.calls).toEqual([["direct-1"]]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
