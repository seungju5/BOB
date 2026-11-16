# Impact Series 통합 릴리스

Supabase CLI·플러그인 설치 없이 기존 GitHub 인증으로 소스를 푸시하고, 기존 Firebase Hosting에 전체 Next.js 앱을 정적으로 게시한다. 기존 Next.js/Supabase 실행 방식도 유지한다.

## 공개 진입점

- 모음: https://impact-series.web.app/bapmunna/final/
- 최신 전체 앱: https://impact-series.web.app/bapmunna/app/
- 실제 Google·이메일 계정: https://impact-series.web.app/bapmunna/app/login/
- QR 이미지: https://impact-series.web.app/bapmunna/app/bapmunna-app-qr.png
- 걸음수 연결 안내: https://impact-series.web.app/bapmunna/app/health/
- 걸음수 개인정보 안내: https://impact-series.web.app/bapmunna/app/health/privacy/
- 기존 어르신 화면: https://impact-series.web.app/bapmunna/senior/
- 기존 AI 작업실: https://impact-series.web.app/super-members/

## 포함 범위와 계정 경계

최종 통합 소스 `b4b43af`는 첫 번째 Figma의 구성, 두 번째 Figma의 디자인, 최신 표지 토끼/이후 밥솥이 결정을 반영한다. Firebase 로그인 → 소개 → 우리 집 입력·확인 → 선택 생활 설정 → 홈 흐름과 일·주·월 기록, 리포트, 알림, 세 그룹 설정, QR 공유, 어르신 화면을 포함한다. 후속 `d9e7a8c`는 어르신 화면에서 시작하는 건강 연결 안내·기종 선택·고정 앱 실행 링크·개인정보 안내를 추가한다. 이전 문서·설계 산출물과 공개 AI 작업실을 삭제하지 않는다. 상세 매핑은 `documentation/final-feedback-20261114.md`, 건강 후속은 `documentation/phone-steps-release-20261115.md`를 본다.

| 기능 | 이번 릴리스 상태 |
| --- | --- |
| 전체 Next.js 화면 | `/bapmunna/app/`에 Firebase 실제 계정 흐름과 명시적 데모 함께 제공 |
| 실제 계정 | 기존 `ku-gpa` Firebase Auth/DB; 본인 가구 정보와 생활·알림 설정 저장 |
| Google·카카오 Supabase OAuth | PKCE 콜백·서버 사용자 확인·실패 복구 구현; 서비스별 설정은 별도 필요 |
| 카카오 실제 로그인 | 사용자 결정으로 보류; Identity Platform 전환 미실행 |
| 인증 격리 | 다른 탭의 사용자 변경 즉시 이전 가구 캐시 무효화; 늦은 응답 차단 |
| OAuth 지속 선택 | 리다이렉트 후 로그인 유지 선택 복원; 미선택 시 세션 저장소 사용 |
| 가족·기기 체험 | 합성 데이터. 실제 SmartThings·가족 페어링·자동 수신은 준비 상태 |
| 공유 | 로고 metadata, QR 보기·저장·공유, 기존 `/carer` 일반 진입도 전체 앱으로 연결 |
| 네이티브 셸 | HealthKit/Health Connect 소스·웹 포장 검증; 실기기·설치 파일 배포는 별도 |
| AI 작업실 | 기존 공개 `/super-members/` 및 소스 보존; 이번 배포는 해당 파일을 변경하지 않음 |

Hosting 프로젝트 `impact-series`, 실제 계정 프로젝트 `ku-gpa`, 루트 BOB Supabase와 선택형 구형 Supabase는 서로 다른 계정·데이터 경계다. 공개 Supabase 설정을 찾았다는 이유로 루트 앱에 연결하거나 데이터를 자동 이전하지 않는다. 결제 미연결 Spark 상태를 유지한다.

## 빌드

기존 Node/npm 의존성을 사용한다. Supabase 서버를 설치할 필요는 없다. 저장소 루트에서 순서대로 실행한다.

