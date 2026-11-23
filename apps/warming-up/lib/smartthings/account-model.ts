/** Shared sample labels for the explicitly selected device demo. */
export const DEMO_SMARTTHINGS_PROFILE = {
  deviceId: "demo-rice-cooker",
  deviceLabel: "예시 밥솥 플러그",
  locationName: "예시 가정",
  roomName: "주방",
} as const;

export function formatSmartThingsKst(iso: string | null): string {
  if (!iso) return "아직 기록이 없어요";
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return "시각 확인 필요";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", dateStyle: "short", timeStyle: "short",
  }).format(time);
}
