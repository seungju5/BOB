import Link from "next/link";
import { Logo } from "@/components/Mascot";
import { HealthPrivacyContent } from "@/components/senior/HealthPrivacyContent";
import "@/components/senior/health-guide.css";

export default function HealthPrivacyPage() {
  return <main className="bapmunna-health-guide flex flex-1 flex-col gap-5 px-[24px] py-8 text-2xl leading-relaxed text-cocoa">
    <Logo /><h1 className="mt-4 text-[30px] font-extrabold">걸음수 개인정보 안내</h1>
    <HealthPrivacyContent />
    <Link href="/health" className="mt-3 flex min-h-16 items-center justify-center rounded-full bg-cocoa px-4 py-3 font-bold text-paper">걸음수 화면으로 돌아가기</Link>
  </main>;
}