```sh
npm run build:firebase
npm --prefix integrations/bapmunna-firebase run stage:firebase
node scripts/build-impact-next.mjs
node workspaces/bapmunna-final/scripts/stage.mjs
```

Next 일반 빌드와 정적 export는 `.next` 중간 결과를 공유하므로 동시에 실행하지 않는다. export는 `/bapmunna/app` basePath, 건강 안내·카카오 복귀·개인정보·삼성 연결을 포함한 18개 사용자 경로, 상대 PWA 범위·아이콘, 서비스 워커와 폰트를 검사한다. stage는 숨김 파일·비밀/SQL/source map·심볼릭 링크를 거부한다.

## 게시와 복구

기존 Firebase CLI 로그인으로 게시한다. `BAPMUNNA_PREVIOUS_STAGE` 환경 변수에는 현재 운영 버전과 일치하는 이전 전체 `site/bapmunna` 결과 경로를 지정한다. 최종 배포의 기준 운영 버전은 `c1cce9b7ad044033`이며 이후 작업은 이번 릴리스 영수증과 staging 결과를 새 기준으로 사용한다. 서로 다른 채팅의 배포를 동시에 실행하지 않는다.

```sh
node workspaces/bapmunna-final/scripts/publish.mjs plan
node workspaces/bapmunna-final/scripts/publish.mjs publish
node workspaces/bapmunna-final/scripts/publish.mjs verify
# 필요한 경우, 이번 버전이 여전히 최신일 때만 이전 버전으로 복구
node workspaces/bapmunna-final/scripts/publish.mjs rollback
```

`plan`은 현행 Hosting 전체 경로·설정을 읽고 수정 전/후 로컬 파일과 비교한다. 로컬에서 바뀌지 않은 파일은 더 최신인 운영 내용을 보존한다. 운영과 충돌하는 변경은 중단한다. 변경할 바이트를 동결하고 해시를 검사한 뒤 기존 전체 파일 위에 `/bapmunna/` 변경분만 올린다. 운영 버전이 바뀌거나 과금 연결이 발견되면 게시를 중단한다. 완전한 서버 측 잠금은 아니므로 게시 직전의 동시 배포도 피해야 한다.

로컬 계획·전체 파일맵·동결 파일은 `tmp/impact-final/release/`에 보관하고 Git에서 제외한다. 공개 가능한 결과는 `release.json`과 `verification.md`로 정리한다. 운영 DB·인증 설정·Firestore 규칙·기기 제어·유료 API 활성화는 이 게시 과정에 없다.

## 검증

2026-11-14 최종 구현 하네스: 하네스25·루트216·개인정보48·Firebase59·SmartThings49개, 타입·동기화·두 앱 빌드·소스 안정성이 실패/skip 없이 통과했다. 로그인 회귀8개 추가 후 루트224개와 타입을 다시 통과했다. 같은 운영 규칙 병합본의 실제 로컬 Auth/Firestore46개, 모바일 셸/걸음수 계약11개와 iOS 메타데이터4개도 별도 통과했다.

독립 검토와 320/390px 브라우저에서 입력 검증·저장 복원·계정 전환·키보드·QR을 확인했다. 실제 신규 Google OAuth·삼성 자동 수신·실기기 건강 권한·OS 큰 글꼴/모션 설정 변경·메신저 수신 카드 검증은 포함하지 않는다. 실제 계정 화면은 연결되지 않은 기록을 미확인 식사로 만들지 않는다. 공개 배포 증거는 `releases/20261114-final-feedback.json`에 별도 기록한다.

## 2026-11-13 화면 보완

공유 주소는 동일하다. 보호자 홈의 실사 밥그릇을 기존 밥솥이 캐릭터로 바꾸고, 시작 문구를 ‘안부가 폴짝 찾아왔어요’로 복원했다. 전체 앱 홈·더보기에서 실제 계정과 기기 연결 준비 화면으로 이동할 수 있다. 기기 API·카카오 준비 상태와 실제/가상 기록의 경계는 그대로 표시한다. Firebase의 끝 슬래시 정규화를 고려해 모음 페이지 CSS는 절대 경로를 사용한다.

