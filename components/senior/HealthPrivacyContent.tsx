/** Shared, local policy content; no SDK, analytics or account requests. */
export function HealthPrivacyContent() {
  return <div className="space-y-5 text-2xl leading-relaxed text-cocoa">
    <p>밥뭇나는 휴대폰 소유자가 동의한 경우에만 건강 앱의 오늘 걸음수를 읽어 보여 드려요.</p>
    <section><h2 className="font-bold">읽는 정보</h2><p className="mt-2">아이폰은 Apple 건강, 갤럭시는 Health Connect에 공유된 삼성 헬스의 걸음수를 읽어요. 심박수·수면·위치 정보는 요청하지 않아요.</p></section>
    <section><h2 className="font-bold">기본은 내 휴대폰에서만</h2><p className="mt-2">걸음수 읽기에 동의하는 것만으로는 서버에 보내지 않아요. 건강 앱의 원래 기록을 삭제하거나 수정하지 않아요.</p></section>
    <section><h2 className="font-bold">랭킹 공유는 별도 선택</h2><p className="mt-2">내 계정에서 참가한 뒤 이 휴대폰에서도 별명을 확인하고 공유에 동의하면, 한국 시간 기준 오늘 걸음수 합계·별명·순위를 전체 랭킹 참여자에게 보여 드려요. 이메일·실명·혈당·위치·개별 걸음 기록은 랭킹에 공개하지 않아요. 별명에 실명이나 전화번호를 적지 마세요.</p><p className="mt-3">앱을 열거나 다시 확인할 때 합계가 전송돼요. 동의하지 않은 건강 정보를 광고 서비스에 보내지 않아요. 지난날 합계는 오늘 순위에서 제외하고 다음 갱신이나 정리 작업 때 지워요. 별명은 참가하는 동안 보관해요.</p></section>
    <section><h2 className="font-bold">연결과 참여 끄기</h2><p className="mt-2">‘밥뭇나 걸음수 연결 끄기’를 누르면 건강 기록 조회와 새 걸음수 전송이 멈춰요. 이미 공유한 오늘 기록을 지우려면 웹앱의 랭킹 메뉴에서 ‘참여 그만하기’를 눌러 주세요. 별명·합계·기기 연결을 지워요. 건강 앱의 원래 기록은 유지돼요.</p><p className="mt-3">휴대폰 연결 정보는 보안 저장소에 보관하고, 서버에는 연결용 비밀값 대신 확인용 해시를 보관해요. 휴대폰 건강 앱의 읽기 권한도 설정에서 언제든 끌 수 있어요.</p></section>
    <section><h2 className="font-bold">산책 알림</h2><p className="mt-2">선택한 식후 시각과 혈당 확인 안내 설정은 이 휴대폰에 보관해요. 알림 허용을 선택한 경우에만 예약하며 언제든 끌 수 있어요. 식사 완료나 혈당을 자동 측정하는 기능은 아니에요.</p></section>
    <section><h2 className="font-bold">내 휴대폰의 기록</h2><p className="mt-2">앱이 설치된 휴대폰 소유자의 건강 기록을 기준으로 해요. 가족 계정이나 연결 숫자를 안다는 이유만으로 다른 분의 건강 기록을 조회하지 않아요. 공유 전에 휴대폰에서 연결할 별명을 직접 확인해 주세요.</p></section>
    <p className="text-muted">연결은 선택 사항이에요. 연결하지 않아도 밥뭇나 웹앱을 사용할 수 있어요.</p>
  </div>;
}
