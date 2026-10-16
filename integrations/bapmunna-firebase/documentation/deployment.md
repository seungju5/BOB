# 공개 앱 · 배포 기록

v0.3 · 2026-10-16 · 상태: Firebase·Supabase 프런트엔드 게시 완료, Supabase 공개 가입 메일 설정 대기

| 버전 | 공개 앱 | 내 기록 | 고객관리 |
| --- | --- | --- | --- |
| Firebase | https://ku-gpa.web.app/bapmunna/ | https://ku-gpa.web.app/bapmunna/#account | https://ku-gpa.web.app/bapmunna/manage/ |
| Supabase | https://ku-gpa.web.app/bapmunna/supabase/ | https://ku-gpa.web.app/bapmunna/supabase/#account | https://ku-gpa.web.app/bapmunna/supabase/manage/ |

사용자가 지정한 기존 Firebase Hosting `ku-gpa`에 두 프런트엔드를 게시했다. Supabase 버전은 프로젝트 `dakozsbqltciqihazzel`의 Auth·PostgreSQL을 사용한다. 두 공급자의 계정과 DB는 독립적이다. 로그인 없는 가상 체험은 공개하고 개인 기록·CRM 조회에는 인증·권한을 적용한다.

## 확인된 게시 결과

- Hosting version: `sites/ku-gpa/versions/013c79656beee527`
- Hosting release: `sites/ku-gpa/releases/1792122851209000`
- Firestore ruleset: `projects/ku-gpa/rulesets/407b97da-502a-4f46-8928-ec44ee17166d`
- 배포 전 기존 파일 74개를 기준으로 확인. `/bapmunna/` 외 **60개 경로의 원래 해시와 기존 설정 유지**.
- 앱·CRM 네 경로와 모듈·CSS·토끼 이미지·폰트는 익명 HTTPS에서 200, 올바른 MIME과 base URL 확인.
- Supabase의 테이블 14개와 집계 뷰는 익명 REST에서 401, Firebase 고객 목록·가정 목록·관리 스키마는 403으로 거부.
- Supabase 이메일 공급자 활성화와 이메일 확인 필수 상태 확인. 사용자 승인으로 Site URL을 `https://ku-gpa.web.app/bapmunna/supabase/`로 저장했다.
- 추가 허용 URL은 정확한 두 주소만 사용한다: `https://ku-gpa.web.app/bapmunna/supabase/?flow=account#account`, `https://ku-gpa.web.app/bapmunna/supabase/?flow=recovery#account`.
- 기존 기본 SMTP는 프로젝트 팀 이메일만 대상으로 한다. 사용자가 custom SMTP를 직접 설정하기로 했다. 설정 완료와 실제 수신 확인 전까지 앱에 제한 안내를 유지한다. 이메일 확인을 생략해 우회하지 않는다.
- Firebase 소유자의 기존 이메일 확인 계정에는 CRM 역할을 부여했다. Supabase에는 아직 가입 사용자가 없어 운영자 지정은 본인 가입·확인 뒤 진행한다.

공개 페이지 응답과 데이터 접근 차단이 실제 사용자 메일 수신·본인 식사 저장의 종단간 검증을 대신하지 않는다. 첫 실제 회원의 비밀번호 입력·이메일 확인·식사 자기보고는 본인이 수행해야 한다.

## 재배포

