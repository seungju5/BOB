"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { routePath } from "@/lib/app-path";

/** Navigation only. Login and family pairing continue to enforce data access. */
export function RoleSwitcher() {
  const path = routePath(usePathname());
  if (["/", "/admin", "/login", "/tutorial", "/onboarding", "/start", "/power"].includes(path) || path.startsWith("/health") || path.startsWith("/walking") || path.startsWith("/auth/")) return null;
  const senior = path === "/s";
  return (
    <nav aria-label="사용 화면 전환" className="mx-6 mt-4 grid grid-cols-2 rounded-2xl border border-line bg-butter-soft/50 p-1 text-[16px] font-bold">
      {[{ href: "/s", label: "어르신용", active: senior }, { href: senior ? "/start" : path, label: "보호자용", active: !senior }].map(item => (
        <Link key={item.label} href={item.href} aria-current={item.active ? "page" : undefined} className={`flex min-h-12 items-center justify-center gap-2 rounded-xl ${item.active ? "bg-butter text-cocoa" : "text-muted"}`}>
          {item.active ? <span aria-hidden>✓</span> : null}{item.label}
        </Link>
      ))}
    </nav>
  );
}
