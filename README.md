# 밥뭇나

밥솥 전력 사용 패턴으로 떨어져 사는 부모님의 식사 공백을 파악해, 부양 자녀에게 알려주는 서비스.
테크포임팩트 · 고려대학교(세종) 팀 워밍업.

## Warming Up 팀 운영 앱

[밥뭇나 열기](https://warming-up-bapmunna.web.app/) · [보호자 이메일 가입·로그인](https://warming-up-bapmunna.web.app/login/) · [어르신 화면](https://warming-up-bapmunna.web.app/s/) · [개인정보 안내와 팀 문의처](https://warming-up-bapmunna.web.app/privacy/)

[**운영 웹앱 전체 소스 보기**](apps/warming-up/) · [이메일 로그인·가구 정보 저장](apps/warming-up/firebase/provider/) · [Firestore 접근 규칙](apps/warming-up/firebase/firestore.rules) · [끼니·알림 판단 함수](apps/warming-up/lib/judge/)

웹앱에서 **보호자로 시작 → 로그인 없이 데모로 둘러보기**를 선택하면 튜토리얼부터 식사 기록과 알림 기준 설정까지 살펴볼 수 있습니다. 데모의 전력과 걸음 수는 예시 데이터입니다. 실제 계정은 이메일 인증 후 가구 정보와 알림 기준을 저장할 수 있습니다. 삼성 기기 연결과 휴대폰 걸음 수 공유는 준비 중입니다.

이 저장소를 내려받아 현재 운영판을 로컬에서 실행하려면 Node.js 24로 다음 명령을 실행하세요.

```sh
cd apps/warming-up
npm ci
npm run dev
```

2026년 11월 23일에 `apps/warming-up/`의 전체 파일이 운영 커밋 `7a9fad3`과 일치하는지 확인했습니다. 배포는 [팀 Firebase 워크플로](https://github.com/seungju5/BOB/actions/workflows/firebase-hosting.yml?query=branch%3Acodex%2Fwarming-up-firebase)에서 관리합니다. 다음 배포본을 확인한 뒤 `main`에서 `git subtree pull --prefix=apps/warming-up origin codex/warming-up-firebase --squash`로 갱신할 수 있습니다.

공용 Firebase 프로젝트 ID는 `warming-up-bapmunna`입니다. 로그인·Firestore·Hosting은 이 프로젝트에서 관리합니다. 팀 배포와 복구는 [운영 가이드](apps/warming-up/README.md)를 따르세요.

## 기존 Supabase 앱 실행 (저장소 루트)

```bash
npm install
```

```bash
npm run dev
```

http://localhost:3000 에서 '보호자로 시작'(온보딩 → 홈)과 '어르신으로 시작'(연결 숫자 → 버튼 3개)을 확인할 수 있습니다.
지금은 **데모 모드**입니다. 데이터는 브라우저 저장소에만 있고, 지난 5주치 밥솥 기록이 미리 채워져 있습니다. 같은 브라우저의 두 탭이 상태를 공유합니다.

```bash
npm test
```

## 문서

CLAUDE.md → brd.md → cps.md → design.md → plan.md → todo.md → test.md (참고: stack.md, adr.md, log.md)

Google·카카오 로그인 콘솔 설정과 검증 순서는 [로그인 연결 가이드](docs/google-kakao-login.md)를 참고하세요.

11월 19일 당시의 안티그래비티 보강과 삼성 계정 검증 내용은 [이전 소스·게시본 대조 기록](documentation/github-firebase-sync-20261119.md)과 [파일별 검증 기록](workspaces/bapmunna-final/releases/20261119-github-sync.json)에 있습니다.

## Super Members 개발 하네스

[팀 구성과 사용 안내](harness/README.md)에 밥뭇나 전용 7개 AI 역할, 개발 순서, 작업별 완료 기준을 정리했습니다. 필요한 담당을 선택해 구현하고, 독립 검토자가 증거를 확인합니다.

```sh
npm run harness:doctor
npm run harness:plan -- --task harness/tasks/smartthings-pilot.json
npm run harness:check
```

검사는 변경 파일에 맞춰 기존 테스트·동기화·타입·빌드를 실행합니다. 결과와 로그는 Git에서 제외된 `.harness/runs/`에 남습니다. `--base <커밋/브랜치>`로 이미 커밋한 변경까지 포함할 수 있습니다. 배포·결제·외부 AI API는 자동 호출하지 않으며, 실기기 연결과 현장 확인은 별도 증거로 남깁니다.

## 이전 Firebase 디자인 통합판

이전 디자인과 회귀 검사는 [integrations/bapmunna-firebase](integrations/bapmunna-firebase/README.md)에 있습니다. 이 폴더의 Firebase 로그인·저장은 로컬 에뮬레이터에서만 동작합니다.

`npm run dev:firebase`로 실행하고 `npm run test:firebase`로 검증합니다. 판단 로직 변경 후 `npm run sync:firebase`로 공통 코드를 갱신합니다. 기능·판단은 Supabase를 기준으로, 노란색·로고·토끼 디자인은 Firebase를 기준으로 유지합니다. 자세한 범위와 계정·DB 분리 조건은 통합판 README를 확인하세요.

## 승인된 디자인

[Figma 디자인 기준](https://www.figma.com/design/9Io11mLh2rLORVmeyQdg57/?node-id=3328-2)

2026-11-03의 승인된 3D 토끼·노란 밥솥 로고·서체·색상을 루트 Next.js와 Firebase 통합판에 공통 적용했습니다. `npm run sync:design`으로 생성하고 `npm run check:design`으로 일치를 확인합니다. 두 앱의 로그인·데이터 계층은 별도입니다. 공개 SmartThings 서버는 미배포이며 UI는 준비 상태를 표시합니다. 검증·배포 기록은 `design/2026-11-03-bapmunna/README.md`를 참고하세요.
