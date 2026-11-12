import type { ReactNode } from "react";
import SetupTypography from "../guardian-setup/layout";

export default function TutorialLayout({ children }: { children: ReactNode }) {
  return <SetupTypography>{children}</SetupTypography>;
}
