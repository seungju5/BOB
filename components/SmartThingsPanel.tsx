import Link from "next/link";

export function SmartThingsPanel() {
  return (
    <section aria-labelledby="smartthings-preparation" className="rounded-2xl border border-line bg-paper p-5">
      <h2 id="smartthings-preparation" className="text-[20px] font-bold text-cocoa">삼성 기기 연결을 준비하고 있어요</h2>
      <p className="mt-2 text-[16px] leading-relaxed text-muted">
        지금은 SmartThings 앱에서 우리 집 스마트플러그를 등록해 두세요. 밥뭇나의 연결이 열리면 여기서 함께 쓸 기기를 고를 수 있어요.
      </p>
      <Link href="/privacy" className="mt-2 inline-flex min-h-12 items-center text-[16px] font-semibold text-cocoa underline">
        기기 정보 이용 안내
      </Link>
    </section>
  );
}
