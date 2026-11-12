"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { routePath } from "@/lib/app-path";
import { useApp } from "@/lib/data/useApp";
import { unackedAlerts } from "@/lib/data/view";
import { IconClock, IconHome, IconSettings } from "./icons";

const items = [
  { href: "/home", label: "홈", Icon: IconHome },
  { href: "/records", label: "기록", Icon: IconClock },
  { href: "/more", label: "더보기", Icon: IconSettings },
];

export function BottomNav() {
  const path = routePath(usePathname());
  const { view } = useApp();
  const badge = view ? unackedAlerts(view).length : 0;
  return (
    <nav aria-label="주요 메뉴" className="sticky bottom-0 z-40 mt-auto border-t border-line bg-paper/95 backdrop-blur">
      <ul className="grid grid-cols-3 px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {items.map(({ href, label, Icon }) => {
          const active = path === href || (href === "/more" && ["/report", "/alerts", "/settings"].includes(path));
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`relative flex flex-col items-center gap-1 rounded-2xl py-1.5 text-xs font-semibold ${
                  active ? "text-cocoa" : "text-muted"
                }`}
              >
                <span className={`grid h-8 w-12 place-items-center rounded-full ${active ? "bg-butter" : ""}`}>
                  <Icon className="h-5 w-5" />
                </span>
                {label}
                {href === "/more" && badge > 0 ? (
                  <span className="absolute top-0 right-3 grid h-5 min-w-5 place-items-center rounded-full bg-blush-deep px-1 text-[11px] text-paper">
                    {badge}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
