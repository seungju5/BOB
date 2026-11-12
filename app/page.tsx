import { Logo } from "@/components/Mascot";
import { BunnyGreeting } from "@/components/BunnyGreeting";
import { ButtonLink } from "@/components/ui";

export default function StartPage() {
  return (
    <main className="flex flex-1 flex-col bg-butter">
      <div className="px-7 pt-8">
        <Logo wordmarkOnly />
      </div>

      <div className="flex flex-1 flex-col px-7 pt-7">
        <h1 className="animate-rise text-[44px] leading-[1.15] font-extrabold tracking-[-0.03em] text-cocoa">
          오늘도
          <br />
          밥은
          <br />
          드셨을까요?
        </h1>
        <div className="mt-auto flex min-h-44 items-end justify-between gap-1 pb-6">
          <p className="pb-3 text-[19px] leading-relaxed text-cocoa/80">
            매일 쓰는 밥솥이
            <br />
            대신 전하는 안부
          </p>
          <BunnyGreeting className="relative h-[clamp(7rem,37vw,10rem)] w-[clamp(7rem,37vw,10rem)] shrink-0" />
        </div>
      </div>

      <div className="rounded-t-[2.25rem] bg-paper px-6 pt-8 pb-8">
        <p className="mb-5 text-[19px] font-bold text-cocoa">밥 한 끼로 전하는 안부</p>
        <div className="flex flex-col gap-3">
          <ButtonLink href="/s" className="text-[19px]">
            어르신으로 시작
          </ButtonLink>
          <ButtonLink href="/guardian-setup" variant="outline" className="text-[19px]">
            보호자로 시작
          </ButtonLink>
          <ButtonLink href="/tutorial" variant="ghost" className="min-h-12 text-[16px] underline underline-offset-4">
            앱 안내 다시 보기
          </ButtonLink>
        </div>
        {/* 약관 페이지가 생기면 링크로 바꾼다 (튜토리얼 첫 장과 같은 문구) */}
        <p className="mt-5 text-center text-sm text-muted underline underline-offset-4">개인정보 처리방침 · 이용약관</p>
      </div>
    </main>
  );
}
