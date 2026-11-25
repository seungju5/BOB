import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { RoleSwitcher } from "@/components/RoleSwitcher";
import { TEAM_SITE_URL } from "@/config/team";
import "./globals.css";

const SHARE_IMAGE_URL = new URL("/brand/bapmunna-share-v2.png", TEAM_SITE_URL).href;
const SHARE_IMAGE_ALT = "밥뭇나 로고 · 밥 한 끼로 전하는 안부";

export const metadata: Metadata = {
  metadataBase: new URL(TEAM_SITE_URL),
  applicationName: "Warming Up",
  title: { default: "Warming Up", template: "%s · Warming Up" },
  description: "밥 한 끼로 전하는 안부. 밥솥 사용 패턴으로 부모님의 식사 공백을 알려드려요.",
  appleWebApp: { capable: true, title: "Warming Up", statusBarStyle: "default" },
  icons: {
    icon: "/brand/rice-logo.png",
    apple: { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
  },
  openGraph: {
    type: "website",
    url: TEAM_SITE_URL,
    locale: "ko_KR",
    siteName: "Warming Up",
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
        <div className="app-frame mx-auto flex min-h-dvh w-full max-w-[440px] flex-col bg-paper shadow-[0_0_0_1px_var(--color-line)]">
          <RoleSwitcher />
          {children}
        </div>
      </body>
    </html>
  );
}
