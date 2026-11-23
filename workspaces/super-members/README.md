# Warming Up · Super Members 작업실

**공개 주소: https://impact-series.web.app/super-members/**

일곱 3D 토끼를 누르면 담당 역할의 AI와 한국어로 대화합니다. 창문·책상·책장·화분이 있는 방에서 인사, 말하기, 작은 점프가 재생됩니다. 방 꾸미기에서 낮/밤, 러그 색, 추가 화분을 바꿀 수 있습니다. 움직임 정지와 기기의 모션 줄이기 설정을 지원합니다.

## 팀원이 쓰는 방법

1. 링크를 열고 첫 대화 전송 안내를 확인합니다.
2. 캡틴(계획), 케어(화면), 로직(규칙), 쉴드(데이터), 브릿지(연결), 프루프(검증), 키퍼(복구) 중 한 명을 누릅니다.
3. 질문을 적거나 추천 질문을 누른 뒤 보내기를 누릅니다. Enter는 전송, Shift+Enter는 줄바꿈입니다.
4. 대화 저장으로 텍스트를 내려받거나 **실행 요청 복사**로 작업안을 개발 채팅에 전달합니다.

실제 답변은 Gemini가 생성합니다. 이 웹앱에는 저장소·Figma·운영 DB·SmartThings·배포 도구 접근 권한이 없습니다. 계획과 코드 제안은 가능하며, 실제 변경은 개발 도구에서 별도로 수행합니다. 이곳의 일곱 역할은 저장소의 Codex 역할과 이름·책임을 공유하지만 실행 중인 Codex 세션 자체가 아닙니다.

## 대화와 데이터

- 계정 없이 링크를 열어 대화하는 공개 작업실입니다. 팀 전용 접근 제한이나 팀원 간 실시간 채팅은 구현하지 않았습니다.
- 선택한 멤버의 최근 대화만 Google AI에 전송합니다. 다른 멤버의 기록은 자동 공유하지 않습니다.
- 대화 목록과 꾸미기는 이 브라우저에 저장됩니다. 다른 기기·다른 사람과 동기화되지 않습니다. 멤버당 최근 30회 대화를 보관하고 AI 문맥에는 최근 8회만 전송합니다.
- 무료 Gemini 이용 시 입력/출력이 Google 제품 개선에 사용될 수 있습니다. 가구 개인정보·건강 기록·비밀번호·토큰을 입력하지 않습니다. 로컬 대화 지우기는 Google에 이미 전송한 데이터를 삭제하는 기능이 아닙니다.
- 표시와 복사에는 텍스트만 사용합니다. AI 응답을 HTML/스크립트로 실행하지 않습니다. 실패/중단한 부분 답변은 다음 질문의 문맥으로 저장하지 않습니다.

## 비용과 연결

2026-11-12 확인: **Impact Series 프로젝트 `impact-series`는 Spark이며 결제 계정이 연결되어 있지 않습니다.** 작업실 전용 web app ID는 `1:634921658163:web:172d8068f4de8e90984046`입니다.

| 항목 | 현재 구성과 비용 경계 |
|---|---|
| 정적 사이트 | 기존 Firebase Hosting 무료 할당량 공유 |
| 실제 AI | Firebase AI Logic + Gemini Developer API `gemini-3.5-flash-lite`, 무료 할당량 내 이용 |
| 앱 보호 | App Check 강제 적용, reCAPTCHA Enterprise 공급자의 무결제 Essentials 무료 등급 |
| 무료 한도 초과 | 요청이 제한될 수 있음. 자동 유료 전환 없음 |
| 인원 증가 | 사람마다 고정 월요금이 붙는 구조가 아님. 방문·AI 요청·앱 확인 횟수가 늘어 할당량을 더 사용 |

reCAPTCHA 무료 한도는 조직 전체 월 10,000회 평가입니다. Gemini의 실제 분/일 한도는 프로젝트·모델에 따라 달라서 고정 메시지 수를 약속하지 않습니다. 대화에는 클라이언트 6초 간격과 입력 2,000자·응답 1,200토큰 제한이 있으며, 클라이언트 제한은 보안 장벽이 아닙니다. App Check는 별도로 강제 적용합니다. 결제를 연결하면 Gemini도 종량제로 바뀌므로 이번 구성에서는 결제를 연결하지 않습니다.

