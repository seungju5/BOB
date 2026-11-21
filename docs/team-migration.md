# 팀 계정 이전 안내

밥뭇나는 지금 Peter 개인 계정(Firebase `impact-series`·`ku-gpa`, Vercel `bapmunna-smartthings`, GitHub `jooji13`, 개인 Gmail)에서 운영된다.
이 문서는 **팀 공용 계정(Google·GitHub·Vercel)** 으로 옮기는 순서다. 결정: 백엔드는 **Firebase로 통일**한다.

## 무엇이 이미 준비돼 있나 (코드)

| 준비된 것 | 위치 |
|---|---|
| 배포 대상 값(Firebase 웹 설정·웹 주소·서버 주소·문의 메일·APK 주소)을 **한 파일**로 모음 | `config/deployment.json` |
| 그 파일을 Firebase 정적 앱 설정으로 옮겨 쓰는 스크립트 | `npm run apply:deployment` / 검사 `npm run check:deployment` |
| Next.js 앱이 쓰는 값 | `lib/deployment.ts` (위 JSON을 읽음) |
| 팀 Firebase 전용 **독립 보안 규칙** (다른 앱 규칙에 끼워 넣지 않음) | `integrations/bapmunna-firebase/firebase/team-firestore.rules` (`npm run rules:team`) |
| 팀 Firebase 배포 설정 | `firebase.json`, `.firebaserc` |
| 전체 빌드·배포 명령 | `npm run build:team-site` → `npm run deploy:team` |
| PR 자동 검사 (Windows·Linux, 규칙 에뮬레이터, 서버 테스트) | `.github/workflows/ci.yml` |
| 팀원 개인 정보(개인 메일·휴대폰 번호·내 컴퓨터 경로·개인 Vercel 주소·비밀 키)가 새로 들어오면 실패하는 감시 | `npm run check:personal-info`, 설정 `config/personal-info.json` |

## 1단계 — GitHub (팀 조직)

1. 팀 공용 GitHub 계정으로 **조직(Organization)** 을 만든다. 무료.
2. 저장소 주인(seungju5)이 `Settings → General → Danger Zone → Transfer` 로 조직에 이전한다.
3. 팀원을 조직 멤버로 초대하고 관리자(Owner) 2명 이상을 둔다.
4. **main 보호**: `Settings → Rules → Rulesets`(또는 Branches) → main에
   - Pull request 필수, 승인 1명 이상
   - Status checks 필수: `check (ubuntu-latest)`, `check (windows-latest)`, `firebase-rules`, `server`
   - force push·삭제 금지
   > 비공개 저장소에서 규칙을 **강제**하려면 GitHub Team 플랜이 필요하다. 학생이면 GitHub Education(Campus) 신청으로 무료 가능성이 높다. 공개 저장소면 무료로 강제된다.
5. 같은 조직에 APK 배포용 공개 저장소(예: `bapmunna-downloads`)를 만든다.

## 2단계 — Firebase (팀 Google 계정)

