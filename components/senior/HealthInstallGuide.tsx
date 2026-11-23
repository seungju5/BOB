import { HEALTH_WEB_URL } from "@/lib/mobile/links";
import Link from "next/link";

/** Team walking information. This component never grants OS permissions. */
export function HealthInstallGuide({ phone }: { phone: "ios" | "android" }) {
  return <section className="mt-6 rounded-3xl border-2 border-line bg-paper p-5 text-2xl leading-relaxed text-cocoa" aria-labelledby="health-install-title">
    <h2 id="health-install-title" className="text-[26px] font-extrabold">{phone === "android" ? "갤럭시 걸음 수 연결" : "아이폰 앱은 준비 중이에요"}</h2>
    {phone === "android" ? <>
      <p className="mt-3">워밍업 팀 웹앱에서 걸음 수 연결과 현재 지원 범위를 확인하세요.</p>
      <a href={HEALTH_WEB_URL} className="mt-5 flex min-h-16 items-center justify-center rounded-full bg-butter px-4 py-4 text-center font-bold text-cocoa">워밍업 걸음 수 연결 안내</a>
    </> : <>
      <p className="mt-3">아직 내려받을 수 있는 아이폰 설치 파일은 없어요. 설치 파일이 준비되면 이곳에서 안내할게요.</p>
      <p className="mt-3">아이폰에서도 로그인·튜토리얼·우리 집 입력·홈·설정을 웹으로 테스트할 수 있어요.</p>
      <Link href="/login" className="mt-5 flex min-h-16 items-center justify-center rounded-full bg-butter px-4 py-4 text-center font-bold text-cocoa">아이폰에서 웹 테스트하기</Link>
      <p className="mt-3 text-muted">로그인 화면의 ‘로그인 없이 데모로 둘러보기’를 누르면 가상 정보로 체험할 수 있어요. 실제 가족 정보는 넣지 마세요.</p>
      <p className="mt-3 text-muted">Apple 건강의 실제 걸음수 조회는 아직 지원하지 않아요. 웹을 홈 화면에 추가해도 건강 권한이 생기지 않아요.</p>
    </>}
  </section>;
}
