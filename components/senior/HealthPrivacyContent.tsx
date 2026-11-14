/** Shared, local policy content; no SDK, analytics or account requests. */
export function HealthPrivacyContent() {
  return <div className="space-y-5 text-2xl leading-relaxed text-cocoa">
    <p>밥뭇나는 휴대폰 소유자가 동의한 경우에만 건강 앱의 오늘 걸음수를 읽어 보여 드려요.</p>
    <section><h2 className="font-bold">읽는 정보</h2><p className="mt-2">아이폰은 Apple 건강, 갤럭시는 Health Connect에 공유된 삼성 헬스의 걸음수를 읽어요. 심박수·수면·위치 정보는 요청하지 않아요.</p></section>
    <section><h2 className="font-bold">보관과 공유</h2><p className="mt-2">조회한 걸음수는 현재 화면에만 표시해요. 밥뭇나 서버에 저장하거나 보호자·광고 서비스로 보내지 않아요. 건강 앱의 원래 기록은 삭제하거나 수정하지 않아요.</p></section>
    <section><h2 className="font-bold">연결 끄기</h2><p className="mt-2">‘걸음수 이용 안내’에서 ‘밥뭇나 걸음수 연결 끄기’를 누르면 앱의 조회를 중단해요. 휴대폰에는 연결 동의 여부만 남겨요. 건강 앱의 읽기 권한도 해당 앱의 설정에서 언제든 끌 수 있어요.</p></section>
    <section><h2 className="font-bold">내 휴대폰의 기록</h2><p className="mt-2">이 기능은 앱이 설치된 휴대폰의 건강 기록을 표시해요. 가족 계정의 걸음수를 대신 조회하거나 다른 기기로 동기화하지 않아요.</p></section>
    <p className="text-muted">연결은 선택 사항이에요. 연결하지 않아도 밥뭇나 웹앱을 사용할 수 있어요.</p>
  </div>;
}
