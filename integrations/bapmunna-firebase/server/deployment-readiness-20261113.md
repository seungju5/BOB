# 2026-11-13 실제 배포 재개 점검

사용자가 모든 기능 검사와 삼성 API 서버 공개 배포를 요청했고, 준비된 배포안과 결제 필요 조건을 확인한 뒤 **“무료 유지 — 공개 서버 배포 보류”**를 선택했다. 이것이 최신 결정이다. 공개 배포·결제 연결·유료 서비스 활성화·운영 TTL·Hosting API rewrite를 실행하지 않는다. 별도 재개 요청 전 결제 승인을 반복 요청하지 않는다. 기능 검사는 계속하며 준비된 소스를 공개 가동 완료로 표시하지 않는다.

## 새로 확인한 운영 상태

2026-11-13 22:34 KST, 기존 Google 인증으로 읽기 전용 조회했다.

| 역할 | 실제 프로젝트 | 현재 상태 |
| --- | --- | --- |
| 공개 Hosting 사이트 `impact-series` | `impact-series` / `634921658163` | 결제 미연결, Spark |
| Cloud Run·빌드·컨테이너·비밀 보관 대상 | `impact-series` | 관련 API 4개 모두 DISABLED |
| 기존 Firebase 로그인·Firestore | `ku-gpa` / `344037918070` | 결제 미연결, 기존 데이터 유지 |
| 접근 가능한 Google 결제 계정 | 현재 CLI 계정에서 0개 | 소유자의 결제 계정 생성·연결 필요 |
| 삼성 앱 GET / OAuth 설정 GET | 11월 13일 다른 검증 채팅에서 각각 403 | 기존 CLI 인증 갱신 성공 후에도 거부. 원인을 요금제로 단정하지 않음 |
| 공개 config / callback | 404 | API 서버 미배포 |
| 보관된 기존 삼성 비밀 설정 | 원본 checkout, 0600, 앱 ID·키 형식 일치 | 값 출력·재발급·다른 checkout 복사 없음 |

`registration-status.json`의 Target `PENDING`은 **11월 3일의 과거 증거**다. 11월 13일 CONFIRMED 상태나 실제 기기 연결이 확인된 것은 아니다.

기존 문서는 데이터 프로젝트와 Hosting 프로젝트를 하나로 표현했다. `deployment-config.json`에서 `projectId`는 Firebase 계정·데이터 프로젝트를 계속 뜻하고, `hostingProjectId`·`runtimeProjectId`·`secretsProjectId`를 별도로 지정했다. 계정·DB를 옮기지 않는다.

## 검토 가능한 배포안

- 서비스: `bapmunna-smartthings`, 서울 `asia-northeast3`, Node 24, 최소 0·최대 1 인스턴스, 1 vCPU·512 MiB, 요청 제한 60초.
- 공개 주소: 이미 삼성에 등록한 `/api/smartthings/callback`·`/api/smartthings/events`를 유지한다. Hosting의 해당 경로만 Run에 연결하고 전체 기존 파일 지도·다른 앱 설정을 보존한다.
- 실행 주체: `bapmunna-smartthings@impact-series.iam.gserviceaccount.com`. 생성 전이다. `ku-gpa`의 Auth 사용자 검증·기존 Firestore 작업에 필요한 권한과 해당 두 비밀에 대한 권한만 별도 검토·부여한다. 광역 Owner/Editor 권한이나 서비스 계정 키 다운로드는 사용하지 않는다.
- 보관된 Client Secret·암호화 키는 승인 후 Secret Manager에 직접 주입한다. 브라우저·컨테이너 소스·로그에는 포함하지 않는다.
- 현 설계의 Firestore States/Locks/Receipts 만료 삭제는 TTL을 사용하므로 데이터 프로젝트 `ku-gpa`도 결제 연결이 필요하다. 이 때문에 `billing.requiredProjects`는 두 프로젝트를 명시한다. TTL을 무료 기능으로 설명하거나 자동 활성화하지 않는다.
- callback 쿼리의 인증 코드가 요청 로그에 저장되지 않도록 해당 서비스의 로그 필터를 먼저 검증한다. 운영 Firestore 규칙은 최신 전체 baseline을 보존·병합하고 다른 채팅의 가구 설정 규칙과 충돌을 확인한다.
- 월 1만 원 예산 알림은 제안일 뿐이며 생성되지 않았다. 예산 알림이나 최대 1 인스턴스는 청구 상한이 아니다. 삼성 API 이용 조건·플랜은 Google과 별개다.

