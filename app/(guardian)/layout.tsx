import type { ReactNode } from "react";
import { BottomNav } from "@/components/BottomNav";
import { GuardianGate } from "@/components/GuardianGate";

export default function GuardianLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <GuardianGate>{children}</GuardianGate>
      <BottomNav />
    </>
  );
}
