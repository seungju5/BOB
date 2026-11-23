# 팀 Firebase 운영 안내

밥뭇나는 2026년 11월 21일부터 팀 프로젝트 `warming-up-bapmunna`의 Firebase Hosting, Authentication, Cloud Firestore를 사용합니다. 보호자는 팀 웹앱에서 본인 이메일로 가입하고 확인한 뒤 가구 정보와 생활·알림 설정을 저장합니다. [팀 웹앱](https://warming-up-bapmunna.web.app/) · [팀 앱 소스](../apps/warming-up/)

## 소스와 데이터 확인

| 확인할 내용 | 위치 |
| --- | --- |
| 팀 웹앱 소스 | `main`의 [apps/warming-up](../apps/warming-up/) |
| Hosting 사이트, Firestore 데이터베이스와 규칙 경로 | [Firebase 설정](../apps/warming-up/firebase.json) · [프로젝트 ID](../apps/warming-up/.firebaserc) |
| 계정별 프로필·가구·알림 저장 범위 | [팀 앱 안내](../apps/warming-up/README.md) · [Firestore 보안 규칙](../apps/warming-up/firebase/firestore.rules) |
| 인증 사용자와 저장된 문서 | [팀 Authentication](https://console.firebase.google.com/project/warming-up-bapmunna/authentication/users) · [팀 Firestore](https://console.firebase.google.com/project/warming-up-bapmunna/firestore/databases/-default-/data) |

실제 계정은 팀 Hosting의 같은 출처에서 Firebase 설정을 받습니다. 이전 앱의 사용자나 가구 자료를 가져오는 절차 없이 팀 회원의 가입과 동의로 저장을 시작합니다.

## 로컬 실행과 검사

저장소를 내려받은 뒤 Node.js 24로 아래 명령을 실행합니다.

```sh
cd apps/warming-up
npm ci
npm test
npm run check:types
npm run build
node scripts/check-public.mjs
```

`npm run dev`로 브라우저에서 데모를 열 수 있습니다. 계정 저장·권한을 시험할 때는 팀 앱 안내에 기록된 로컬 Auth·Firestore 에뮬레이터와 `demo-warming-up` 가상 프로젝트를 사용합니다. [로컬 계정 검사와 게시·복구 안내](../apps/warming-up/README.md)

저장소 루트의 `npm run build:team-site`도 `apps/warming-up`의 빌드를 실행합니다. 루트의 `npm run deploy:team`은 팀 Firebase 전용 브랜치의 검증된 GitHub 빌드를 게시하는 소유자 명령입니다. [팀 게시·복구 절차](../apps/warming-up/README.md#배포와-복구)

루트에는 Next.js/Supabase 앱이 있고, 이전 Firebase 디자인 통합판은 로컬 체험과 호환성 검사용으로 보관합니다. 팀 웹앱의 소스·배포 설정은 위 표의 경로에서 확인할 수 있습니다. [이전 디자인 통합판](../integrations/bapmunna-firebase/README.md)
