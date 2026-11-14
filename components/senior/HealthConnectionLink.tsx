import Link from "next/link";

/** Instructions only: following this link never requests health data. */
export function HealthConnectionLink() {
  return <Link href="/health" className="mt-4 flex min-h-16 items-center justify-between gap-3 rounded-3xl border border-line bg-paper px-5 py-4 text-2xl font-bold text-cocoa">
    <span>내 휴대폰 걸음수 연결</span><span aria-hidden>→</span>
  </Link>;
}
