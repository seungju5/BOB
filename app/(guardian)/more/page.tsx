"use client";

import Link from "next/link";
import { ShareApp } from "@/components/ShareApp";
import { ImpactConnectionLinks } from "@/components/ImpactConnectionLinks";
import { Logo, Mascot } from "@/components/Mascot";
import { IconArrowRight, IconBell, IconChart, IconSettings } from "@/components/icons";
import { useApp } from "@/lib/data/useApp";
import { unackedAlerts } from "@/lib/data/view";

export default function MorePage() {
  const { view, operator } = useApp();
  const count = view ? unackedAlerts(view).length : 0;
  return <main className="flex flex-1 flex-col px-6 py-6">
    <Logo />
    <h1 className="mt-7 text-[30px] font-extrabold text-cocoa">더보기</h1>
    <div className="mt-6 overflow-hidden rounded-[1.75rem] border border-line">
      {[
        { href: view?.mode === 'demo' ? '/walking/demo' : '/walking', label: '워밍이의 산책', detail: view?.mode === 'demo' ? '예시 산책 하트와 가족 응원' : '내 걸음을 측정하고 워밍이 옷장을 열어요', Icon: IconChart },
        { href: "/alerts", label: "받은 알림", detail: count ? `확인할 소식 ${count}개` : null, Icon: IconBell },
        { href: "/report", label: "패턴 리포트", detail: null, Icon: IconChart },
        { href: "/settings", label: "생활·알림 설정", detail: "식사 시간, 가족 연결과 계정", Icon: IconSettings },
      ].map(({ href, label, detail, Icon }) => <Link key={href} href={href} className="flex min-h-24 items-center gap-4 border-b border-line px-5 py-5 last:border-0 hover:bg-butter-soft">
        <Icon className="h-6 w-6 shrink-0 text-cocoa" />
        <span className="flex-1"><strong className="block text-[18px] text-cocoa">{label}</strong>{detail && <span className="mt-1 block text-[16px] text-muted">{detail}</span>}</span>
        <IconArrowRight className="h-5 w-5 shrink-0 text-muted" />
      </Link>)}
    </div>
    {operator && <Link href="/admin/" className="mt-4 flex min-h-12 items-center gap-3 rounded-2xl border border-line px-4 py-3 font-bold text-cocoa"><IconChart className="h-5 w-5"/>팀 운영 스튜디오</Link>}
    <ImpactConnectionLinks />
    <ShareApp />
    <Mascot className="mx-auto mt-auto h-32 w-32 pt-6" />
  </main>;
}
