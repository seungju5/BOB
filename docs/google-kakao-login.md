# Google·카카오 로그인 연결

보호자용 Next.js 앱은 기존 이메일 링크에 Google·카카오 로그인을 추가한다. 세 방식 모두 **같은 Supabase 프로젝트**의 계정을 사용하며, 인증 후에는 기존 가구별 RLS와 `ensure_household`를 그대로 적용한다. 별도 Firebase 앱의 계정과 데이터는 연결하지 않는다.

## 1. 앱 환경변수

배포 환경과 로컬 `.env.local`에 `NEXT_PUBLIC_SUPABASE_URL` 및 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`를 설정한다. 공개 키는 브라우저용이다. Google·카카오 Client Secret, Supabase service role 키는 저장소나 `NEXT_PUBLIC_` 변수에 넣지 않는다.

## 2. Supabase Auth 설정

1. **Authentication → URL Configuration**에서 실제 배포 주소를 Site URL로 설정한다.
2. Redirect URLs에 개발용 `http://localhost:3000/auth/callback`과 실제 배포용 `https://<앱 도메인>/auth/callback`을 각각 등록한다. 미리보기 배포를 테스트한다면 해당 주소도 명시적으로 등록한다.
3. **Sign In / Providers**에서 Google과 Kakao를 켜고 각각의 Client ID와 Client Secret을 입력한다.

## 3. Google 콘솔

- Web application OAuth 클라이언트를 만든다.
- Authorized JavaScript origins에 앱의 로컬·배포 origin을 등록한다.
- Authorized redirect URIs에는 **Supabase 대시보드의 Google Callback URL**인 `https://<project-ref>.supabase.co/auth/v1/callback`을 등록한다. 앱의 `/auth/callback`과 다른 주소다.
- OAuth 동의 화면과 테스트 사용자/게시 상태를 확인한다.

## 4. Kakao Developers

- 앱에서 Kakao Login을 켜고 REST API 키를 Supabase의 Kakao Client ID로 사용한다.
- Kakao Login Client Secret을 활성화하고 Supabase에 입력한다.
- Kakao Login Redirect URI에 **Supabase 대시보드의 Kakao Callback URL** `https://<project-ref>.supabase.co/auth/v1/callback`을 등록한다.
- 동의 항목에서 이메일 제공 여부를 결정한다. 이메일을 요청하지 않는다면 Supabase Kakao 설정의 **Allow users without an email**을 켠다. 이메일이 없는 계정은 앱의 ‘최근 사용한 계정’ 목록에 표시되지 않는다.

## 5. 검증

- 같은 브라우저에서 Google·카카오·이메일 링크 각각 로그인 → `/auth/callback` → `/start` → 가구 온보딩/홈 이동을 확인한다.
- 동의 취소, 사용한 코드 재접속, 만료된 이메일 링크에서 로그인 화면에 오류가 표시되는지 확인한다.
- 로그아웃과 다른 계정 전환 뒤 이전 가구의 화면 데이터가 남지 않는지, 다른 가구 ID로 읽기·쓰기가 RLS에서 거부되는지 확인한다.
- OAuth 제공자의 자격 증명, 실제 이메일 주소, 인증 코드, 토큰은 테스트 기록이나 PR에 남기지 않는다.

현재 저장소의 코드는 연결 준비 상태다. Supabase 프로젝트 설정과 실제 Google·카카오 계정으로 성공·취소·로그아웃을 확인하기 전에는 실서비스 연동 완료로 표시하지 않는다.

참고: [Supabase Google 가이드](https://supabase.com/docs/guides/auth/social-sign-in/auth-google), [Supabase Kakao 가이드](https://supabase.com/docs/guides/auth/social-sign-in/auth-kakao), [Redirect URL 가이드](https://supabase.com/docs/guides/auth/redirect-urls).