근거: [Firebase AI 요금](https://firebase.google.com/docs/ai-logic/pricing), [App Check](https://firebase.google.com/docs/ai-logic/app-check), [Gemini 가격](https://ai.google.dev/gemini-api/docs/pricing), [무료 모델 할당량](https://ai.google.dev/gemini-api/docs/rate-limits), [reCAPTCHA 무료 등급](https://docs.cloud.google.com/recaptcha/docs/billing-information).

## 로컬 개발·검사

```sh
npm run test:office
npm run harness:check
python3 -m http.server 5274 --bind 127.0.0.1 --directory tmp/super-members/site
```

미리보기: `http://127.0.0.1:5274/super-members/`. 실제 AI는 등록된 공개 도메인에서만 작동합니다. 로컬 테스트를 위해 App Check를 해제하거나 프로덕션 키에 localhost를 추가하지 않습니다.

별도 패키지를 설치하지 않고 기존 integration의 Firebase 12.18.0과 esbuild를 사용합니다. `build:office`가 공개 파일 14개만 `tmp/super-members/site/super-members/`에 생성합니다. 관리자 스크립트·테스트·프롬프트 제작 문서·클라우드 증거는 배포하지 않습니다. 웹 설정은 공개 Firebase 식별자와 공개 reCAPTCHA 사이트 키이며 Gemini 비밀키는 없습니다.

## 게시와 복구

사용자가 해당 게시를 허용한 상태에서만 실행합니다.

```sh
node workspaces/super-members/scripts/publish.mjs plan
# tmp/super-members/hosting-plan.json과 기존 파일 보존 수 검토
node workspaces/super-members/scripts/publish.mjs publish
node workspaces/super-members/scripts/publish.mjs verify
# 방금 게시한 버전이 여전히 운영 중일 때만 직전 버전으로 복구
node workspaces/super-members/scripts/publish.mjs rollback
```

현재 운영 버전 전체 파일 목록 위에 `/super-members/`만 덧붙입니다. 기존 **2,421개 경로와 Hosting 설정을 보존**하며, 계획 후 원본·운영 버전이 바뀌면 게시를 중단합니다. 새 배포가 끼어든 상태에서는 자동 복구도 거부합니다. 복구는 Hosting 화면만 되돌리며 AI/App Check 설정을 삭제하지 않습니다. 최초 게시 전 버전은 `sites/impact-series/versions/9c48044d28de2e5b`이며, 각 게시 영수증을 확인하고 사용합니다.

## 검사 근거

- 대화 코어와 실제 앱 컨트롤러 회귀 검사 13개 통과: 멤버별 문맥, 잘못된 저장 데이터, 응답 중 멤버 전환, 중단, 새 초안 보존, 뒤로 가기, 저장 실패 시 삭제 성공 오표시 방지 등. HTML 실행 대신 `textContent`를 사용하는 경계는 독립 코드 검토로 확인.
- 브라우저에서 390px/데스크톱 배치, 토끼 선택, 인사·말하기 포즈, 방 꾸미기·움직임 정지 확인. OS 모션 줄이기는 코드 검토 및 회귀 경계로 확인했으며 실제 OS 설정 변경 검사는 하지 않음.
- 공개 Firebase에서 캡틴·브릿지·케어의 서로 다른 실제 AI 응답 수신. App Check 강제 설정과 무료 결제 상태를 API로 읽어 확인.
- 기존 앱 전체 하네스는 단위·타입·동기화·Firebase 및 Next 빌드 통과. 기존 SmartThings emulator 검사 1개는 준비되지 않아 건너뜀; 전체 결과는 `incomplete`로 기록. 이 작업실 AI 성공은 SmartThings OAuth/웹훅 성공을 뜻하지 않음.

아트는 **내장 image_gen**으로 생성했습니다. 기존 소개판을 참고한 일곱 캐릭터의 2×2 투명 포즈 시트와 방 그림은 `assets/`, 최종 프롬프트는 `art-prompts.json`에 있습니다. 앱의 기존 마스코트를 교체하지 않았습니다.
