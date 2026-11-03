# 밥뭇나

밥솥 전력 사용 패턴으로 떨어져 사는 부모님의 식사 공백을 파악해, 부양 자녀에게 알려주는 서비스.
테크포임팩트 · 고려대학교(세종) 팀 워밍업.

## 실행

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

## Firebase 디자인 통합판

기존 Firebase 밥뭇나는 [integrations/bapmunna-firebase](integrations/bapmunna-firebase/README.md)에 별도로 보존합니다. 루트 Next.js 앱의 실행·배포는 바꾸지 않습니다.

`npm run dev:firebase`로 실행하고 `npm run test:firebase`로 검증합니다. 판단 로직 변경 후 `npm run sync:firebase`로 공통 코드를 갱신합니다. 기능·판단은 Supabase를 기준으로, 노란색·로고·토끼 디자인은 Firebase를 기준으로 유지합니다. 자세한 범위와 계정·DB 분리 조건은 통합판 README를 확인하세요.

## 현재 승인 디자인과 공개 앱

[공개 밥뭇나](https://impact-series.web.app/bapmunna/) · [어르신용](https://impact-series.web.app/bapmunna/senior/) · [보호자용](https://impact-series.web.app/bapmunna/carer/) · [Figma 디자인 기준](https://www.figma.com/design/9Io11mLh2rLORVmeyQdg57/?node-id=3328-2)

2026-11-03의 승인된 3D 토끼·노란 밥솥 로고·서체·색상을 루트 Next.js와 Firebase 통합판에 공통 적용했습니다. `npm run sync:design`으로 생성하고 `npm run check:design`으로 일치를 확인합니다. 두 앱의 로그인·데이터 계층은 별도입니다. 공개 SmartThings 서버는 미배포이며 UI는 준비 상태를 표시합니다. 검증·배포 기록은 `design/2026-11-03-bapmunna/README.md`를 참고하세요.
