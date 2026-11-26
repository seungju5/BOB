# BOB 팀 Supabase 배포

| 구성 | 팀에서 확인할 위치 |
| --- | --- |
| 웹 화면 | 저장소 루트의 Next.js 앱. 팀 Vercel 프로젝트는 [tmdwn1/bob](https://vercel.com/tmdwn1/bob)이며 [밥뭇나 주소](https://bob-tmdwn1.vercel.app/)로 연결된다. |
| 계정·DB·기기 처리 | [Supabase BOB](https://supabase.com/dashboard/project/vqqolzpodmaibnjazxus). 프로젝트 ID는 `vqqolzpodmaibnjazxus`다. |
| 배포할 소스 | [DB 마이그레이션](../supabase/migrations/)과 [서버 함수](../supabase/functions/). |

### DB와 서버 함수 반영

하루 다섯 끼와 날짜별 끼니 설정에는 `0009_five_meal_windows.sql`과 `senior`·`jobs` 함수가 필요하다. 이 변경은 기존 가구의 저장된 끼니와 기록을 유지한다.

아래 명령은 팀 저장소 루트와 Supabase CLI 3.3 기준이다. CLI에 BOB를 관리할 수 있는 계정으로 로그인한 뒤 운영 DB의 적용 이력을 비교한다. 대시보드에서 BOB가 보이지 않으면 BOB 조직의 팀 설정에서 초대를 받고 수락한다. [Supabase 팀 권한 안내](https://supabase.com/docs/guides/platform/access-control)

```sh
supabase login
supabase migration list --remote=vqqolzpodmaibnjazxus
supabase functions list --remote=vqqolzpodmaibnjazxus
supabase db push --remote=vqqolzpodmaibnjazxus --skip-vault --dry-run
```

이미 테이블이 있는데 최초 생성 파일 `0001_init.sql`이 다시 적용될 목록에 나오거나 목록에 팀의 별도 변경이 있으면 기존 스키마와 이력을 대조한다. 적용 계획이 일치하면 DB를 먼저 올린다. 이어서 변경한 함수 3개를 배포하고 버전을 확인한다. [DB 배포 안내](https://supabase.com/docs/guides/deployment/database-migrations) · [함수 배포 안내](https://supabase.com/docs/guides/functions/deploy)

```sh
supabase db push --remote=vqqolzpodmaibnjazxus --skip-vault
supabase functions deploy register-plug senior jobs --remote=vqqolzpodmaibnjazxus --use-api
supabase migration list --remote=vqqolzpodmaibnjazxus
supabase functions list --remote=vqqolzpodmaibnjazxus
```

### 웹 로그인과 시연

1. 기존 Vercel 프로젝트의 운영 환경에서 `NEXT_PUBLIC_SUPABASE_URL`을 `https://vqqolzpodmaibnjazxus.supabase.co`로 지정하고 BOB의 공개 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` 또는 기존 `NEXT_PUBLIC_SUPABASE_ANON_KEY`를 설정한다. 공개 설정이 비어 있으면 웹에서 데모를 열 수 있다. 서버용 키는 브라우저 환경 변수에 넣지 않는다.
2. BOB의 **Authentication → URL Configuration**에서 운영 주소와 `https://bob-tmdwn1.vercel.app/auth/callback` 복귀 주소를 확인한다. 로그인 메일을 요청한 같은 브라우저에서 링크를 열어 튜토리얼에 들어간다. 소셜 로그인에는 각 제공자의 별도 설정도 필요하다. [로그인 연결 가이드](google-kakao-login.md)
3. 팀 테스트 계정으로 가구 설정을 저장하고 새로고침한다. 다른 테스트 계정에서 자기 가구만 보이는지, 기기 신호를 한 번도 받지 않은 홈에는 측정 대기가 표시되는지 확인한다.
4. 실제 측정 검증에는 동의한 테스트 가구의 전력 플러그가 필요하다. 연결 후 삼성의 **측정 시각**과 밥뭇나의 최근 수신을 대조한다. 개인 파일과 가상 플러그는 별도로 표시된다. 가구를 대상으로 한 삼성 비즈니스 OAuth는 삼성 승인과 팀 설정 이후에 검증한다. 휴대폰 걸음 수 공유도 연결된 운영 서버가 필요하며, 현재 메뉴에서는 산책 하트와 순위 예시를 체험할 수 있다.

웹 화면 복구는 기존 Vercel 프로젝트의 이전 정상 배포를 선택한다. DB 버전은 그대로 남으므로 현재의 적용 이력과 함수 버전을 기록해 두고, SQL 변경을 되돌려야 할 때에는 해당 변경에 맞는 후속 마이그레이션을 사용한다.

### 팀 Firebase 웹앱의 휴대폰 알림

BOB의 Next.js 서버는 `GET /api/smartthings/config`와 `POST /api/smartthings/notification-subscription`을 제공한다. 팀 Vercel은 저장소 루트에서 Node.js 24로 `npm ci`와 `npm run build`를 실행한다. 두 경로는 `warming-up-bapmunna`의 Firebase 로그인과 Firestore 동의·구독을 사용한다. 삼성 OAuth 콜백·웹훅과 실물 신호의 자동 발송을 운영하려면 팀 측 수신 서버를 배포하고 삼성에 해당 주소를 등록·검증해야 한다. 현재 팀 Firebase는 정적 Hosting으로 운영 중이며 서버 배포와 삼성 웹훅 확인을 기다리고 있다.

1. Vercel 팀 관리자가 `tmdwn1/bob`의 운영 주소에서 Firebase 웹앱의 GET·OPTIONS·POST가 Vercel 로그인 없이 API까지 도달하는지 확인한다. 기기 구독에는 팀 Firebase ID 토큰이 필요하다. Firebase Hosting은 Spark로 유지한다.
2. Google Cloud 팀 관리자는 프로젝트 번호 `446376297496`의 Vercel 런타임 전용 Workload Identity Federation 공급자에 팀 발급자 `https://oidc.vercel.com/tmdwn1`과 허용 대상 `https://vercel.com/tmdwn1`을 설정한다. `google.subject=assertion.sub`로 매핑하고, Vercel 대시보드에서 확인한 실제 `owner_id`와 `project_id`, `environment == 'production'`을 공급자 조건에 함께 제한한다. 해당 서비스 계정에 대한 `roles/iam.workloadIdentityUser`는 `owner:tmdwn1:project:bob:environment:production` 주체에 부여한다. [Vercel의 Google Cloud 연결](https://vercel.com/docs/oidc/gcp) · [OIDC 클레임](https://vercel.com/docs/oidc/reference)
3. 런타임 서비스 계정에는 팀 Firebase의 사용자 조회·취소 확인, 동의·연결 조회, 알림 구독의 조회·트랜잭션·삭제에 필요한 권한을 부여한다. Vercel Production 환경에 `FIREBASE_PUSH_WIF_PROVIDER`(전체 `projects/.../providers/...` 경로)와 `FIREBASE_PUSH_SERVICE_ACCOUNT`(팀 런타임 계정 이메일)를 지정한다. Firebase Hosting 배포 계정, GitHub 배포 공급자, 개발자의 로컬 ADC, BOB Supabase 자격은 각자 원래 용도로 관리한다.
4. Vercel Production 비밀 설정의 `FIREBASE_PUSH_VAPID_PRIVATE_KEY`에는 이 Firebase 앱의 P-256 VAPID 개인키(Base64URL), `FIREBASE_PUSH_ENCRYPTION_KEY`에는 별도 32바이트 AES 키(Base64)를 둔다. 같은 구독에 자동 취사 알림을 보낼 팀 Cloud Run에는 **같은 Firebase용 두 값**을 각각 `WEB_PUSH_PRIVATE_KEY`, `WEB_PUSH_ENCRYPTION_KEY`로 연결한다. 삼성 OAuth 토큰 암호화와 BOB Supabase 푸시에는 별도의 키를 쓴다.
5. 팀 웹앱 원점으로 설정을 요청해 HTTP 200 JSON의 프로젝트 ID와 `webPush.publicKey`, CORS 원점을 확인한다. WIF나 키가 준비되지 않은 동안 응답에서 공개키가 빠진다. 정상 응답을 확인한 뒤 Firebase 웹앱에 이 고정 주소를 연결하고, 동의한 기기에서 시험 푸시의 잠금화면 수신을 확인한다. 실제 밥솥의 자동 알림은 등록된 팀 서버에서 새 실물 신호가 들어온 뒤 별도로 확인한다. [기기 등록과 발송 조건](../apps/warming-up/server/smartthings/notifications.md)
