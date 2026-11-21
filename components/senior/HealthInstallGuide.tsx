import Link from "next/link";

export function HealthInstallGuide({ phone }: { phone: "ios" | "android" }) {
  const android = phone === "android";
  return <section className="mt-6 rounded-3xl border-2 border-line bg-paper p-5 text-2xl leading-relaxed text-cocoa" aria-labelledby="health-install-title">
    <h2 id="health-install-title" className="text-[26px] font-extrabold">{android ? "갤럭시용" : "아이폰용"} 앱을 준비하고 있어요</h2>
    <p className="mt-3">{android ? "워밍업 팀이 직접 서명한 설치 파일이 준비되면 여기에서 받을 수 있어요." : "아이폰용 앱이 준비되면 여기에서 설치 방법을 안내할게요."}</p>
    <p className="mt-3">그동안 웹에서 산책 하트를 모으고 토끼를 꾸며 볼 수 있어요. 실제 걸음 대신 예시 걸음수를 사용해요.</p>
    <Link href="/walking/demo/" className="mt-5 flex min-h-16 items-center justify-center rounded-full bg-butter px-4 py-4 text-center font-bold text-cocoa">예시 걸음으로 산책 체험하기</Link>
  </section>;
}
