# 밥뭇나 · 건강 앱 걸음수 연결 기록

## 사용자 결정과 구현 범위

2026-11-14 사용자 결정: 두 운영체제를 지원하며 **아이폰은 Apple 건강, 갤럭시는 삼성 헬스**의 걸음수를 읽는다. 새로운 UI를 별도로 만드는 대신 기존 Next 앱의 어르신 화면을 설치형 앱 안에 담는다. 이 기록은 소스 구현·로컬 검증 기록이며 실제 건강 데이터 연동이나 공개 배포 완료를 뜻하지 않는다.

| 구분 | 채택한 도구·API | 실제 역할 |
|---|---|---|
| 기존 화면 | Next 16.4.2 / React 19.3 / TypeScript / 기존 Tailwind·브랜드 자산 | 어르신 `/s`의 세 소식 버튼과 아래 ‘오늘의 걸음’ 카드 |
| 설치형 앱 | Capacitor core·CLI·Android·iOS 8.6.2 | 기존 정적 웹 번들을 앱에 포함. 원격 사이트에 건강 데이터 브리지를 노출하지 않음 |
| 갤럭시 | Kotlin / Health Connect 1.1.0 | `READ_STEPS`, `StepsRecord.COUNT_TOTAL`, 삼성 헬스 출처 `com.sec.android.app.shealth`만 조회 |
| 아이폰 | Swift / HealthKit | `stepCount` 읽기 전용, 로컬 자정·달력 하루 단위 `HKStatisticsCollectionQuery` |
| 검사 | Vitest / Node test / JDK / 기존 개발 하네스 / 로컬 Firestore / CUA 브라우저 | 계산·상태·동의 경계·웹 번들·기존 기능 회귀 검사. 네이티브 컴파일과는 구분 |

Android 앱 최소 버전은 Android 10(API 29), iPhone은 iOS 15로 준비했다. 실제 기기 호환성은 아직 검증하지 않았다. Android 14 이상에는 Health Connect가 포함되고 이전 지원 버전은 별도 제공 앱이 필요하다. 삼성 헬스의 Health Connect 공유 설정도 별도로 켜야 한다. 외부 유료 API나 서버 저장 기능을 추가하지 않았다.

## 기존 디자인과 기능 흐름

