import { Logo, Mascot } from "@/components/Mascot";
import { ButtonLink } from "@/components/ui";

export default function StartPage() {
  return (
    <main className="flex flex-1 flex-col bg-butter">
      <div className="px-7 pt-8">
        <Logo />
      </div>

      <div className="relative flex flex-1 flex-col px-7 pt-10">
        <h1 className="animate-rise text-[44px] leading-[1.15] font-extrabold tracking-[-0.03em] text-cocoa">
          안부가
          <br />
          폴짝,
          <br />
          찾아왔어요.
        </h1>
        <p className="mt-auto mb-10 text-[19px] leading-relaxed text-cocoa/80">
          매일 쓰는 밥솥이
          <br />
          대신 전하는 안부
        </p>
        <Mascot className="animate-bob absolute right-4 bottom-4 h-44 w-44" mood="wink" />
      </div>

      <div className="rounded-t-[2.25rem] bg-paper px-6 pt-8 pb-8">
        <p className="mb-5 text-[19px] font-bold text-cocoa">밥 한 끼로 전하는 안부</p>
        <div className="flex flex-col gap-3">
          <ButtonLink href="/s" className="text-[19px]">
            어르신으로 시작
          </ButtonLink>
          <ButtonLink href="/tutorial" variant="outline" className="text-[19px]">
            보호자로 시작
          </ButtonLink>
        </div>
        <p className="mt-5 text-center text-sm text-muted">서로의 하루에, 작은 온기를.</p>
      </div>
    </main>
  );
}
