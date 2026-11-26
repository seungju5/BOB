"use client";

import Link from "next/link";
import { ShareApp } from "@/components/ShareApp";
import { ImpactConnectionLinks } from "@/components/ImpactConnectionLinks";
import { Logo, Mascot } from "@/components/Mascot";
import { IconArrowRight, IconBell, IconChart, IconSettings } from "@/components/icons";
import { useApp } from "@/lib/data/useApp";

export default function MorePage() {
  const { view, operator } = useApp();
  return <main className="flex flex-1 flex-col px-6 py-6">
    <Logo />
    <h1 className="mt-7 text-[30px] font-extrabold text-cocoa">더보기</h1>
    <div className="mt-6 overflow-hidden rounded-[1.75rem] border border-line">
      {[
        { href: view?.mode === 'demo' ? '/walking/demo' : '/walking/#trail', label: '워밍이의 산책', Icon: IconChart },
        { href: "/alerts", label: "받은 알림", Icon: IconBell },
        { href: "/report", label: "패턴 리포트", Icon: IconChart },
        { href: "/settings", label: "생활 알림 설정", Icon: IconSettings },
      ].map(({ href, label, Icon }) => <Link key={href} href={href} className="flex min-h-16 items-center gap-4 border-b border-line px-5 py-4 last:border-0 hover:bg-butter-soft">
        <Icon aria-hidden className="h-6 w-6 shrink-0 text-cocoa" />
        <strong className="flex-1 text-[18px] text-cocoa">{label}</strong>
        <IconArrowRight className="h-5 w-5 shrink-0 text-muted" />
      </Link>)}
    </div>
    {operator && <Link href="/admin/" className="mt-4 flex min-h-12 items-center gap-3 rounded-2xl border border-line px-4 py-3 font-bold text-cocoa"><IconChart className="h-5 w-5"/>팀 운영 스튜디오</Link>}
    <ImpactConnectionLinks />
    <ShareApp />
    <Mascot className="mx-auto mt-auto h-32 w-32 pt-6" />
  </main>;
}
