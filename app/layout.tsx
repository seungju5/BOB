import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { RoleSwitcher } from "@/components/RoleSwitcher";
import "./globals.css";

export const metadata: Metadata = {
  title: "밥뭇나",
  description: "밥 한 끼로 전하는 안부. 밥솥 사용 패턴으로 부모님의 식사 공백을 알려드려요.",
  appleWebApp: { capable: true, title: "밥뭇나", statusBarStyle: "default" },
  icons: { icon: "/brand/rice-logo.png", apple: "/brand/rice-logo.png" },
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