## 2026-11-15 Android 설치 공개

건강 안내에서 갤럭시 테스트 APK를 받을 수 있다. Firebase Spark의 APK 제한에 따라 바이너리는 `https://github.com/jooji13/bapmunna-downloads/releases/tag/android-0.1.0-test.1`에, 링크·검증 JSON은 기존 Firebase에 둔다. 소스와 키는 공개하지 않는다. `stage.mjs`는 `downloads/android-test.json`의 검증된 파일을 대조하되 APK를 Firebase staging에 복사하지 않는다. 클린 작업본에서는 같은 공개 GitHub 자산을 해시 검증해 재사용한다.

최신 Hosting은 `9c953108d6155e4d`; 다음 staging 기준은 이 작업본 `tmp/impact-final/site/bapmunna`이다. 상세 영수증은 `releases/20261115-public-install.json`. iPhone 설치본·실기기 검증은 완료되지 않았다.

## 2026-11-16 카카오 로그인 경로 게시

위 공개 설치 기능과 카카오 인증 소스를 함께 보존한 `d466af4`를 Hosting `675c7f7210170b44`로 게시했다. 변경 124개 공개 파일과 기존 모든 경로를 확인했다. 서버와 화면은 게시됐지만 카카오 개발자 앱 키·등록 확인이 남아 로그인 버튼은 준비 중이다. 실제 카카오 로그인 성공을 뜻하지 않는다. 최신 영수증은 `releases/20261116-kakao-login.json`, 다음 배포 기준은 이 통합 작업본의 `tmp/impact-final/site/bapmunna`다.

## 2026-11-16 개인정보 안내·필수 동의 후속

카카오/설치 통합본 `7cad5c1` 위에 내부 개인정보 페이지·필수 동의·구형 폼 차단·아이폰 웹 테스트 동선을 반영한 `283ff0e`를 Hosting `0a649e4f0c650e57`로 게시했다. 공개128파일 일치·기존경로누락0. 기존 APK와 무료 설정을 보존했다. 최신 기준은 `codex/consent-feedback-20261116` 및 해당 작업본의 `tmp/impact-final/site/bapmunna`다. `releases/20261116-consent-feedback.json`을 참조한다. 실제 삼성 연동·실기기·iOS 설치·보관기간 확정은 남아 있다.

## 2026-11-16 카카오 활성화와 필수 동의 통합 기준

현재 공개 앱은 **Hosting `0a649e4f0c650e57` / 웹 소스 `283ff0e`**, 카카오 서버는 **Vercel `dpl_8RCTuTfvmD4SCSJho4E3YEUGvrBH` / 서버 소스 `270a38d`** 조합이다. 앞선 카카오 준비 중·Hosting `675c7f7210170b44` 기록은 당시 이력이며 최신 공개 기준이 아니다.

`codex/consent-feedback-20261116`에 활성화 기록 `989a7c7`을 병합해 고정 카카오 경로와 내부 개인정보·필수 동의·건강 설치 안내를 함께 보존했다. 공개 앱 파일은 `557f052`, Vercel 패키지는 `989a7c7`과 각각 동일하며 이번 통합에서는 재배포하지 않았다. 다음 웹 배포는 이 작업본의 `tmp/impact-final/site/bapmunna`와 현행 Hosting 버전을 기준으로 한다. 과거 catch-all 카카오 서버를 재배포하지 않는다.

통합 하네스 511개·실패0·skip0, 타입/동기화/두 앱 빌드·지문 안정성과 독립 경로 검사7개를 통과했다. 공개 config `enabled:true`와 앱 내부 개인정보 안내·문의 이메일도 읽기 전용으로 재확인했다. 실제 카카오 동의→Firebase 인증·새로고침·재로그인 성공은 담당 채팅의 `20261116-kakao-active.json` 증거를 인계받았다. 이메일 확인→프로필·가구 설정 전체 실계정 검증, User Unlinked 웹훅은 남아 있다. 삼성 인증 보류·실기기 미검증·무료 유지 결정은 그대로다. 상세: `releases/20261116-consent-kakao-integration.json`.
