"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { routePath } from "@/lib/app-path";

/** Navigation only. Login and family pairing continue to enforce data access. */
export function RoleSwitcher() {
  const path = routePath(usePathname());
  if (["/", "/login", "/tutorial", "/onboarding", "/start"].includes(path) || path.startsWith("/health")) return null;