1. 기존 라이브 상태를 보존하기 위해 `npm run firebase:inspect`를 실행한다. CLI의 인증 토큰은 메모리에서만 사용한다. 기준 자료는 Git에서 제외한 `tmp/firebase/`에 저장한다.
2. 계정/DB 규칙을 바꿨다면 `node scripts/firebase-admin.mjs prepare-rules`, `npm run test:cloud`, `node scripts/firebase-admin.mjs test-rules` 순서로 검증한다. 기존 규칙의 소스를 유지한 병합과 정확한 해시 증거가 있어야 `publish-rules`가 동작한다. `bapmunna.rules`나 `care-domain.rules` 조각만 기존 서비스 전체 규칙으로 배포하지 않는다. `provision-schema`는 관리 manifest와 누락된 자체 인덱스만 추가하며 다른 인덱스를 삭제하지 않는다.
3. `npm test`, `npm run build:cloud`, `npm run build`를 수행한다. 계정 UI·권한·브라우저와 단일 파일의 구문/참조를 확인한다.
4. `npm run stage:firebase`로 공개 파일만 `tmp/firebase-hosting/`에 준비한다. 각 앱·CRM에 정확한 base URL을 넣고 공급자 설정을 각각 선택한다. 원본 변경 여부와 staging 파일 SHA-256을 기록하며 게시 시 다시 검사한다. 원본 워크시트·DB SQL·운영 인증·고객 데이터는 복사하지 않는다.
5. `node scripts/firebase-admin.mjs publish-hosting`은 원래 파일 해시를 재사용하고 `/bapmunna/`만 교체한다. 다른 경로가 달라지거나 도중 다른 배포가 나타나면 release 전에 중지한다. 기존 사이트 전체를 로컬 폴더 하나로 덮어쓰지 않는다.
6. `node scripts/verify-public.mjs`와 실제 브라우저로 두 앱·CRM·자산·익명 DB 차단을 확인한다. 문서와 GitHub를 함께 반영한다.

Firebase Hosting의 기존 trailing slash 제거 설정을 유지하므로 문서에 `<base>`를 명시한다. Supabase 콜백은 앱 루트로 돌아오고 PKCE 세션을 처리한다. 프런트엔드 공개가 DB 전체 공개를 뜻하지 않는다.

## 보존한 배포 제약

GitHub `jooji13/Synagogue`는 private다. 현재 요금제에서 Pages를 사용하기 위해 공개 전환하거나 유료 업그레이드하지 않았다. 초기 Sites 프로젝트는 최종 Firebase 목적지 확정 전에 등록만 했고 게시하지 않았다. 현재 앱 주소로 안내하지 않는다.

첫 Hosting 시도는 요청 옵션을 CLI가 변경해 이후 GET에 본문이 남는 문제로 release 전에 중단됐다. 매 요청의 옵션을 새로 생성하도록 수정한 뒤 보존 검사를 통과한 버전만 게시했다.

## 최종 간소화·전체 스키마 게시

기본 서비스는 Firebase다. 사용자의 기존 이름 변경을 보존해 표시 이름은 Warming Up으로 통합했다. 밥뭇나의 주소·데이터 경로는 유지한다. 홈·기록·더보기 3개 메뉴와 짧은 계정 폼, 설정 펼침 목록을 게시했다.

Firestore에는 16개 경로 계약을 담은 관리자 전용 manifest, 4개 조회 인덱스(모두 READY), 31개 검사를 통과한 규칙을 적용했다. Supabase에는 14개 테이블·가족 요약 RPC·집계 뷰와 권한을 적용했고 계정 24개·돌봄 58개 검사가 실제 프로젝트에서 통과했다.

한때 다른 배포와 HTML/모듈 버전이 섞이는 초기화 실패가 있었다. 사용자가 다른 작업을 멈춘 뒤 최신 소스를 같은 staging으로 묶고, 네 HTML과 모든 핵심 모듈의 바이트 일치 검사를 통과했다. `/bapmunna`와 `/bapmunna/**` 모두 no-cache/no-store 정책을 적용했다. 원래 다른 60개 경로의 해시와 기존 사이트 설정은 유지했다.

320/390px·큰 글씨·1280px의 관찰한 화면에서 가로 넘침이 없었고 설정 저장·가입/복구 화면 전환을 확인했다. 실제 운영자 Google 로그인은 사용자가 나중에 검사하기로 했다. Supabase 공개 가입 SMTP는 사용자 설정 완료 확인이 필요하다. 가족·기기·알림 화면은 서버 스키마 준비와 별개로 계속 명시된 가상 체험이다.

## Impact Series / KU Open World 이전 준비 상태 (2026-10-16)