- 기준 문서: [MVP v1106](https://www.figma.com/design/9QYJ5uSCzA60d78SGFEtti?node-id=34-1289), [팀 라이브러리](https://www.figma.com/design/9Io11mLh2rLORVmeyQdg57?node-id=3326-747).
- 어르신 S-02 수정표 `44-6482`: 목적지가 없는 밥솥 상태 카드를 없애고 세 행동을 중심에 둔다. 기존 밥솥이와 큰 글씨를 유지하고, 작은 화면에서는 세 버튼을 세로로 배치한다.
- 시작 토끼/이후 밥솥이, 로그인→튜토리얼→가구 기본정보→홈→선택적 기기 연결 순서는 유지한다. 건강 앱 연결은 실제 어르신 홈에서 별도 동의 후 수행한다.
- 보호자 홈·제목의 작은 Figma 수정은 `c7ebf25`로 분리해 최종 통합 작업 채팅에 인계했다. 기기 수신 시각을 설정으로 이동하는 후속 변경은 그 채팅 담당이다.
- 현재 건강 카드의 실제 접근 경로는 루트 Next 앱의 유효한 어르신 페어링 세션이다. 연결 설정이 없는 정적 빌드에서는 예시 체험만 가능하며, 예시에서는 실제 건강 기록을 읽지 않는다. 최종 Firebase 실계정 통합과 네이티브 로그인 복귀는 별도 검증이 필요하다.

## 데이터·권한 규칙

1. 앱 열기·복귀·다시 확인은 읽기만 수행한다. 연결 버튼을 직접 누르고 앱 안내에 동의할 때만 OS 권한창을 요청한다.
2. 확인된 정수 `0`과 기록 없음·권한 거절·오류를 구별한다. 건강 기록이 없다는 이유로 `0걸음`이나 ‘삼성 연결 실패’를 단정하지 않는다. HealthKit은 읽기 거절 여부를 숨기므로 빈 응답은 ‘기록과 공유 권한을 확인해 주세요’로 안내한다.
3. 오늘은 휴대폰의 현지 날짜·시간대를 따른다. 식사 판단의 KST 규칙은 변경하지 않는다. 자정·시간대 변경·늦은 응답·연결 해제 후에는 이전 합계를 재사용하지 않는다. Apple의 Double 통계는 유한·0 이상·JS 안전 범위 확인 후 정수 걸음으로 표시한다.
4. `updatedAt`은 조회 완료 시각이다. 센서 측정 시각이나 삼성 동기화 완료 시각이라고 표시하지 않는다. 건강 앱 합계는 시계 등 여러 기기의 기록을 포함할 수 있다.
5. 걸음수는 서버·분석 도구·로그·브라우저 저장소·가족에게 전송하거나 저장하지 않는다. 네이티브 동의 플래그와 미완료 동의 해제 표시만 기기에 남는다.
6. 가족 연결 변경·401·체험 전환 시 네이티브 읽기 동의를 해제한다. 새 화면은 해제 완료를 기다리며, 해제 중 앱이 종료돼도 다음 실행에서 먼저 처리한다. OS의 기존 건강 기록과 다른 앱의 권한은 삭제하지 않는다.
7. 네이티브 플러그인은 패키지의 로컬 원점만 허용한다. CSP와 파일 allowlist로 외부 스크립트·iframe·서버 코드·환경 파일의 앱 번들 유입을 막는다.

## 파일과 재현 명령

| 파일 | 책임 |
|---|---|
| `components/senior/PhoneStepsCard.tsx` | 연결 안내·동의·합계·미지원·재시도·해제 |
| `components/senior/senior-home.css` | 기존 로더와 호환되는 접두사 CSS, 320px·큰 글씨 재배치 |
| `lib/steps/state.ts` | 네이티브 응답·날짜·출처 검증 |
| `lib/steps/session.ts` | 권한 요청과 복귀 조회의 경합·시간 제한·늦은 결과 차단 |
| `lib/steps/consent.ts`, `lib/data/senior.ts` | 가족 연결 변경 시 건강 읽기 동의 해제 |
| `packages/phone-steps/` | Android/iOS 네이티브 API와 웹 미지원 구현 |
| `workspaces/bapmunna-mobile/` | 기존 앱의 설치형 셸·권한·번들 준비·검증 |
| `tests/unit/phone-steps.test.ts` | 상태·권한·날짜·계정 변경 회귀 |

저장소 루트에서:

```sh
npm ci
npm --prefix workspaces/bapmunna-mobile ci
BAPMUNNA_STATIC_EXPORT=1 NEXT_PUBLIC_APP_BASE_PATH='' npm run build
npm --prefix workspaces/bapmunna-mobile run prepare:web -- tmp/impact-final/build
npm --prefix workspaces/bapmunna-mobile run sync
npm --prefix packages/phone-steps test
npm --prefix workspaces/bapmunna-mobile test
npm run harness:check -- --profile full
```

`cap sync` 성공은 플러그인 등록·파일 복사를 뜻한다. APK/IPA 생성이나 실기기 실행 성공이 아니다. 전체 하네스의 Firestore 검사는 본인이 시작한 `demo-bapmunna` 로컬 emulator와 명시적 opt-in이 필요하다. 빌드 생성물·건강 기록·환경 키를 Git에 넣지 않는다.

## 남은 실행 조건

- Android SDK/Android Studio와 Xcode 설치 환경에서 네이티브 전체 컴파일·서명 확인. 현재 컴퓨터에서는 도구가 없어 미실행이다.
- 갤럭시·아이폰 실기기에서 허용/거절/철회/무기록/0/백그라운드 보행 후 복귀/앱 재시작/자정·DST·시간대/계정 변경 검증 및 건강 앱 합계 대조.
- 실제 어르신 페어링과 설치형 앱의 로그인 복귀 URL, 삼성 헬스 공유·설정 이동 확인.
- 런처·스플래시의 기본 템플릿을 승인 브랜드 자산으로 정리하고, 건강 정보 이용 안내·스토어 신고 항목 검토 후 배포. 아직 설치 파일·스토어·공개 Hosting 배포는 하지 않았다.
- SmartThings는 별도 서버 작업이다. 이번 건강 앱 기능이나 CLI 기기 조회 성공을 실제 웹앱 OAuth·웹훅 성공으로 표현하지 않는다.

API의 공식 근거와 세부 버전은 [플러그인 문서](../packages/phone-steps/README.md), 셸 검증 범위는 [검증 기록](../workspaces/bapmunna-mobile/VERIFICATION.md)에 정리했다. 최종 전체 검사·브라우저 결과는 아래에 이어 기록한다.

## 최종 로컬 검증

- 전체 하네스: `.harness/runs/2026-11-14T14-02-23-685Z-72170/report.md`. 하네스25·루트142·개인정보48·Firebase59·SmartThings49 통과, 실패0·skip0. 직접 시작한 `demo-bapmunna` 로컬 Firestore 포함. 타입·소스 동기화·두 Firebase 빌드·Next Webpack 빌드 통과.
- 별도 플러그인3·셸4 검사, 변경된 JS/TS ESLint 통과. 정적 Turbopack 빌드와 allowlist121파일 준비, 양 OS `cap sync` 확인. 컴파일되지 않은 네이티브 소스를 테스트 통과로 계산하지 않았다.
- 브라우저: 최종 CSP 적용 번들에서 390px 버튼 약107×152px/24px 글씨, 320px 버튼272×76px/24px 글씨. 합성 체험의 외식·외출2일·도움 완료와 Escape 닫기·호출 버튼으로 초점 복귀를 확인했다. 관찰한 콘솔 경고/오류0.
- 큰 글씨는 운영 소스와 분리한 로컬 CSS `html{font-size:200%}` 사본을 사용했다. 320/390px에서 페이지·본문·버튼 가로 넘침0, 390px 확인 버튼48px 글씨 확인. 실제 휴대폰 OS 글자 설정·스크린리더·어르신 사용성 관찰까지 검증한 것은 아니다.
- 독립 검토로 권한창 복귀 조회 경합, 가족 변경 시 동의 재사용, 해제 실패/앱 재시작, iOS 자정 샘플, 비루트 basePath의 잘못된 번들 경로를 보완하고 재검토했다.
- 도중 Webpack 캐시 예외가 발생해 개발 서버 종료·새 캐시에서 재검사했다. 보관한 옛 생성 타입이 TypeScript 검색에 들어가는 문제도 있어 캐시를 프로젝트 밖으로 이동했다. 위 최종 보고서는 그 후의 통과 결과다.
- Figma 감사·독립 검토·브라우저 증거는 workspace `output/bapmunna-phone-steps-20261114/`에 보관했다. 공개 Hosting·삼성 설정·비밀키·스토어는 수정하지 않았다.
