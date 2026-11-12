# Impact Series 통합 릴리스

Supabase CLI·플러그인 설치 없이 기존 GitHub 인증으로 소스를 푸시하고, 기존 Firebase Hosting에 전체 Next.js 앱을 정적으로 게시한다. 기존 Next.js/Supabase 실행 방식도 유지한다.

## 공개 진입점

- 모음: https://impact-series.web.app/bapmunna/final/
- 최신 전체 앱: https://impact-series.web.app/bapmunna/app/
- 실제 Google·이메일 계정: https://impact-series.web.app/bapmunna/carer/#account
- 기존 어르신 화면: https://impact-series.web.app/bapmunna/senior/
- 기존 AI 작업실: https://impact-series.web.app/super-members/

## 포함 범위와 계정 경계

`origin/main`의 튜토리얼, 7단계 온보딩, 홈, 일·주·월 기록, 리포트, 알림, 설정, 가전 확장, 어르신 화면을 포함한다. `origin/codex/bapmunna-development-harness`의 Firebase 통합판, 승인된 원본 3D 토끼, 디자인 동기화, 개발 하네스, 7개 역할과 공개 AI 작업실 소스도 함께 병합한다. 이전 문서·설계 산출물을 삭제하지 않는다.

| 기능 | 이번 릴리스 상태 |
| --- | --- |
| 전체 Next.js 화면 | `/bapmunna/app/` 정적 배포, 브라우저 데모로 전체 흐름 체험 |
| 실제 계정 | 기존 `ku-gpa` Firebase Auth/DB 유지; Google·이메일 화면에 직접 연결 |
| Google·카카오 Supabase OAuth | PKCE 콜백·서버 사용자 확인·실패 복구 구현; 서비스별 설정은 별도 필요 |
| 카카오 실제 로그인 | 등록 앱·Provider 설정 미확인으로 준비 중 표시; 성공으로 주장하지 않음 |
| 인증 격리 | 다른 탭의 사용자 변경 즉시 이전 가구 캐시 무효화; 늦은 응답 차단 |
| OAuth 지속 선택 | 리다이렉트 후 로그인 유지 선택 복원; 미선택 시 세션 저장소 사용 |
| 가족·기기 체험 | 합성 데이터. 실제 SmartThings 공개 서버·자동 수신·신고 배포와 구분 |
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

Next 일반 빌드와 정적 export는 `.next` 중간 결과를 공유하므로 동시에 실행하지 않는다. export는 `/bapmunna/app` basePath, 13개 사용자 경로, 상대 PWA 범위·아이콘, 서비스 워커와 폰트를 검사한다. stage는 숨김 파일·비밀/SQL/source map·심볼릭 링크를 거부한다.

## 게시와 복구

기존 Firebase CLI 로그인으로 게시한다. `BAPMUNNA_PREVIOUS_STAGE` 환경 변수에는 수정 전 Firebase 통합판의 `stage:firebase` 결과 경로를 지정한다. 이번 기준 소스는 `ed9c8d9`다. 서로 다른 채팅의 배포를 동시에 실행하지 않는다.

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

2026-11-12 작업본: 전체 하네스의 루트 73개, 하네스 24개, Firebase 시나리오 58개, SmartThings 단위 14개 통과. Firebase 전체 검사(워크시트 31개, 역할 9개, 관리 8개, 동등성/경험/지속 선택 43개), AI 작업실 13개, 타입·변경 파일 lint·일반 Next 빌드·정적 export 통과. 실제 Firestore emulator 1개는 환경이 준비되지 않아 skip이며 전체 하네스 결과는 `incomplete`로 유지한다.

독립 검토자는 배포/복구를 합성 API로 재현했고 기존 파일·설정 보존을 확인했다. 계정 전환·진행 중 응답·로그아웃 3개 및 OAuth 지속 선택 2개 회귀도 통과했다. 실제 서비스 로그인 완료, DB/RLS·실기기 격리, OS 모션 줄이기 설정을 바꾼 실기기 검증은 이 로컬 검사에 포함되지 않는다. 공개 배포와 모바일 확인은 별도 기록으로 남긴다.
