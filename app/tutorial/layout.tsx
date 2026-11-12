import type { ReactNode } from "react";

// 칠곡할매 권안자체 (저작권: 칠곡군). 파일 수정·재배포 금지라 눈누 CDN에서 그대로 불러온다.
// globals.css에 두면 빌드에서 빠져서, 튜토리얼에서만 여기서 선언한다.
const HALMAE_FONT = `@font-face {
  font-family: "ChilgokHalmaeKwonAnJa";
  src: url("https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2106@1.1/Chilgok_Kaj.woff") format("woff");
  font-weight: normal;
  font-display: swap;
}`;

export default function TutorialLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <style href="halmae-font" precedence="default">
        {HALMAE_FONT}
      </style>
      {children}
    </>
  );
}
