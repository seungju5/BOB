import { HEALTH_ANDROID_APK_URL, HEALTH_ANDROID_RELEASE_URL } from "@/lib/mobile/links";
import Link from "next/link";

/** Public beta download only. This component never grants OS permissions. */
export function HealthInstallGuide({ phone }: { phone: "ios" | "android" }) {
  return <section className="mt-6 rounded-3xl border-2 border-line bg-paper p-5 text-2xl leading-relaxed text-cocoa" aria-labelledby="health-install-title">
    <h2 id="health-install-title" className="text-[26px] font-extrabold">{phone === "android" ? "갤럭시 테스트 앱 설치" : "아이폰 앱은 준비 중이에요"}</h2>
    {phone === "android" ? <>
      <p className="mt-3">걸음수 전용 테스트 앱이에요. 아직 실제 휴대폰 검증을 마치지 않았어요.</p>
      <p className="mt-3 text-muted">Android 10 이상 · 0.2.0-test.1<br />Play 스토어 정식 배포본은 아니에요.</p>
      <a href={HEALTH_ANDROID_APK_URL} download="bapmunna-health-0.2.0-test.1.apk" className="mt-5 flex min-h-16 items-center justify-center rounded-full bg-butter px-4 py-4 text-center font-bold text-cocoa">갤럭시 테스트 앱 받기</a>
      <details className="mt-4">
        <summary className="min-h-12 cursor-pointer py-2 font-bold">설치 방법 보기</summary>
        <ol className="mt-3 list-decimal space-y-3 pl-6">
          <li>갤럭시에서 위 버튼을 누르고, 내려받은 APK 파일을 열어요.</li>
          <li>휴대폰에서 설치 허용을 물으면 이 사이트에서 받은 파일인지 확인한 뒤 직접 선택해 주세요. 설치 후에는 해당 브라우저의 설치 허용을 다시 꺼 주세요.</li>
          <li>밥뭇나를 열고 ‘걸음수 연결’을 눌러 안내와 읽기 권한을 확인해요.</li>
        </ol>
        <p className="mt-3">휴대폰이 설치나 건강 권한을 차단하면 보호 기능을 끄지 말고, 표시된 안내를 개발 담당자에게 알려 주세요.</p>
        <p className="mt-3">이전에 받은 개발용 밥뭇나가 있다면 삭제 후 설치가 필요할 수 있어요. 앱의 연결 동의는 초기화되지만 삼성 헬스의 건강 기록은 삭제하지 않아요.</p>
      </details>
      <a href={HEALTH_ANDROID_RELEASE_URL} className="mt-3 block min-h-12 py-2 text-muted underline underline-offset-4">설치 파일 정보·검증값 보기</a>
    </> : <>
      <p className="mt-3">아직 내려받을 수 있는 아이폰 설치 파일은 없어요. 설치 파일이 준비되면 이곳에서 안내할게요.</p>
      <p className="mt-3">아이폰에서도 로그인·튜토리얼·우리 집 입력·홈·설정을 웹으로 테스트할 수 있어요.</p>
      <Link href="/login" className="mt-5 flex min-h-16 items-center justify-center rounded-full bg-butter px-4 py-4 text-center font-bold text-cocoa">아이폰에서 웹 테스트하기</Link>
      <p className="mt-3 text-muted">로그인 화면의 ‘로그인 없이 데모로 둘러보기’를 누르면 가상 정보로 체험할 수 있어요. 실제 가족 정보는 넣지 마세요.</p>
      <p className="mt-3 text-muted">Apple 건강의 실제 걸음수 조회는 아직 지원하지 않아요. 웹을 홈 화면에 추가해도 건강 권한이 생기지 않아요.</p>
    </>}
  </section>;
}
