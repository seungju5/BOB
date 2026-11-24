import { PRIVACY_NOTICE_DATE, PRIVACY_SUPPORT_EMAIL } from "@/lib/privacy/notice";
import { DETECTION } from "@/config/detection";

/** The public page and the in-form reader deliberately share the same copy. */
export function PrivacyContent() {
  return <div className="flex flex-col gap-6 text-[18px] leading-relaxed text-cocoa">
    <p className="text-[16px] text-muted">워밍업 팀 · 밥뭇나 테스트 버전 · {PRIVACY_NOTICE_DATE} 안내</p>
    <section className="rounded-2xl bg-butter-soft p-5">
      <h2 className="text-[21px] font-bold">동의는 직접 선택해요</h2>
      <p className="mt-3">어르신 정보를 저장하기 전에 아래 내용을 어르신께 설명하고 동의를 확인해 주세요. 보호자가 체크했다고 어르신 본인 확인이나 삼성 계정 연결이 끝나는 것은 아니에요.</p>
      <p className="mt-3">동의하지 않으면 어르신 정보 저장·기기 연결·소식 공유를 진행하지 않아요. 개인정보 안내와 가상 정보로 하는 예시 체험은 이용할 수 있어요.</p>
    </section>
    <section>
      <h2 className="text-[21px] font-bold">1. 어떤 정보를 왜 쓰나요?</h2>
      <dl className="mt-3 space-y-4">
        <div><dt className="font-bold">회원 정보</dt><dd>계정 식별값, 이메일, 표시 이름, 가입·이용 시각, 동의 확인 기록을 로그인과 운영 문의 처리에 사용해요. 등록된 팀 운영자는 가입 상태와 보호자 이름, 가구·생활 설정의 저장 시각을 확인하고 운영 문의를 처리해요. 비밀번호는 인증 서비스가 관리해요.</dd></div>
        <div><dt className="font-bold">우리 집 정보와 생활 기준</dt><dd>어르신 성함 또는 별칭, 호칭, 거주 인원, 반려견 여부, 식사 시간과 밥솥 사용·알림 설정을 본인 계정에 저장해요. 전화 연결에 쓸 연락처는 선택 입력이에요.</dd></div>
        <div><dt className="font-bold">선택 기능인 삼성 기기 연결</dt><dd>밥뭇나는 기기를 연결하지 않고도 이용할 수 있어요. 연결 화면에 ‘준비 중’이라고 나오면 아직 삼성 연결을 시작할 수 없어요.</dd></div>
      </dl>
      <p className="mt-4">밥솥 사용만으로 실제 식사 여부나 건강 상태를 단정하지 않아요. 카메라·마이크·위치 정보는 수집하지 않아요.</p>
    </section>
    <section>
      <h2 className="text-[21px] font-bold">2. 삼성 기기를 연결하면 무엇을 읽나요?</h2>
      <p className="mt-3">보호자가 밥뭇나에 로그인한 뒤, 원하는 경우에만 기기 읽기에 별도로 동의해요. 삼성 로그인 화면에서 접근을 허용하고 전력을 확인할 기기 한 대를 고르세요. 밥뭇나는 선택한 기기의 상태를 읽고 기기 알림을 받아요. 연결 권한은 읽기 전용이에요.</p>
      <p className="mt-3">팀 서버는 삼성의 접근·갱신 토큰을 암호화해 해당 밥뭇나 계정과 연결해 보관해요. 선택한 기기의 식별값·이름, 연결 동의와 상태, 최근 조회·신호 시각도 보관해요. 가상 기기의 값은 테스트용이에요.</p>
      <p className="mt-3">기기를 직접 조회하면 실물 플러그의 측정이 취사 기준에 해당하는지와 측정 시각을 보여줘요. 원래 전력값은 판정 뒤 버려요. 삼성의 측정 시각, 밥뭇나가 자동 신호를 받은 시각, 직접 조회한 시각은 따로 표시해요.</p>
      <p className="mt-3">‘밥솥 취사 신호 알림’을 켜면 지정한 밥솥 전용 플러그에서 취사 기준에 도달한 첫 신호를 알려줘요. 계정에는 중복을 구분하는 데 필요한 시각과 최근 알림 시각을 보관해요. 홈과 알림에는 최근 24시간의 마지막 소식 한 건을 표시해요. 알림을 끄거나 연결을 지우면 해당 설정과 신호 시각도 지워요.</p>
      <p className="mt-3">정기 조회를 켜면 지정한 실물 플러그를 {DETECTION.POWER_CHECK_INTERVAL_MIN}분마다 확인해요. 서버에 남는 것은 조회와 측정 시각이에요. 전력 원값은 판정 뒤 버려요. 기존 알림을 쓰시는 분은 기기 설정에서 정기 조회를 따로 켤 수 있어요.</p>
      <p className="mt-3">개인 점검 파일을 열면 브라우저에서 기기 종류, 신호 해석과 측정·조회 시각을 볼 수 있어요. 파일은 서버에 전송하지 않으며, 창을 닫으면 화면의 기록을 지워요.</p>
    </section>
    <section>
      <h2 className="text-[21px] font-bold">3. 누가 볼 수 있나요?</h2>
      <p className="mt-3">워밍업 팀은 밥뭇나 전용 Firebase 프로젝트에서 회원 계정과 설정을 관리해요. 앱에서는 로그인한 본인만 자기 가구의 설정과 연결 정보를 볼 수 있어요. 권한을 가진 팀 운영 담당자는 서비스 운영과 문의 처리를 위해 필요한 정보를 확인할 수 있어요.</p>
      <p className="mt-3">현재 공개 테스트에서는 실제 어르신 기록을 보호자에게 자동 전송하지 않아요. 가족 공유를 시작할 때에는 받을 사람·제공 항목·목적·보관 기간을 별도로 안내하고 동의를 받아야 해요. 이 체크만으로 향후 가족 공유까지 동의한 것으로 처리하지 않아요.</p>
    </section>
    <section>
      <h2 className="text-[21px] font-bold">4. 걸음수는 별도로 허용해요</h2>
      <p className="mt-3">현재 웹앱의 예시 산책은 휴대폰 건강 기록을 읽거나 전송하지 않아요. 아래는 설치 앱을 사용해 걸음수 연결을 선택할 때의 안내예요.</p>
      <p className="mt-3">설치 앱에서 별도의 안내와 휴대폰 읽기 권한을 허용한 경우에만 오늘의 걸음수를 읽어요. 읽기 동의만으로는 서버에 보내지 않아요.</p>
      <p className="mt-3">랭킹은 별도로 참여하고 휴대폰에서도 공유에 동의해야 해요. 이때 별명과 한국 시간 기준 오늘 걸음수 합계를 서버에 저장하며, 전체 랭킹 참여자가 별명·걸음수·순위를 볼 수 있어요. 실명·이메일·혈당·위치·개별 걸음 기록은 공개하지 않아요.</p>
      <p className="mt-3">지난날 합계는 오늘 순위에서 제외하고 다음 갱신이나 정리 작업 때 지워요. 별명은 참여하는 동안 보관하며, 랭킹 메뉴에서 참여를 그만하면 별명·합계·휴대폰 연결을 지워요. 산책 알림 시각은 휴대폰에만 보관해요.</p>
      <p className="mt-3">건강 연결을 해제하면 화면의 걸음수와 앱의 조회 동의를 지워요. 휴대폰 건강 기록 자체는 삭제하지 않아요. OS의 읽기 권한은 건강 앱 설정에서 따로 해제할 수 있어요.</p>
    </section>
    <section>
      <h2 className="text-[21px] font-bold">5. 보관과 삭제는 어떻게 하나요?</h2>
      <p className="mt-3">회원·가구·생활 설정은 현재 계정에 저장돼요. 테스트 버전에는 정해진 기간 뒤 자동으로 지우는 기능이나 앱 안의 회원 탈퇴 기능이 아직 없어요. 보관 기간이 확정되면 이 안내에 반영할게요.</p>
      <p className="mt-3">정보 확인·수정·동의 철회·삭제를 원하면 아래 운영팀 이메일로 요청해 주세요. 로그아웃이나 준비 동의 취소만으로 계정 정보가 삭제되지는 않아요.</p>
      <p className="mt-3">설정의 기기 메뉴에서 어르신 정보 이용 동의를 취소하면 새 어르신 정보 저장을 멈춰요. 동의 철회가 저장되면 기기 상태 조회와 새 신호 기록도 멈추고, 홈에서 마지막 기기 정보가 사라져요.</p>
      <p className="mt-3">삼성과의 연결도 지우려면 기기 화면에서 ‘연결 해제’를 선택해 주세요. 해제에 성공하면 삼성 기기 알림 구독을 해제하고 밥뭇나 서버에서 해당 기기 연결과 저장된 토큰을 삭제해요. 이미 권한이 만료된 경우에는 SmartThings에서 밥뭇나 접근 권한을 해제한 뒤 앱 안내에 따라 기존 연결을 지워 주세요.</p>
    </section>
    <section>
      <h2 className="text-[21px] font-bold">이 기기의 안부 알림</h2>
      <p className="mt-3">보호자가 알림을 켠 기기에서만 소식을 받아요. 잠금화면에는 기본으로 새 소식이 있다는 문구가 보여요. 알림함에서 소식 종류 표시를 켜거나 끌 수 있어요.</p>
      <p className="mt-3">홈 화면 알림을 연결하면 팀 발송 서버는 이 계정의 기기 구독 주소와 발송에 필요한 열쇠를 암호화해 보관해요. 알림함에서 ‘이 기기 알림 끄기’를 누르면 수신을 해제해요. 시험 알림은 직접 누른 기기로만 보내요.</p>
    </section>
    <section className="rounded-2xl border border-line p-5">
      <h2 className="text-[21px] font-bold">6. 운영팀에 문의하기</h2>
      <a className="mt-3 block min-h-12 break-all py-2 font-bold underline underline-offset-4" href={`mailto:${PRIVACY_SUPPORT_EMAIL}`}>{PRIVACY_SUPPORT_EMAIL}</a>
      <p className="mt-2">가입한 이메일과 요청 내용을 알려 주세요. 비밀번호·인증번호·삼성 연결 열쇠·건강 기록은 보내지 마세요.</p>
    </section>
  </div>;
}
