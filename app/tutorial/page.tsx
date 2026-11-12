"use client";

import { useRouter } from "next/navigation";
import { GuardianTutorial } from "@/components/GuardianTutorial";
import { useApp } from "@/lib/data/useApp";
import { rememberIntroSeen } from "@/lib/data/setup-progress";

export default function TutorialPage() {
  const router = useRouter();
  const { view, ownerId } = useApp();
  const setupDone = (view?.onboardingStep ?? 0) > 7;
  const exit = () => {
    if (setupDone) router.replace("/home");
    else {
      if (view) rememberIntroSeen(ownerId);
      router.replace("/guardian-setup");
    }
  };
  return (
    <main className="flex flex-1 flex-col bg-cream px-4 py-5 text-cocoa">
      <GuardianTutorial onComplete={exit} exitLabel={setupDone ? "홈으로 돌아가기" : view ? "우리 집 알려주기" : "보호자로 시작하기"} />
    </main>
  );
}
