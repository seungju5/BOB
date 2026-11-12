import localFont from "next/font/local";
import type { ReactNode } from "react";

const heading = localFont({
  src: "./fonts/KakaoBigSans-Bold.ttf",
  weight: "700",
  variable: "--setup-heading-font",
  display: "swap",
  adjustFontFallback: false,
});

const body = localFont({
  src: "./fonts/KakaoSmallSans-Regular.ttf",
  weight: "400",
  display: "swap",
  adjustFontFallback: false,
});

export default function GuardianSetupLayout({ children }: { children: ReactNode }) {
  return (
    <div className={heading.variable + " " + body.className + " flex flex-1 flex-col [&_h1]:font-[family-name:var(--setup-heading-font)] [&_strong]:font-[family-name:var(--setup-heading-font)]"}>
      {children}
    </div>
  );
}
