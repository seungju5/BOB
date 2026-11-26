import Link from "next/link";

export function HealthInstallGuide({ phone }: { phone: "ios" | "android" }) {
  const android = phone === "android";
  return <section className="mt-6 rounded-3xl border-2 border-line bg-paper p-5 text-2xl leading-relaxed text-cocoa" aria-labelledby="health-install-title">
    <h2 id="health-install-title" className="text-[26px] font-extrabold">{android ? "갤럭시용" : "아이폰용"} 앱을 준비하고 있어요</h2>
    <p className="mt-3">{android ? "삼성 헬스" : "Apple 건강"}의 하루 합계는 설치형 앱에서 연결해요.</p>
    {android && <p className="mt-3">팀이 직접 서명한 설치 파일을 이곳에 공개할 예정이에요.</p>}
    <Link href="/walking/demo/" className="mt-5 flex min-h-16 items-center justify-center rounded-full bg-butter px-4 py-4 text-center font-bold text-cocoa">예시 걸음으로 산책 체험하기</Link>
  </section>;
}
