"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { IconArrowRight, IconPlug } from "./icons";
import { readDeviceCoach, setDeviceCoach, subscribeDeviceCoach } from "@/lib/data/setup-progress";

export function DeviceCoach({ scope }: { scope: string }) {
  const coach = useSyncExternalStore(subscribeDeviceCoach, readDeviceCoach, () => null) === scope;
  return (
    <section className="mt-5" aria-label="밥솥 기기 연결">
      {coach && (
        <div className="mb-2 flex items-center gap-2 rounded-2xl bg-cocoa px-4 py-2 text-paper">
          <span className="shrink-0 text-2xl" aria-hidden>↓</span>
          <p className="min-w-0 flex-1 text-[15px] font-bold">여기서 기기를 연결해 주세요</p>
          <button type="button" className="min-h-11 shrink-0 px-1 text-[14px] underline underline-offset-4" onClick={() => setDeviceCoach(null)}>나중에</button>
        </div>
      )}
      <Link href="/settings?section=devices#device" onClick={() => { if (coach) setDeviceCoach(null); }} className="flex min-h-16 items-center gap-3 rounded-2xl border-2 border-butter-deep bg-butter-soft px-4 py-3">
        <IconPlug className="size-6 shrink-0" />
        <span className="min-w-0 flex-1">
          <strong className="text-[17px]">기기 연결이 필요해요</strong>
          <span className="mt-0.5 block text-[14px]">준비되면 여기서 연결해요.</span>
        </span>
        <IconArrowRight className="size-5 shrink-0" />
      </Link>
    </section>
  );
}
