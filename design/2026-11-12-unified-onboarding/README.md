# 밥뭇나 · 통합 온보딩

- [새 Figma · 최종 흐름](https://www.figma.com/design/5HYpmXeerW1VRFxVxKLdWb/?node-id=1-230): 15개 편집 가능 화면. 초기 검토안은 같은 새 파일의 보관 페이지에 남겨 두었다.
- [기본 앱 원본](https://www.figma.com/design/9QYJ5uSCzA60d78SGFEtti/?node-id=34-1286)과 [API 온보딩 원본](https://www.figma.com/design/9Io11mLh2rLORVmeyQdg57/?node-id=3317-189)은 각각 별도 파일에 보존한다.

공통 시작 화면에는 초록 가디건 토끼만 등장한다. 보호자 시작을 누르면 카카오·Google 계정, 5장 앱 안내, 우리 집 설정, 홈 순으로 진행한다. 비활성화된 로그인은 누를 수 없으며 이메일 링크와 별도 가상 체험은 남긴다. 기존 가구·식사·밥솥·알림 정보는 우리 집 화면에서 펼쳐 보거나 나중에 설정에서 조정할 수 있다.

홈의 첫 기기 안내는 닫아도 연결 카드가 남는다. 카드는 `/settings?section=devices#device`를 연다. 기기가 없어도 홈을 이용할 수 있으며, 기기 등록과 전력 직접 조회, 자동 신호 수신을 구분한다. Firebase OAuth의 준비 화면과 Supabase 테스트용 플러그 등록은 별개다. 두 프로젝트 사이에서 인증이나 가구 데이터는 옮기지 않는다.

원본 밥솥 캐릭터와 [카카오 큰글씨·작은글씨 공식 서체](https://github.com/kakao/kakao-font/tree/a1786bb0b7b21a8273e42fdd94d94eed09b34fce)를 사용한다. 앱은 TTF를 직접 제공하며 Figma에서 동일하게 편집하려면 해당 서체를 사용할 수 있어야 한다. 한·두·세 끼 소식에 따라 밥솥 그림이 바뀌며, 예시와 미확인은 구분한다. 만화처럼 보이는 밥의 양은 실제 섭취량이 아니다.

`python3 design/2026-11-12-unified-onboarding/build_board.py`로 보드 SVG를 다시 만들 수 있다. 개발 모드에서 `/guardian-setup`의 ‘로그인 없이 체험하기’로 모든 주요 화면을 확인할 수 있다.

## 직접 API 점검

1. [SmartThings 토큰 관리](https://account.smartthings.com/tokens)에서 본인 테스트 계정의 **기기 읽기** 권한만 선택한 PAT를 발급한다. 새 PAT는 24시간 동안 유효하다.
2. 팀 저장소의 터미널에서 `python3 scripts/verify-smartthings-device.py`를 실행한다. 숨김 입력에 토큰을 붙여 넣고 본인 플러그를 고른다. 이 점검은 기기 목록과 전력 상태만 읽으며, 기기를 제어하거나 토큰을 저장하지 않는다.
3. 전력 직접 조회가 성공해도 Firebase OAuth, 구독, 자동 신호 수신까지 확인된 것은 아니다. 장기 연동 확인은 운영 준비가 끝난 뒤 신규 기기 신호의 수신 시각으로 검증한다.
