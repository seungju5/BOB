import { PRIVACY_NOTICE_DATE, PRIVACY_SUPPORT_EMAIL } from "@/lib/privacy/notice";

/** The public page and the in-form reader deliberately share the same copy. */
export function PrivacyContent() {
  return <div className="flex flex-col gap-6 text-[18px] leading-relaxed text-cocoa">
    <p className="text-[16px] text-muted">밥뭇나 테스트 버전 · {PRIVACY_NOTICE_DATE} 안내</p>
    <section className="rounded-2xl bg-butter-soft p-5">
      <h2 className="text-[21px] font-bold">동의는 직접 선택해요</h2>
      <p className="mt-3">어르신 정보를 저장하기 전에 아래 내용을 어르신께 설명하고 동의를 확인해 주세요. 보호자가 체크했다고 어르신 본인 확인이나 삼성 계정 연결이 끝나는 것은 아니에요.</p>
      <p className="mt-3">동의하지 않으면 어르신 정보 저장·기기 연결·소식 공유를 진행하지 않아요. 개인정보 안내와 가상 정보로 하는 예시 체험은 이용할 수 있어요.</p>
    </section>
    <section>
      <h2 className="text-[21px] font-bold">1. 어떤 정보를 왜 쓰나요?</h2>
      <dl className="mt-3 space-y-4">
        <div><dt className="font-bold">회원 정보</dt><dd>계정 식별값, 이메일, 표시 이름, 가입·이용 시각, 동의 확인 기록을 로그인과 운영 문의 처리에 사용해요. 비밀번호는 인증 서비스가 관리해요.</dd></div>
        <div><dt className="font-bold">우리 집 정보와 생활 기준</dt><dd>어르신 성함 또는 별칭, 호칭, 거주 인원, 반려견 여부, 식사 시간과 밥솥 사용·알림 설정을 본인 계정에 저장해요. 전화 연결에 쓸 연락처는 선택 입력이에요.</dd></div>
        <div><dt className="font-bold">기기 정보</dt><dd>실제 연결 시 삼성에서 허용한 기기 목록을 읽고, 선택한 플러그의 이름·식별값·신호 확인 시각을 이용해요. 연결 열쇠는 서버에서 암호화해 보관해요. 원시 전력값을 가족 화면에 보여주지 않아요.</dd></div>
      </dl>
      <p className="mt-4">밥솥 사용만으로 실제 식사 여부나 건강 상태를 단정하지 않아요. 카메라·마이크·위치 정보는 수집하지 않아요.</p>
    </section>
    <section>
      <h2 className="text-[21px] font-bold">2. 누가 볼 수 있나요?</h2>
      <p className="mt-3">입력한 가구와 생활 설정은 본인 계정에서 확인해요. 운영 담당자는 계정 기본정보와 문의를 위한 운영 메모를 확인할 수 있어요. 현재 공개 테스트 앱은 계정과 설정 저장에 Firebase를 이용해요.</p>
      <p className="mt-3">현재 공개 테스트에서는 실제 어르신 기록을 보호자에게 자동 전송하지 않아요. 가족 공유를 시작할 때에는 받을 사람·제공 항목·목적·보관 기간을 별도로 안내하고 동의를 받아야 해요. 이 체크만으로 향후 가족 공유까지 동의한 것으로 처리하지 않아요.</p>
    </section>
    <section>
      <h2 className="text-[21px] font-bold">3. 걸음수는 별도로 허용해요</h2>
      <p className="mt-3">설치 앱에서 별도의 안내와 휴대폰 읽기 권한을 허용한 경우에만 오늘의 걸음수를 읽어요. 읽기 동의만으로는 서버에 보내지 않아요.</p>
      <p className="mt-3">랭킹은 별도로 참여하고 휴대폰에서도 공유에 동의해야 해요. 이때 별명과 한국 시간 기준 오늘 걸음수 합계를 서버에 저장하며, 전체 랭킹 참여자가 별명·걸음수·순위를 볼 수 있어요. 실명·이메일·혈당·위치·개별 걸음 기록은 공개하지 않아요.</p>
      <p className="mt-3">지난날 합계는 오늘 순위에서 제외하고 다음 갱신이나 정리 작업 때 지워요. 별명은 참여하는 동안 보관하며, 랭킹 메뉴에서 참여를 그만하면 별명·합계·휴대폰 연결을 지워요. 산책 알림 시각은 휴대폰에만 보관해요.</p>
      <p className="mt-3">건강 연결을 해제하면 화면의 걸음수와 앱의 조회 동의를 지워요. 휴대폰 건강 기록 자체는 삭제하지 않아요. OS의 읽기 권한은 건강 앱 설정에서 따로 해제할 수 있어요.</p>
    </section>
    <section>
      <h2 className="text-[21px] font-bold">4. 보관과 삭제는 어떻게 하나요?</h2>
      <p className="mt-3">회원·가구·생활 설정은 현재 계정에 저장돼요. 테스트 버전에는 정해진 기간 뒤 자동으로 지우는 기능이나 앱 안의 회원 탈퇴 기능이 아직 없어요. 보관 기간이 확정되면 이 안내에 반영할게요.</p>
      <p className="mt-3">정보 확인·수정·동의 철회·삭제를 원하면 아래 운영팀 이메일로 요청해 주세요. 로그아웃이나 준비 동의 취소만으로 계정 정보가 삭제되지는 않아요.</p>
      <p className="mt-3">정보 이용 동의 확인을 취소하면 새로운 삼성 기기 소식을 읽거나 저장하지 않아요. 암호화된 연결 열쇠와 기기 연결 정보는 연결 해제 전까지 남아 있어요. 연결 화면에서 해제하면 이 정보를 지워요. 삼성 쪽 서비스 권한은 SmartThings 앱에서 별도로 해제해 주세요.</p>
    </section>
    <section className="rounded-2xl border border-line p-5">
      <h2 className="text-[21px] font-bold">5. 운영팀에 문의하기</h2>
      <a className="mt-3 block min-h-12 break-all py-2 font-bold underline underline-offset-4" href={`mailto:${PRIVACY_SUPPORT_EMAIL}`}>{PRIVACY_SUPPORT_EMAIL}</a>
      <p className="mt-2">가입한 이메일과 요청 내용을 알려 주세요. 비밀번호·인증번호·삼성 연결 열쇠·건강 기록은 보내지 마세요.</p>
    </section>
  </div>;
}
