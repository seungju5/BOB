# Database · 계정·식사·가족 돌봄·고객관리

v0.3 · 2026-10-16. 아래 표는 이전 디자인 통합판의 데이터 계약이다. 팀 운영 데이터 모델은 [팀 앱 안내](../../../apps/warming-up/README.md)에서 확인한다.

Firebase 판은 Auth·Firestore를, 선택형 Supabase 판은 별도의 Auth·PostgreSQL을 사용하도록 설계했다. 계정과 UID, 저장소는 공급자별로 분리했다.

Ipilot의 공개 [로그인](https://ipilot.co.kr/login/)·[가입](https://ipilot.co.kr/Register/) 순서만 참고했다. 내부 DB·관리 화면·약관을 복제하거나 가입하지 않았다.

## 환경 설정 확인

로컬 Firebase 호환성 검사는 루프백 에뮬레이터와 합성 계정을 사용한다. 선택형 Supabase의 자격 증명은 별도로 관리한다.

## 생성한 데이터 영역

| 용도 | Firebase 경로 | Supabase 테이블 |
| --- | --- | --- |
| 개인 프로필 | `bapmunnaAccounts/{uid}` | `bapmunna_accounts` |
| 개인 식사 | 프로필 하위 `meals/{day_meal}` | `bapmunna_meals` |
| 고객 기본정보 | `bapmunnaCRMContacts/{uid}` | `bapmunna_crm_contacts` |
| 내부 운영 메모 | `bapmunnaCRMNotes/{uid}` | `bapmunna_crm_notes` |
| 운영자 역할 | `bapmunnaStaff/{uid}` | `bapmunna_staff` |
| 가정·공유 동의 | `bapmunnaHouseholds/{hid}` | `bapmunna_households` |
| 가족 관계·역할 | 가정 하위 `members/{uid}` | `bapmunna_memberships` |
| 일회용 초대 | `bapmunnaInviteTokens/{SHA256}` | `bapmunna_invitations` |
| 생활·알림 기준 | 가정 하위 `preferences/main` | `bapmunna_preferences` |
| 기기 등록 | 가정 하위 `devices/{id}` | `bapmunna_devices` |
| 일별 기기 집계 | 가정 하위 `deviceDaily/{id}` | `bapmunna_device_daily` |
| 알림·연락 요청 | 가정 하위 `alerts/{id}` | `bapmunna_alerts` |
| 외출 기간 | 가정 하위 `away/{id}` | `bapmunna_away_periods` |
| 동의 변경 이력 | 가정 하위 `consentEvents/{id}` | `bapmunna_consent_events` |

Firestore는 테이블 생성 명령이 없는 문서 DB다. [schema.json](../firebase/schema.json)의 16개 경로 계약, [접근 규칙](../firebase/care-domain.rules), [인덱스](../firebase/firestore.indexes.json)를 적용한다. 유효한 첫 저장 때 경로가 생기며 빈 고객 문서를 만들지 않는다. 관리 전용 `bapmunnaSystem/schema`에는 버전·해시·계약만 저장하고 클라이언트 접근을 막는다. `mealSummaries`는 개인 식사와 같은 원자적 배치에서 검증하는 공유용 복사본이다.

Supabase는 [001](../supabase/001_bapmunna_accounts.sql)의 5개와 [003](../supabase/003_care_domain.sql)의 9개, 총 **14개 테이블**이다. RLS·최소 작업/열 권한·검증 트리거·조회 인덱스를 적용했다. `bapmunna_usage_report`는 호출자의 RLS를 따르는 집계 뷰다. 가족은 필드 허용목록을 쓰는 `bapmunna_family_summary` RPC로만 요약을 읽는다.

## 실제 화면 연결 상태

로그인·이메일 확인·복구, 개인 프로필, 오늘의 직접 식사 확인 저장·최근 90개 조회·개별 삭제, 별도 운영자 CRM을 연결했다. CRM은 회원 기본정보·최근 이용·운영 단계·1,000자 메모를 다루며 비밀번호·개인 식사를 포함하지 않는다.

가족·기기·알림은 **서버 스키마와 권한 계약을 생성·검증했지만 해당 화면은 아직 가상 체험**이다. 실제 초대 전송·가족 간 공유 UI, 기기 게이트웨이, 푸시는 연결하지 않았다. 데모 값은 자동 업로드하지 않는다. 스키마 준비를 이 기능들의 운영 완료로 표현하지 않는다.

## 필드·권한·동의 검증

- 비밀번호와 인증 상태는 각 Auth 서비스가 관리한다. 이메일 확인에 사용자가 편집할 수 있는 메타데이터를 신뢰하지 않는다.
- 개인 식사는 한국 날짜와 아침/점심/저녁·집/외식만 기록한다. 당일만 쓰고 중복은 갱신한다. Firestore의 `dayStart`도 정확한 한국 자정인지 검사한다. 최근 90개 조회는 자동 삭제 정책이 아니다.
- 생활 기준은 겹치지 않는 3개 시간대, 0~180분 유예, 중복 없는 끼니 목록, 거주·기기·알림 임계값을 검사한다. 밥솥 사용을 식사·섭취량·건강·응급 상태로 변환하지 않는다.
- 기기는 미연결 상태로 등록하고 사용자는 라벨만 변경한다. 연결 상태·집계의 클라이언트 위조를 막는다. 신뢰된 수집기에서도 현재 동의와 관찰 기간을 검사해야 한다. 수집기는 아직 배포하지 않았다.
- 외출은 시작이 현재~7일 이내, 기간 최대 7일이다. 가족 요약에는 정확한 일정 대신 외출 여부만 제공한다. 연락 요청은 실제 전화·긴급 신고를 보내지 않는다.
- 확인된 소유자만 개인 기록에 접근한다. 운영자 지위로 다른 회원의 개인 기록·가족 요약을 읽거나 자신을 가족으로 승격할 수 없다.
- 초대는 무작위 토큰의 SHA-256만 저장하며 24시간·일회용·교체·철회를 적용한다. `caregiver/viewer` 역할은 소유자가 정한다. viewer는 도움·관계 요청을 읽거나 확인할 수 없다. 알림 확인은 식사를 생성하지 않는다.
- Supabase 초대와 수집 트리거는 가정 잠금 순서를 통일해 동의 철회와 경쟁하지 않게 한다. 프로필 이메일·시각·메모 작성자는 서버가 확정한다.

공유 중지의 구현 차이를 유지한다.

| 공급자 | 중지·재개 효과 |
| --- | --- |
| Firebase | `sharingEpoch` 증가로 이전 가족·초대·요약 접근을 즉시 무효화한다. 재개해도 이전 권한은 복구되지 않는다. 오래된 하위 문서의 물리 삭제·백업 소거는 별도 관리 작업이다. |
| Supabase | 해당 가정의 초대·가족·공유 집계·알림·외출 행을 제거한다. 개인 식사는 남는다. 재개 후 이전 가족·관찰을 자동 복구하지 않는다. |

인프라 관리 권한은 앱 안의 운영자 역할과 구분한다. 계정 전체 삭제·보존 기간·백업 제거·감사 이력은 당시 후속 운영 설계에 남았다.

## 세션·메일·비용

‘로그인 상태 유지’를 선택할 때 지속 세션을 사용한다. 비밀번호 입력값은 보관하지 않는다. Firebase는 이메일/비밀번호와 Google 로그인을 제공한다. 기본 앱은 Firebase로 유지했고 유료 요금제·Cloud Functions·새 결제 연결은 추가하지 않았다. 무료 제공 범위에는 사용량과 서비스 조건의 제한이 있다.

Supabase는 별도 PKCE 계정과 이메일 확인을 사용한다. 확인 링크는 가입을 시작한 브라우저에서 연다. 당시 공개 가입용 SMTP 설정과 운영자 로그인은 후속 확인 항목이었다.

## 실행 검증

- 당시 Firebase Auth·Firestore 에뮬레이터 검사 31개가 통과했다.
- 실제 Supabase: 계정·CRM **24개**, 돌봄 **58개** 검사 통과. 테스트 사용자·데이터 전부 rollback·부재 확인.
- 익명 접근 거부와 배포 모듈 일치는 공개 HTTPS에서 별도 검사한다. 실제 이메일 수신·첫 식사 입력·운영자 로그인은 본인 계정으로 확인해야 한다.

공식 근거: [Firebase 인증](https://firebase.google.com/docs/auth/web/password-auth), [Firestore 필드 규칙](https://firebase.google.com/docs/firestore/security/rules-fields), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [반환 URL](https://supabase.com/docs/guides/auth/redirect-urls).


## 관리센터 조회·편집 계약

관리센터의 시각화는 CRM 기본정보·운영 메모만 집계한다. 실제 식사·건강·IoT 분석을 추가하지 않았다. 화면에는 조회한 범위와 갱신 시각이 표시되며, 일별 가입 집계는 한국 날짜를 사용한다.

두 어댑터의 `listCustomers({cursor})`는 `{customers, nextCursor, hasMore}`를 반환한다. 51행을 요청해 다음 페이지 유무를 확인하고 50행을 표시한다. 생성 시각과 UID를 내림차순으로 정렬하므로 같은 시각의 가입도 페이지 경계에서 빠지지 않는다. Firebase는 문서 커서와 25명씩의 메모 조회를, Supabase는 생성 시각·UID 복합 조건을 사용한다. 검색·차트는 조회한 집합에 적용하며 페이지 추가 시 ID로 중복을 제거한다. 새로고침은 첫 페이지부터 다시 조회한다.

메모 저장 결과는 서버가 확정한 단계·메모·수정 시각으로 화면을 갱신한다. 비밀번호·운영자 이메일 하드코딩·개인 식사 접근·새 권한·새 DB 컬렉션은 추가하지 않았다. 다운로드나 고객 데이터 외부 전송도 추가하지 않았다.

구현 근거: [Firestore 커서](https://firebase.google.com/docs/firestore/query-data/query-cursors), [Supabase OR 조건](https://supabase.com/docs/reference/javascript/or).

## v1.1 기능 보강의 저장 경계 · 2026-10-16

추가한 가구 인원·반려동물·보온/취사 습관·온보딩·전력 분류 상태·개폐 시각은 공개 체험의 탭 메모리에서만 다룬다. 실제 사용자/가족 데이터로 저장하지 않으며 이번 변경은 Firebase/Supabase 스키마·규칙·CRM 권한을 수정하지 않는다. 실제 연동 때 필요한 동의/소유권/서버 수신 검증은 [v1.1 잔여 조건](worksheet-v11.md)을 따른다.
