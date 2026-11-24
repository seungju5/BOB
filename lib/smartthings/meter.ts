/** SmartThings main-outlet status. Device names and client clocks cannot classify a plug or date its reading. */
export type MeterKind = "recognized" | "virtual" | "unknown";
export type MeterObservation = { watts: number; measuredAt: string };
type Component = { id?: string; capabilities?: { id?: string }[]; categories?: { name?: string; categoryType?: string }[] };
const localTransports = new Set(["BLE", "BLE_D2D", "LAN", "MATTER", "ZIGBEE", "ZWAVE"]);

export function classifyMeter(device: { type?: string; components?: Component[] }): MeterKind {
  if (device.type === "VIRTUAL") return "virtual";
  const main = device.components?.find(item => item.id === "main");
  if (!main?.capabilities?.some(capability => capability.id === "powerMeter")) return "unknown";
  const directPlug = device.type === "MQTT" && main.categories?.some(category =>
    category.name === "SmartPlug" && category.categoryType === "manufacturer");
  return localTransports.has(device.type ?? "") || directPlug ? "recognized" : "unknown";
}

export function parseMeterStatus(body: unknown, now = Date.now()): MeterObservation | null {
  if (!body || typeof body !== "object" || !("power" in body)) return null;
  const attr = body.power as { value?: unknown; unit?: unknown; timestamp?: unknown } | null;
  if (!attr || typeof attr.value !== "number" || !Number.isFinite(attr.value) || attr.value < 0 || attr.unit !== "W" ||
      typeof attr.timestamp !== "string") return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-]\d\d:[0-5]\d)$/.exec(attr.timestamp);
  if (!iso) return null;
  const [, year, month, day, hour] = iso.map(Number);
  if (month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate() || hour > 23) return null;
  const time = Date.parse(attr.timestamp);
  if (!Number.isFinite(time) || time <= 0 || time > now) return null;
  return { watts: attr.value, measuredAt: new Date(time).toISOString() };
}