1. [Firebase 콘솔](https://console.firebase.google.com)에서 새 프로젝트(예: `bapmunna`)를 만든다. 팀원 Google 계정을 **소유자**로 2명 이상 추가.
2. **Authentication** → 로그인 방법: 이메일/비밀번호, Google 사용 설정. 승인된 도메인에 `<프로젝트>.web.app` 확인.
3. **Firestore** 생성 (리전 `asia-northeast3` 서울 권장).
4. 프로젝트 설정 → 내 앱 → **웹 앱 추가** → 나오는 `apiKey·authDomain·projectId·appId` 4개를 `config/deployment.json`의 `firebase`에 넣는다.
5. `.firebaserc`의 `TEAM-FIREBASE-PROJECT-ID`를 프로젝트 ID로 바꾼다.
6. `config/deployment.json`의 `webOrigin`을 `https://<프로젝트 ID>.web.app` 으로 바꾼다.
7. **서비스 계정 키**(Vercel 서버가 카카오 로그인 토큰을 만들 때 씀): 프로젝트 설정 → 서비스 계정 → 새 비공개 키. 파일은 **저장소에 올리지 말고** Vercel 환경변수에만 넣는다.

## 3단계 — Vercel (팀 계정)

1. 팀 Vercel에서 서버 프로젝트를 만든다. 원본은 `workspaces/smartthings-vercel` (`npm --prefix workspaces/smartthings-vercel run stage` 로 만든 `.stage/`).
2. 환경변수(값은 Peter에게 받거나 새로 발급):
   `FIREBASE_PROJECT_ID`, Firebase 서비스 계정, `BAPMUNNA_WEB_ORIGIN`(=webOrigin), `APP_URL`, `PUBLIC_ORIGIN`,
   `KAKAO_CLIENT_ID`·`KAKAO_CLIENT_SECRET`·`KAKAO_APP_ID`·`KAKAO_API_ORIGIN`,
   `WALKING_API_ORIGIN`, `SMARTTHINGS_*`(4단계 후), cron 비밀값. 전체 목록: `integrations/bapmunna-firebase/server/.env.example`, `server/README.md`.
3. 배포 주소(예: `https://bapmunna-api.vercel.app`)를 `config/deployment.json`의 `apiOrigin`에 넣는다.

## 4단계 — 외부 서비스 재등록

- **카카오 개발자**: 팀 계정으로 앱 생성(또는 Peter 앱에 팀원 추가) → Redirect URI를 새 Vercel 주소의 `/api/kakao/callback` 으로.
- **삼성 SmartThings**: 팀 삼성 계정으로 앱 등록 → Redirect/Webhook을 새 Vercel 주소로. (Peter 계정은 현재 콘솔 접근도 막혀 있음)
- **개인정보 문의 메일**: 팀 공용 메일을 `config/deployment.json`의 `privacySupportEmail`에.

## 5단계 — 적용·배포

```sh
npm run apply:deployment     # deployment.json → Firebase 정적 앱 설정
npm run check:personal-info  # 팀원 개인 정보가 새로 들어오지 않았는지
npm run build:team-site      # 전체 빌드 (tmp/impact-final/site)
npx --prefix integrations/bapmunna-firebase firebase login   # 팀 Google 계정으로
npm run deploy:team          # 팀 Firebase에 Hosting + Firestore 규칙·인덱스 배포
```

> ⚠️ 배포 전: 기록 화면의 "밥솥 전력 데이터 & AI 해석 과정"(`components/power/PowerTranscriptionSection.tsx`)은 **고정 예시 데이터**를 실제 계정에도 보여 준다. 숨기거나 실제 데이터로 연결한 뒤 배포한다.

## 6단계 — Peter에게 받을 것

| 받을 것 | 이유 |
|---|---|
| 기존 가입자 데이터 내보내기 (`ku-gpa` Firestore `bapmunna*` 컬렉션, Auth 사용자) | 새 프로젝트로 옮기지 않으면 기존 사용자는 다시 가입해야 함 |
| Vercel 서버 환경변수 값(카카오 키 등) | 새로 발급해도 되지만 받으면 빠름 |
| (선택) 안드로이드 테스트 서명 키 | 없으면 새 키로 다시 시작 — 테스트 설치자는 재설치 필요 |
| `integrations/bapmunna-firebase/LICENSE` 저작권자 표기 변경 합의 | 지금 "jooji13" 개인 명의 |

## 아직 코드에 남은 기존 계정 값

새 주소가 정해진 뒤 고친다. (`npm run check:personal-info`는 개인 정보만 본다. 팀 공용 메일은 `config/personal-info.json`의 `allowed`에 추가한다.)

- **모바일 앱(안드로이드·iOS)**: 서버 주소가 앱 안에 박혀 있음 → 새 주소로 바꾸고 **새로 빌드·배포**해야 함 (`packages/phone-steps`, `workspaces/bapmunna-mobile`).
- **Vercel 서버 기본값**: 환경변수가 없을 때 쓰는 기본값 (`integrations/bapmunna-firebase/server/*-security.mjs`) — 환경변수를 넣으면 무관하지만 기본값도 바꾸는 게 좋다.
- **Peter 전용 관리 스크립트**: `integrations/bapmunna-firebase/scripts/firebase-admin.mjs`, `smartthings-deployment.mjs`, `workspaces/bapmunna-final/scripts/publish.mjs` 등은 기존 개인 사이트에 덮어 올리는 방식이라 팀 배포에는 쓰지 않는다 (`npm run deploy:team` 사용).
- **데모 데이터의 실제 플러그 ID** (`lib/demo/state.ts` 등) → 가짜 ID로 교체.
- **QR 이미지** `public/bapmunna-app-qr.png` 등은 옛 주소를 담고 있음 → 새 주소로 다시 만든다.
- 테스트 파일들의 예시 주소.
