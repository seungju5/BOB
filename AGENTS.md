# 밥뭇나 (Warming Up) 작업 규칙

이 브랜치(`codex/warming-up-firebase`)가 실제 서비스 https://warming-up-bapmunna.web.app 을 만드는 코드다.
사람·AI 도구(Claude Code, Codex 등) 모두 아래 규칙을 지킨다. 원래 규칙은 main 브랜치의 CLAUDE.md에서 가져왔다.

## 절대 금지 (개인정보·안전)

- **원시 전력값을 영구 저장하거나 보호자 화면에 노출하지 않는다.** 판정에만 쓰고 지운다.
- 보호자 화면에 끼니 상태(확인됨/미확인/외식/부재) 이외의 식사 데이터를 노출하지 않는다.
- SmartThings 토큰·푸시 개인키·서비스 계정 키를 코드나 DB에 평문으로 두지 않는다.
- 카메라·음성·위치 수집 기능을 넣지 않는다.
- 밥솥 데이터로 영양 상태를 "판정"하는 문구나 기능을 만들지 않는다. 패턴 변화만 알린다.
- 플러그 오프라인을 결식으로 처리하지 않는다.
- 실제 계정 화면에 예시·가짜 전력 데이터를 보여주지 않는다(데모 모드에서만).

## 팀원 개인정보 검사

- 팀원 누구의 개인 정보(개인 메일, 휴대폰 번호, 내 컴퓨터 경로, 개인 배포 주소, 비밀 키)도 저장소에 넣지 않는다.
- `npm run check:personal-info`가 검사하고, GitHub 자동 빌드에서도 가장 먼저 돈다. 걸리면 빌드·배포가 멈춘다.
- 팀이 공개하기로 한 값(공용 메일 등)만 `config/personal-info.json`의 `allowed`에 추가한다.
- 서비스 운영 값(Firebase 프로젝트, 사이트 주소, 문의 메일)은 `config/team.ts` 한 곳에서만 바꾼다. 개인 계정 값을 넣지 않는다.

## 팀과 먼저 정할 것

- 판단 기준값(밥솥 전용 플러그 700W 이상 1회, 보온 20~70W), 알림 문구와 조건
- 데이터 구조·Firestore 보안 규칙 변경, 외부 API 추가
- 새 계정·외부 서비스 생성 (팀 공용 계정 소유로 만들고 팀 채널에 먼저 공유)

## 작업 방식

- 각자 개인 GitHub 계정으로 커밋한다. 공용 계정은 소유·관리용이다.
- 배포 전 `npm test`, `npm run check:types`, `npm run check:personal-info`, `npm run build`가 통과해야 한다.
- 화면 피드백 기록은 `docs/feedback/`에 남긴다.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
