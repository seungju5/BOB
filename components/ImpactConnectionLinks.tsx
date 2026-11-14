import { APP_BASE_PATH } from "@/lib/app-path";
import { IconArrowRight, IconLock, IconPlug } from "@/components/icons";

const connections = [
  {
    href: "https://impact-series.web.app/bapmunna/carer/#account",
    label: "내 계정",
    detail: "로그인 상태 확인",
    Icon: IconLock,
  },
  {
    href: "https://impact-series.web.app/bapmunna/carer/#connect",
    label: "기기 연결",
    detail: "연결 준비 상태 확인",
    Icon: IconPlug,
  },
];

export function ImpactConnectionLinks({ compact = false }: { compact?: boolean }) {
  if (APP_BASE_PATH !== "/bapmunna/app") return null;

  if (compact) {
    return (
      <section className="mt-5" aria-label="기기 연결 안내">
        <a
          href={connections[1].href}
          aria-describedby="home-connection-account-note"
          className="flex min-h-12 items-center gap-3 rounded-2xl border border-line px-4 py-3 text-[16px] font-bold text-cocoa transition-colors hover:bg-butter-soft focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cocoa"
        >
          <IconPlug className="h-5 w-5 shrink-0" />
          <span className="min-w-0 flex-1">기기 연결 준비하기</span>
          <IconArrowRight className="h-5 w-5 shrink-0" />
        </a>
        <p id="home-connection-account-note" className="mt-2 text-[16px] leading-relaxed text-muted">
          연결 화면의 계정과 기록은 이 앱과 별도로 관리돼요.
        </p>
      </section>
    );
  }

  return (
    <section className="mt-5 rounded-[1.75rem] border border-line p-5" aria-label="계정과 기기 연결">
      <h2 className="text-[17px] font-bold text-cocoa">안부를 이어볼까요?</h2>
      <p className="mt-1 text-[16px] leading-relaxed text-muted">내 계정을 확인하고 기기 연결을 준비해요.</p>
      <div className="mt-3 flex flex-col gap-2">
        {connections.map(({ href, label, detail, Icon }) => (
          <a
            key={href}
            href={href}
            className="flex min-h-16 items-center gap-3 rounded-2xl bg-butter-soft px-4 py-3 text-cocoa transition-colors hover:bg-butter focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cocoa"
          >
            <Icon className="h-5 w-5 shrink-0" />
            <span className="min-w-0 flex-1">
              <strong className="block text-[17px]">{label}</strong>
              <span className="mt-0.5 block text-[16px] text-cocoa/70">{detail}</span>
            </span>
            <IconArrowRight className="h-5 w-5 shrink-0" />
          </a>
        ))}
      </div>
    </section>
  );
}