요청한 목적지는 앱 → `impact-series.web.app`, 경주路 → `ku-open-world.web.app/gyeongju/`다. 준비본과 전용 게시 도구는 이 문서 기준 `../../output/site-migration-20261016/`에 있다. 앱은 `ku-gpa` 인증·DB를 유지하고, 경주路는 기존 Impact Series 공개 백엔드 설정을 명시적으로 유지한다. 두 서비스의 사용자 데이터를 서로 복사하지 않는다.

`ku-gpa` Auth의 `impact-series.web.app` 추가는 사용자 승인 후 적용·확인했다. `impact-series` Auth는 초기화되어 있지 않아 승인된 두 번째 도메인 추가가 실패했다. 새 인증 서비스를 임의로 생성하지 않았으므로 경주路의 실제 인증 동작은 별도 확인이 필요하다.

앱 58개·게이트 선택 8개 검사와 로컬 화면·추가 월드 이동 검증은 통과했지만 **공개 배포는 완료되지 않았다**. 양쪽 Hosting 저장 한도로 버전 생성이 거부되었고 KU에는 별도로 트래픽 한도 페이지가 표시된다. 이전 원본 주소는 그대로 남겨 두었다.

재개 시 `status.json`과 각 사이트 `cleanup-proposal.json`을 먼저 확인한다. 과거 버전 삭제는 별도 명시적 승인이 있어야 하며 현재 릴리스·직전 2개·현재보다 최신인 미공개 빌드를 보존한다. 승인된 정리 후에도 현재 릴리스와 준비본의 기준 해시를 다시 확인해야 한다. `publish.mjs`는 동시 배포 감지 시 중지하며 전체 파일 지도를 보존한 overlay만 게시한다. 저장 한도 해소가 KU의 트래픽 한도 해소를 보장하지 않으며 유료 전환은 승인되지 않았다.

### 승인 후 게시 결과

위 대기 상태 이후, 사용자가 Impact 49개·KU 178개 과거 Hosting 버전 삭제를 명시적으로 승인했다. 승인 제안서 해시를 고정한 `cleanup.mjs`로 삭제하고 삭제 상태·보존 버전·현재 파일 지도 일치를 검증했다. 보존 대상과 삭제 영수증은 각 `cleanup-result.json`에 기록했다. 삭제한 옛 배포의 롤백은 불가능하며 사용자 DB 삭제가 아니다.

