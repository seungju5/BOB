/** Enable when the team's authenticated walking API is deployed on its Hosting origin. */
export const WALKING_SHARING_READY = false;

export function requireWalkingSharing() {
  if (!WALKING_SHARING_READY) {
    throw Object.assign(new Error("팀 걸음수 연결을 준비하고 있어요."), { code: "setup_required" });
  }
}
