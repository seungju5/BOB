"use client";

import { RabbitBurrow } from "./RabbitBurrow";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useNow } from "@/lib/demo/store";
import { kstDate } from "@/lib/judge/time";
import { openMotionDiary, readMotionWalks, motionStepsOn } from "@/lib/walking/motion-diary";

type Props = { guardian?: boolean; demo?: boolean; owner?: string };

export function MotionSummaryLink({ guardian = false, demo = false, owner }: Props) {
  const now = useNow();
  const day = now && kstDate(now);
  const [saved, setSaved] = useState<{ owner?: string; day: string; count: number | null } | null>(null);
  useEffect(() => {
    if (!day || demo || (guardian && !owner)) return;
    let revision = 0;
    const refresh = async () => {
      const request = ++revision;
      if (document.hidden) return;
      try {
        const db = await openMotionDiary();
        try {
          const walks = await readMotionWalks(db, owner);
          if (revision === request) setSaved({ owner, day, count: motionStepsOn(walks, day) });
        } finally { db.close(); }
      } catch {
        if (revision === request) setSaved(null);
      }
    };
    void refresh();
    window.addEventListener("pageshow", refresh);
    window.addEventListener("focus", refresh);
    window.addEventListener("bapmunna:walk-saved", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      revision++;
      window.removeEventListener("pageshow", refresh);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("bapmunna:walk-saved", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [day, demo, guardian, owner]);
  const count = !demo && saved && saved.owner === owner && saved.day === day ? saved.count : null;
  const label = count === null ? "오늘의 걸음" : `오늘 ${count.toLocaleString("ko-KR")}걸음`;
  const href = demo ? "/walking/demo/" : guardian ? "/walking/steps/" : "/walking/steps/?local=1";
  if (guardian) return <Link href={href} className="rabbit-burrow-button rabbit-burrow-dock" aria-label={`오늘의 걸음 확인${count === null ? "" : ", " + count + "걸음"}`}>
    <RabbitBurrow /><span className="rabbit-burrow-label">{label}</span>
  </Link>;
  return <Link href={href} className="flex min-h-16 items-center justify-between gap-3 rounded-2xl px-3 py-2 text-cocoa hover:bg-butter-soft">
    <strong className="text-xl font-bold">{label} 확인</strong><span aria-hidden="true">›</span>
  </Link>;
}