| 목적지 | 게시 버전 | 확인된 상태 |
| --- | --- | --- |
| [Impact Series 앱](https://impact-series.web.app/) | `d2bcdd9c6e1e59a0` | 200 응답·해시 일치·모바일 체험/기록/로그인 화면 확인 |
| [KU Open World 경주路](https://ku-open-world.web.app/gyeongju/) | `3cfac32c25a470b3` | 게시 파일 지도 일치. 공개 접속은 트래픽 한도 509로 차단 |

이전 소스는 작업 도중 올라온 KU GPA 공개 버전 `7d460dc87c5ec132`로 갱신해 최신 관리센터를 포함했다. 원래 KU GPA 앱은 수정하지 않았으며 기존 계정·DB를 공유한다. Impact의 기존 경주路는 [보존 주소](https://impact-series.web.app/gyeongju/)에서 계속 열 수 있다. 기존 다른 Impact 2,260개·KU 4,973개 경로를 유지했다.

실제 계정 로그인은 사용자가 검증해야 한다. 경주路의 기존 Impact Auth 미설정과 KU 트래픽 한도는 별도 잔여 사항이다. Hosting 정리로 트래픽 제한이 해제되었다고 표시하지 않는다. KU가 다시 서비스되면 공개 게이트·추가 월드→경주路 이동을 재검증한다. 추가 삭제·유료 전환·새 인증 서비스 생성은 이번 승인 범위가 아니다.


## 관리센터 UI 배포 · 2026-10-16

두 관리센터에 회원 수치·가입 추이·단계 도넛·검색/정렬/필터·상세 메모 편집을 반영했다. Firebase가 기본이며 두 DB의 계정은 독립적이다.

- Hosting version: `sites/ku-gpa/versions/7d460dc87c5ec132`
- Release: `sites/ku-gpa/releases/1792125247781000`
- 게시 대상 91개 파일, 변경 blob 9개. 기존 비앱 60개 경로를 그대로 보존한다.
- 규칙은 기존 `407b97da-502a-4f46-8928-ec44ee17166d`를 유지한다. 권한이나 운영자 역할을 확대하지 않았다.
- 합성 데이터 미리보기와 테스트는 `docs/` 밖에 보관하여 게시하지 않는다. 공개 링크는 실제 로그인 전에는 회원 정보나 통계를 노출하지 않는다.

## 2026-10-16 15:12 KST · 밥뭇나 UI 및 환영 인트로

Impact Series에 `ab4b4deca45a6b51`을 게시했다. 직전 버전은 `d2bcdd9c6e1e59a0`이며 삭제하지 않았다. 기존 7개 UI 파일 수정 + 영상/포스터 2개 추가, 나머지 2,309개 경로 및 Hosting 설정을 그대로 보존했다. 계정·DB·Auth·보안 규칙·요금제와 KU GPA/KU Open World는 변경하지 않았다.

공개 주소는 https://impact-series.web.app/, 영상은 https://impact-series.web.app/bapmunna/assets/bapmunna-hero.mp4 다. 변경 파일 9개의 공개 바이트 해시와 전체 파일 지도 검증이 완료됐다.

같은 작업 폴더에서 별도로 진행 중이던 어르신용/보호자용 분리 변경은 덮어쓰거나 미완성 상태로 배포하지 않았다. 이번 수정만 분리한 소스·직전 파일·계획·게시/검증 영수증은 `../../output/bapmunna-polish-20261016/`에 보관한다. 공개 콜백 주소는 Impact Series로 유지하고 기존 Firebase ku-gpa 인증·DB를 사용한다.

## Senior / Carer 배포 · 2026-10-16

워크시트에 따라 어르신용 `/bapmunna/senior/`와 보호자용 `/bapmunna/carer/`를 게시했다. Supabase도 `/bapmunna/supabase/senior/`, `/bapmunna/supabase/carer/`에 같은 역할 구성을 제공한다. [두 버전 명세](editions.md).

- Hosting version: `sites/ku-gpa/versions/fcf7df9f9e69d9ae`
- Release: `sites/ku-gpa/releases/1792131500592000`
- 공개 파일 103개, 변경 blob 17개. 기존 비앱 60개 경로와 Firestore 규칙 보존.
- 동시 작업이 계속된다는 사용자 답변에 따라 `tmp/editions-release/`에 검증 소스를 고정했다. 이 고정본에서 두 공급자 staging·구문·시나리오·역할 검사를 실행하고 배포 직전/직후 버전 일치 검사로 다른 릴리스 덮어쓰기를 막았다.
- 8개 앱/관리/역할 HTML, 두 공급자의 모듈/스타일이 staging과 일치하고 네 역할 링크는 HTTP 200으로 열린다. 익명 DB 접근은 계속 거부된다.
- 공개 브라우저의 Senior 390px 확인 버튼, 역할 전환, Carer 화면과 콘솔 오류 없음 확인. 실제 사용자 로그인·메일 수신·가족 연동을 수행했다는 의미는 아니다.
- 기존 `7d460dc87c5ec132-168b7410e69a` 복구 기준을 보존하고 새 `fcf7df9f9e69d9ae-168b7410e69a` 로컬 복구 스냅샷과 이력 보고서를 생성했다. 고객 데이터는 이 파일 이력에 포함하지 않는다.

역할 선택을 유지하는 기본 Firebase 계정 링크까지 보완한 최종 버전은 `sites/ku-gpa/versions/6c1081ff6ac9552f`, release `sites/ku-gpa/releases/1792131714566000`이다. 앞선 역할 분리 배포에서 계정 모듈 blob 하나만 바뀌었다.
