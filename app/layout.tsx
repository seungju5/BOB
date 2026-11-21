import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { RoleSwitcher } from "@/components/RoleSwitcher";
import { APP_BASE_PATH, appPath } from "@/lib/app-path";
import { publicUrl } from "@/lib/deployment";
import "./globals.css";

const SHARE_IMAGE_URL = publicUrl("/assets/bapmunna-share-v2.png?v=20261114");
const SHARE_IMAGE_ALT = "밥뭇나 로고 · 밥 한 끼로 전하는 안부";

export const metadata: Metadata = {
  title: "밥뭇나",
  description: "밥 한 끼로 전하는 안부. 밥솥 사용 패턴으로 부모님의 식사 공백을 알려드려요.",
  appleWebApp: { capable: true, title: "밥뭇나", statusBarStyle: "default" },
  icons: { icon: appPath("/brand/rice-logo.png"), apple: appPath("/brand/rice-logo.png") },
  openGraph: {
    type: "website",
    ...(APP_BASE_PATH === "/bapmunna/app" ? { url: publicUrl("/app") } : {}),
    locale: "ko_KR",
    siteName: "밥뭇나",
    title: "밥뭇나 · 밥 한 끼로 전하는 안부",
    description: "안부가 폴짝 찾아왔어요. 매일 쓰는 밥솥이 대신 전하는 안부를 만나보세요.",
    images: [{ url: SHARE_IMAGE_URL, secureUrl: SHARE_IMAGE_URL, type: "image/png", width: 1200, height: 630, alt: SHARE_IMAGE_ALT }],
  },
  twitter: {
    card: "summary_large_image",
    title: "밥뭇나 · 밥 한 끼로 전하는 안부",
    description: "매일 쓰는 밥솥이 대신 전하는 안부",
    images: [{ url: SHARE_IMAGE_URL, alt: SHARE_IMAGE_ALT }],
  },
};

export const viewport: Viewport = {
  themeColor: "#f8d14a",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full">
        <div className="mx-auto flex min-h-dvh w-full max-w-[440px] flex-col bg-paper shadow-[0_0_0_1px_var(--color-line)]">
          <RoleSwitcher />
          {children}
        </div>
      </body>
    </html>
  );
}
