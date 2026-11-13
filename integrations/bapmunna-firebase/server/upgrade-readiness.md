# 무료 유지와 향후 유료 전환 준비

**2026-11-13 재개 요청과 정정:** [최신 점검](deployment-readiness-20261113.md)의 두 프로젝트 배포안을 보관한다. 서버·Hosting은 `impact-series`, 기존 Firebase 데이터는 `ku-gpa`다. 기존 서버 테스트에 배포 경계 검사 4개를 추가했고, Java 환경을 복구한 검증 채팅이 로컬 Firestore 트랜잭션 테스트도 통과했다. 사용자는 배포 조건 확인 후 **무료 유지·공개 서버 배포 보류**를 최종 선택했다. 공개 서버와 실제 사용자 OAuth는 여전히 미완료이며 별도 재개 요청 전 결제 승인을 반복 요청하지 않는다.

2026-11-03 사용자 결정: **지금은 무료 상태를 유지하고, 나중에 유료 전환을 결정하면 이어서 배포한다.** 결제 연결·자동 과금·서버 활성화는 실행하지 않았다.

## 이미 준비한 것

| 항목 | 준비 상태 |
| --- | --- |
| 삼성 앱 | `밥뭇나 · Warming Up`, 기존 App ID 유지 |
| 로그인 후 돌아올 주소 | `https://impact-series.web.app/api/smartthings/callback` 등록 완료 |
| 기기 소식을 받을 주소 | `https://impact-series.web.app/api/smartthings/events` 등록 완료 |
| 권한 | `r:devices:*` 읽기만 등록 완료 |
| 서버 코드 | OAuth·토큰 암호화·갱신·기기 선택·웹훅 서명·중복 방지·해제 구현 |
| 서버 설정 | 프로젝트·리전·주소·실행 제한을 `deployment-config.json`에 보관 |
| 비밀 키 | 발급된 Client Secret과 암호화 키를 Git 제외·0600 로컬 파일로 보관. 공유 자료에 포함하지 않음 |
| 실제 가동 | 아직 미배포. 공개 URL HTTP 404, 삼성 Target `PENDING` |

**주소를 새로 만들지 않고, 지금 등록한 주소 뒤에 서버를 연결하는 방식이다.** 오늘의 등록을 향후 무료 사용 보장이나 실기기 연동 완료로 해석하지 않는다.

## 지금 실행할 수 있는 사전 점검

저장소 루트에서 실행한다.

```sh
npm run check:smartthings
```

- 저장된 삼성 공식 CLI 재조회 결과와 등록 manifest·배포 설정의 일치 여부를 확인한다.
- 실제 발급된 비밀 키의 준비 여부와 파일 권한만 확인한다. 비밀값은 출력하지 않는다.
- 공개 config·callback 주소를 GET으로 조회한다. 기기를 제어하거나 사용자 동의를 생성하지 않는다.
- 삼성 등록·Google 결제 상태는 **저장된 확인 시각**을 출력한다. 이 명령이 두 계정의 현재 상태까지 새로 인증·조회하는 것은 아니다.
- 결제 연결, 과금 설정, 서버 생성, Hosting 게시를 수행하는 명령은 포함하지 않는다.

네트워크 없이 설정만 확인하려면 다음 명령을 사용한다.

```sh
npm run check:smartthings -- --offline
```

다른 팀원의 컴퓨터에서 `localSecretsReady:false`가 나오면 비밀 파일이 없다는 뜻일 수 있다. 저장소나 팀 채팅으로 키를 공유하지 말고 앱 소유자가 배포 환경에 직접 주입한다.

## 유료 전환을 결정한 날의 순서

1. **기존 앱부터 재조회한다.** 공식 SmartThings CLI로 App ID `f1b8149d-45c5-4f4b-8136-2ad518faf4ec`의 앱·OAuth 설정을 읽고 위 주소·권한을 확인한다. 중복 앱 생성이나 Secret 재발급은 하지 않는다. 그날 삼성 플랜·국가·팀 이용 조건도 확인한다.
2. **사용자가 결제를 결정한다.** KU GPA의 Google Cloud 결제 연결과 Blaze 전환은 새 명시적 승인 후 진행한다. 결제 정보 입력·최종 동의는 사용자가 한다. 삼성의 API 플랜은 Google과 별개다.
3. **공개 서버를 배포한다.** `deployment-config.json`의 서울 `asia-northeast3`, 최소 0·최대 1 인스턴스, 1 vCPU·512 MiB·60초 제한을 적용한다. Secret Manager에 기존 키를 저장하고 실행 계정에 필요한 권한만 부여한다. Docker 빌드에는 비밀 파일을 포함하지 않는다.
4. **저장·로그 설정을 검증한다.** 기존 Firestore 규칙 전체를 보존하면서 서버 전용 collection의 브라우저 접근 금지와 만료 데이터 TTL을 적용한다. callback 인증 코드·토큰·웹훅 본문은 로그에 남기지 않는다. 로컬 emulator와 운영 설정 검증은 별개다.
5. **기존 주소 뒤에 연결한다.** 현재 Impact Series 릴리스와 파일 지도를 먼저 저장한다. `/api/smartthings/**`의 Cloud Run rewrite만 기존 SPA fallback 앞에 병합하고 다른 경로는 보존한다. `hosting-rewrite.example.json`으로 전체 Hosting 설정을 덮어쓰지 않는다.
6. **삼성 웹훅 확인을 완료한다.** `/config`의 `enabled:true`와 callback의 state 검증 응답을 확인한 뒤 공식 CLI `apps:register`를 실행한다. Target 재조회 결과가 `CONFIRMED`일 때만 웹훅 준비 완료로 표시한다.
7. **실제 사용자 연결을 확인한다.** 밥뭇나 로그인 → 본인 삼성 계정 동의 → 전력 측정 플러그 선택 → 실제 새 신호 수신 → 해제·재연결 순서로 검증한다. 자동 수신 시각과 수동 조회 시각을 구분한다. 장기 토큰 갱신과 2–3가구 격리는 별도 검증한다.

배포를 재개할 때는 “유료 전환을 승인하니, 준비한 설정으로 밥뭇나 SmartThings 실제 연결을 마무리해 줘”라고 요청하면 이 문서와 비공개 재개 메모에서 이어갈 수 있다. 지금 준비된 파일은 자동 실행되지 않는다.

## 비용과 검증의 경계

- 월 1만 원 예산 **알림**은 전환 시 적용할 제안이다. 현재 생성된 알림이 아니며, 청구 상한이나 자동 중단 기능도 아니다.
- 최소 0·최대 1 서버 설정은 사용량을 줄이는 실행 제한이며 월 0원을 보장하지 않는다. Google 비용과 삼성 API 플랜을 각각 확인한다. 자세한 구조는 [배포 계획](deployment-plan.md)에 있다.
- 이번 재확인에서 서버 단위 테스트 14개는 통과했다. Firestore 통합 테스트는 로컬 Java의 `libjli.dylib` 누락으로 시작하지 못했으므로, 배포 전에 Java 환경을 복구하고 다시 실행한다.
- [삼성 공식 공지](https://blog.smartthings.com/smartthings-updates/smartthings-api-additional-details-for-developers-and-business-partners/)의 11월 4일 앱 생성·수정 제한과 12월 15일 이후 미가입 API 제한 가능성은 별개로 적용된다. 기존 주소를 보존하는 준비가 삼성 플랜 조건을 면제하지는 않는다.
