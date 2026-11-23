import Link from "next/link";
import { Logo } from "@/components/Mascot";
import { PrivacyContent } from "@/components/privacy/PrivacyContent";

export const metadata = { title: "개인정보 이용·제공 안내 | 밥뭇나" };

export default function PrivacyPage() {
  return <main className="flex flex-1 flex-col gap-6 bg-paper px-6 py-8">
    <Logo />
    <h1 className="text-[30px] font-extrabold leading-snug text-cocoa">개인정보 이용·제공 안내</h1>
    <p className="text-[18px] leading-relaxed text-muted">로그인 없이 앱 안에서 읽을 수 있어요.</p>
    <PrivacyContent />
    <Link href="/" className="flex min-h-14 items-center justify-center rounded-full bg-cocoa px-5 py-4 text-[18px] font-bold text-paper">밥뭇나 첫 화면으로</Link>
  </main>;
}