[Firebase Cloud Run 연동](https://firebase.google.com/docs/hosting/cloud-run)은 무료 할당량이 있어도 결제 연결을 요구한다. [Firestore 가격 문서](https://firebase.google.com/docs/firestore/pricing)는 TTL 삭제를 결제 필요 기능으로 분류한다. [삼성 공지](https://blog.smartthings.com/smartthings-updates/smartthings-api-additional-details-for-developers-and-business-partners/)는 API Access App 관리·사용의 플랜 조건을 설명한다. 실제 소유 계정의 적합한 이용 플랜은 여전히 확인해야 한다.

## 이번에 수정·검사한 것

1. Hosting/서버/기존 데이터 프로젝트를 분리하고 잘못된 배포 대상·콜백 변경·쓰기 권한 확장·자동 결제 전환을 거부하는 검사를 추가했다.
2. Docker 빌드 입력을 런타임 파일 9개로 제한했다. 환경 파일·로컬 비밀·테스트·node_modules를 빌드 컨텍스트에서 제외한다.
3. 기존 비밀 파일을 복사하지 않고 `BAPMUNNA_SMARTTHINGS_PRIVATE_DIR`로 지정해 준비 상태만 확인할 수 있게 했다.
4. `npm audit fix --omit=dev --ignore-scripts`로 기존 버전 호환 범위의 `fast-xml-parser` 취약점 1건을 해결했다. 기존 Firebase Admin SDK 전이 의존성의 moderate 6건은 남는다. 강제 major override를 적용하지 않았으며 공급자 업데이트와 실제 영향 검토가 필요하다.
5. 서버 단위 14개 + 배포 경계 4개 = **18개 통과**. 별도 검증 채팅이 `demo-bapmunna`, localhost Firestore emulator에서 실제 트랜잭션 테스트 **1개 통과, skip 0**을 확인했다. 운영 데이터나 삼성 실기기를 사용하지 않았다.

소스만 준비하는 명령:

```sh
node integrations/bapmunna-firebase/scripts/prepare-smartthings-deploy.mjs
```

이 명령은 `tmp/smartthings-deployment/<hash>/source`와 SHA-256 manifest를 만든다. API 호출·결제·IAM·DB 변경·빌드 업로드·배포를 실행하지 않는다. 컨테이너 빌드 및 공개 실행 성공은 별도 증거가 필요하다.

## 아직 완료되지 않은 것

결제 계정 연결·과금 승인, 삼성 계정의 앱 관리 권한 확인, 공개 컨테이너 빌드·배포, 운영 IAM·TTL·로그 설정 검증, Hosting rewrite 반영, 삼성 Target 확인, 실제 사용자 OAuth·플러그 선택·새 webhook 수신·해제/재연결·장기 갱신.

이 서버의 구현 범위는 **기기 연결과 최근 신호 도착 확인**이다. 전력 구간 판정·실제 가족 공유·푸시 발송까지 자동 완성된 서버라고 설명하지 않는다. 사용자가 요청한 전체 기능 검증은 별도 최종 PRD/UX 감사 결과와 함께 판단한다.

로컬 증거: workspace `output/bapmunna-smartthings-deploy-20261113/cloud-preflight.json`, `owner-prerequisites.json`; emulator 증거 `output/bapmunna-final-audit-20261113/store-emulator.tap`. 비밀값은 없다.
