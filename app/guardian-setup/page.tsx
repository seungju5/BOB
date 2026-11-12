import type { Metadata } from "next";
import { GuardianSetup } from "./GuardianSetup";

export const metadata: Metadata = { title: "보호자 시작하기 | 밥뭇나" };

export default function Page() {
  return <GuardianSetup />;
}
