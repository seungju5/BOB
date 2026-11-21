import { PrivacyNotice } from "./PrivacyNotice";

export function SeniorConsentField({ checked, onChange, demo = false }: { checked: boolean; onChange: (checked: boolean) => void; demo?: boolean }) {
  if (demo) return <section aria-label="예시 정보로 체험" className="flex flex-col gap-3 rounded-2xl border-2 border-line bg-paper p-4">
    <h2 className="text-[18px] font-bold text-cocoa">예시 정보로 체험</h2>
    <label className="flex min-h-12 items-center gap-3 text-[16px] text-cocoa">
      <input type="checkbox" required checked={checked} onChange={event => onChange(event.target.checked)} className="h-6 w-6 shrink-0 accent-[var(--color-sage-deep)]" />
      가상의 가족 정보로 진행할게요.
    </label>
    <p className="text-[16px] text-muted">이 선택은 이 브라우저의 체험에만 적용돼요.</p>
  </section>;
  return <section className="flex flex-col gap-3 rounded-2xl border-2 border-line bg-paper p-4" aria-label="필수 개인정보 동의">
    <h2 className="text-[18px] font-bold text-cocoa">어르신 정보 이용 동의 · 필수</h2>
    <PrivacyNotice />
    <label className="flex min-h-12 items-start gap-3 text-[16px] leading-relaxed text-cocoa">
      <input type="checkbox" required checked={checked} onChange={event => onChange(event.target.checked)} className="mt-1 h-6 w-6 shrink-0 accent-[var(--color-sage-deep)]" />
      <span><strong>어르신께 안내하고 정보 이용 동의를 확인했어요.</strong><span className="mt-2 block">입력하는 정보·이용 목적·보관과 삭제·동의 거부 방법을 설명드렸어요.</span></span>
    </label>
    <p className="text-[16px] leading-relaxed text-muted">동의를 확인해야 어르신 정보를 저장하고 다음으로 갈 수 있어요. 기기 연결과 가족 공유 권한은 별도로 확인해요.</p>
  </section>;
}
