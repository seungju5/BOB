import { HOUSEHOLD_STEP, tutorialExitPath, type AppActions } from "@/lib/data/view";

/** 저장이 실패하면 이동하지 않는다. 다시보기로 이미 저장한 단계가 뒤로 가지 않는다. */
export async function completeTutorial(savedStep: number, actions: Pick<AppActions, "saveOnboarding">) {
  if (savedStep < HOUSEHOLD_STEP) await actions.saveOnboarding(HOUSEHOLD_STEP, {});
  return tutorialExitPath(savedStep);
}
