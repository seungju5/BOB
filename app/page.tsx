import { Logo } from "@/components/Mascot";
import { BunnyGreeting } from "@/components/BunnyGreeting";
import { ButtonLink } from "@/components/ui";
import Link from "next/link";

export default function StartPage() {
  return (
    <main className="flex flex-1 flex-col bg-butter">
      <div className="px-7 pt-8">
        <Logo />
      </div>

      <div className="relative flex min-h-[414px] flex-1 flex-col px-7 pt-10">
        <h1 className="animate-rise text-[44px] leading-[1.15] font-extrabold tracking-[-0.03em] text-cocoa">
          안부가
          <br />
          폴짝
          <br />
          찾아왔어요
        </h1>
        <p className="mt-auto mb-10 text-[19px] leading-relaxed text-cocoa/80">
          매일 쓰는 밥솥이
          <br />
          대신 전하는 안부
        </p>
        <BunnyGreeting className="absolute right-3 bottom-8 h-40 w-40 min-[360px]:right-6 min-[360px]:h-48 min-[360px]:w-48" />
      </div>

      <div className="rounded-t-[2.25rem] bg-paper px-6 pt-8 pb-8">
        <p className="mb-5 text-[19px] font-bold text-cocoa">밥 한 끼로 전하는 안부</p>
        <div className="flex flex-col gap-3">
          <ButtonLink href="/login" className="text-[19px]">
            보호자로 시작
          </ButtonLink>
          <ButtonLink href="/s" variant="outline" className="text-[19px]">
            어르신으로 시작
          </ButtonLink>
        </div>
        <Link href="/privacy" className="mt-5 block min-h-12 py-3 text-center text-[16px] text-muted underline underline-offset-4">개인정보 이용·제공 안내</Link>
      </div>
    </main>
  );
}
