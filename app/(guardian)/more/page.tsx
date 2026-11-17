"use client";

import Link from "next/link";
import { ShareApp } from "@/components/ShareApp";
import { ImpactConnectionLinks } from "@/components/ImpactConnectionLinks";
import { Logo, Mascot } from "@/components/Mascot";
import { IconArrowRight, IconBell, IconChart, IconSettings } from "@/components/icons";
import { useApp } from "@/lib/data/useApp";
import { unackedAlerts } from "@/lib/data/view";

export default function MorePage() {
  const { view } = useApp();
  const count = view ? unackedAlerts(view).length : 0;
  return <main className="flex flex-1 flex-col px-6 py-6">
    <Logo />
    <h1 className="mt-7 text-[30px] font-extrabold text-cocoa">필요할 때, 여기서</h1>
    <p className="mt-2 text-muted">가족의 안부를 편하게 살펴보세요.</p>
    <div className="mt-6 overflow-hidden rounded-[1.75rem] border border-line">
      {[
        { href: view?.mode === 'demo' ? '/walking/demo' : '/walking', label: '산책·걸음수 랭킹', detail: '식후 산책 알림과 함께 걷는 오늘의 순위', Icon: IconChart },
        { href: '/power', label: '밥솥 소식', detail: '밥솥의 작은 소식을 편하게 살펴봐요', Icon: IconChart },
        { href: "/alerts", label: "받은 알림", detail: count ? `확인할 소식 ${count}개` : "지나간 소식도 함께 봐요", Icon: IconBell },
        { href: "/report", label: "패턴 리포트", detail: "평소와 어떻게 달라졌는지 살펴요", Icon: IconChart },
        { href: "/settings", label: "생활·알림 설정", detail: "식사 시간, 가족 연결과 계정", Icon: IconSettings },
      ].map(({ href, label, detail, Icon }) => <Link key={href} href={href} className="flex min-h-24 items-center gap-4 border-b border-line px-5 py-5 last:border-0 hover:bg-butter-soft">
        <Icon className="h-6 w-6 shrink-0 text-cocoa" />
        <span className="flex-1"><strong className="block text-[18px] text-cocoa">{label}</strong><span className="mt-1 block text-[16px] text-muted">{detail}</span></span>
        <IconArrowRight className="h-5 w-5 shrink-0 text-muted" />
      </Link>)}
    </div>
    <ImpactConnectionLinks />
    <ShareApp />
    <Mascot className="mx-auto mt-auto h-32 w-32 pt-6" />
    <p className="text-center text-[16px] text-muted">밥 한 끼로 전하는 안부</p>
  </main>;
}
