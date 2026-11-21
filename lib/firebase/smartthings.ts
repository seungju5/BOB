export type SmartThingsConnection = {
  stage: "disconnected" | "choose_device" | "subscribing" | "connected" | "reconnect_required";
  device?: { id: string; label: string } | null;
  lastSignalAt?: number | null;
  lastReceivedAt?: number | null;
  lastCheckedAt?: number | null;
};

/** The new project has no registered Samsung integration or user grants. */
export async function readSmartThingsConnection(uid: string): Promise<SmartThingsConnection> {
  if (!uid) throw new Error("내 계정으로 로그인해 주세요.");
  return { stage: "disconnected" };
}
