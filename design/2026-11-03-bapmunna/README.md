# 밥뭇나 로그인과 기기 연결

- Figma: https://www.figma.com/design/9Io11mLh2rLORVmeyQdg57/?node-id=3317-189
- 페이지: 밥뭇나 · 로그인과 기기 연결 · 11.03
- 로그인 → 삼성 동의 → 플러그 선택 → 연결 확인, 재연결, 출시 전 준비 상태의 6개 설계 화면. 기기 이름과 시각은 예시다.
- 처음 만든 입체적인 3D 토끼 `bunny.png`와 `rice-logo.png`를 원본 그대로 사용한다. 토끼는 안부 친구, 밥솥은 브랜드 심볼이다.
- `bapmunna-connection-board.svg`는 편집 가능한 텍스트·도형과 기존 이미지로 구성했다. Figma에 가져와 레이어와 이미지 표시를 확인했다. 실제 OAuth 완료 증거는 아니다.
- `python3 design/2026-11-03-bapmunna/build_board.py`로 보드를 재생성한다.
- `mobile-login-proof.png`, `mobile-connection-proof.png`는 로컬 앱을 실제 390×844 iframe에서 확인한 화면이다. 어르신용 → 보호자용 → 더보기 → SmartThings 연결 이동을 검증했다. 연결 화면의 ‘준비 중’이 현재 운영 준비 상태이며 실제 연결 완료 화면이 아니다.

- `bapmunna-api-oauth-explained.pdf`: 같은 3D 토끼가 API·OAuth·자동 수신을 설명하는 한국어 3쪽 자료. 등록·조회 성공과 실제 사용자 연결·자동 수신 미검증을 구분한다.
- `figma-login-3d-proof.png`: Figma에 반영된 원본 3D 토끼 로그인 화면. 기존 보드 프레임 `3317:189`와 공유 링크를 유지했다.

## 공통 디자인 반영 · 2026-11-03

- [공통 디자인 기준](https://www.figma.com/design/9Io11mLh2rLORVmeyQdg57/?node-id=3328-2): 앱과 같은 원본 PNG, 색상값, 세 메뉴와 어르신 세 행동을 편집 가능한 텍스트·도형으로 추가했다. 기존 연결 보드 링크는 유지한다.
- `scripts/sync-design.mjs`는 Firebase의 승인 자산·색상을 Next.js `public/brand/`, `app/brand.generated.css`와 `design-manifest.json`으로 동기화한다. `npm run check:design`으로 누락과 바이트 차이를 검사한다. 계정·DB·판단 코드는 이 스크립트의 대상이 아니다.
- Next.js/Supabase 화면도 3D 토끼·원본 로고·로컬 서체와 세 메뉴를 사용한다. 이메일 링크 로그인과 가족 페어링은 유지한다.
- Firebase와 선택형 Supabase 프런트엔드를 Impact Series에 게시했다. 실제 API 서버 가동이나 실기기 연결 완료를 뜻하지 않는다.
- 배포 근거: `release-design-sync.json`. Figma · 공개 로그인 · Next.js 어르신 화면의 검수 이미지를 함께 보관한다.
