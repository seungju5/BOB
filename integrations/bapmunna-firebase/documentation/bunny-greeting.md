# 토끼의 깡총 인사 · 2026-11-03

사용자 요청: 사진 전체만 움직이는 효과 대신 토끼 자체가 움직이며 인사하고, 기존 깡총 점프도 유지한다.

초록 가디건·크림색 털·접힌 귀·클립보드의 원래 정체성을 참고해 16개의 실제 자세 프레임을 제작했다. 준비 → 큰 점프 → 작은 점프 → 손 흔들기 → 눈 깜빡임 → 고개 인사 → 휴식의 3.6초 동작이다. 프레임마다 다리·팔·귀·표정이 달라지며 점프 궤적은 별도로 이어진다. 2D 프레임 애니메이션이며 실시간 3D 모델은 아니다.

- 원본: docs/assets/bunny.png. 다른 화면의 정적인 동반 캐릭터와 비상 대체 이미지로 보존.
- 동작 자산: docs/assets/bunny-greeting.webp (4×4, 1254×1254, RGBA, 570674 bytes).
- SHA-256: 76891f00f8fa4602664abd2881ad346482711e100c0fe6f4ed0cb4efb6093571
- 제어: docs/bunny-greeting.mjs. Next.js 시작 화면도 같은 제어 함수를 사용한다.
- 화면당 첫 진입에 한 번 자동 재생, 다시 인사하기로 재생. 역할 선택 버튼은 계속 사용할 수 있다.
- 모션 줄이기 설정이면 자동 재생·자산 다운로드를 생략한다. 설정이 바뀌면 진행 중 동작도 중단한다.
- 숨겨진 탭에서는 일시 정지, 화면 이동 시 예약 프레임·리스너를 정리한다. 자산 로딩 오류 때는 원본 이미지가 남는다.
- 프레임의 발 위치를 보정하여 손을 흔들 때 캐릭터 전체가 좌우로 튀지 않도록 했다.
- 제작: 내장 image_gen 도구. WebP 인코딩은 기존 sharp로 크기·알파를 보존했다. 새 실행 라이브러리는 없다.
- 최종 이미지 편집 프롬프트: “Remove the background of this existing 4 by 4 bunny sprite sheet. True alpha transparency everywhere outside the 16 bunnies, with no white haze or shadows. Keep the exact same figures, poses, sizes, and grid positions. This is a transparent cutout task, not a redesign. Keep all ears and feet within each equal cell.”

자세 생성 지시: 같은 카메라·크기·조명으로 원래 토끼를 유지하고, 서기/웅크리기/도약/다리 접어 뛰기/내려오기/착지/일어서기/손 올리기/좌우 손 인사/눈 감고 웃기/고개 숙이기/손 내리기를 그린다. 4×4 동일한 셀, 셀마다 귀·발이 잘리지 않는 투명 여백을 둔다.

검증: 7개 제어 테스트(두 점프, 모션 줄이기, 로딩 실패, 늦은 응답 정리, 재생 중복 방지, 숨긴 탭 일시 정지, 설정 변경 중단), 기존 도메인·역할 테스트, 브라우저의 320/390px 재생 장면·역할 전환. 배포 증거는 공개 검증 후 별도 영수증에 기록한다.
