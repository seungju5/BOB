import type { Metadata, Viewport } from "next";
import { Gaegu } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

const gaegu = Gaegu({
  variable: "--font-gaegu",
  weight: "700",
  subsets: ["latin"],
  preload: false,
});

export const metadata: Metadata = {
  title: "밥뭇나",
  description: "밥 한 끼로 전하는 안부. 밥솥 사용 패턴으로 부모님의 식사 공백을 알려드려요.",
  appleWebApp: { capable: true, title: "밥뭇나", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#f6cd48",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" className={`${gaegu.variable} h-full antialiased`}>
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="min-h-full">
        <div className="mx-auto flex min-h-dvh w-full max-w-[440px] flex-col bg-paper shadow-[0_0_0_1px_var(--color-line)]">
          {children}
        </div>
      </body>
    </html>
  );
}
