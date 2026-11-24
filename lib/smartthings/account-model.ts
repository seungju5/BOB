/**
 * [EN] Data model for the linked SmartThings account and rice cooker smart plug metadata.
 * [KR] 연동된 SmartThings 계정 및 밥솥 스마트 플러그 메타데이터를 정의하는 모델(Model)입니다.
 */

export interface SmartThingsLinkedProfile {
  accountAlias: string;
  locationId: string;
  locationName: string;
  roomId: string;
  roomName: string;
  deviceId: string;
  deviceLabel: string;
  deviceCategory: string;
  profileName: string;
  capabilities: readonly string[];
  switchState: "on" | "off";
  signalStateLabel: string;
  lastSignalIso: string;
  lastCheckedIso: string;
}

/**
 * Local demonstration fixture for the sample plug and room.
 */
export const DEFAULT_SMARTTHINGS_PROFILE: SmartThingsLinkedProfile = {
  accountAlias: "SmartThings Cloud (KOR · Asia/Seoul)",
  locationId: "demo-home",
  locationName: "My home",
  roomId: "demo-living-room",
  roomName: "Living room",
  deviceId: "demo-rice-cooker-plug",
  deviceLabel: "우리 집 밥솥 플러그",
  deviceCategory: "SmartPlug (전력·에너지 측정 플러그)",
  profileName: "bapmunna-rice-cooker-plug-profile",
  capabilities: ["switch", "powerMeter", "energyMeter", "refresh"],
  switchState: "on",
  signalStateLabel: "켜짐 (ON) · 밥솥 취사 전력 신호 수신 완료",
  lastSignalIso: "2026-11-18T07:28:11.584Z",
  lastCheckedIso: "2026-11-18T07:42:40.000Z",
};

/**
 * [EN] Formats an ISO timestamp into Korean Standard Time (KST) display text.
 * [KR] ISO 시각 문자열을 한국 표준시(KST) 표시 문구로 변환합니다.
 */
export function formatSmartThingsKst(iso: string | null | undefined): string {
  if (!iso) return "아직 수신 기록 없음";
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return "확인 필요";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(parsed));
}

const deviceTime = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short" });
export function formatDeviceTime(time: number) { return deviceTime.format(time); }
