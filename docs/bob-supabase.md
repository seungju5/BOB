# BOB 팀 Supabase 배포

| 구성 | 팀에서 확인할 위치 |
| --- | --- |
| 웹 화면 | 저장소 루트의 Next.js 앱. 팀 Vercel 프로젝트는 [tmdwn1/bob](https://vercel.com/tmdwn1/bob)이며 [밥뭇나 주소](https://bob-tmdwn1.vercel.app/)로 연결된다. |
| 계정·DB·기기 처리 | [Supabase BOB](https://supabase.com/dashboard/project/vqqolzpodmaibnjazxus). 프로젝트 ID는 `vqqolzpodmaibnjazxus`다. |
| 배포할 소스 | [DB 마이그레이션](../supabase/migrations/)과 [서버 함수](../supabase/functions/). |

### DB와 서버 함수 반영

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
