# 식후 산책 안내와 전체 참여자 걸음수 랭킹

2026-11-17 사용자 요청과 선택: 식후 산책·혈당 확인 안내, 걸음수 자동 순위, 메뉴 진입. 비교 대상은 **참여에 동의한 전체 사용자**다. 최신 공개 카카오·Business OAuth 소스 35c5f76에서 별도 브랜치로 구현한다.

## 사용자 경험과 데이터

- 메뉴의 `산책·걸음수 랭킹` → 오늘 상위 순위·내 순위·참여/그만하기·휴대폰 연결·산책 알림.
- 기준은 한국 날짜(Asia/Seoul)의 하루 합계. 동점은 공동 순위(1, 1, 3). 기록 없음과 실제 0걸음을 구분한다. 실제 목록에 가짜 참여자나 데모 기록을 넣지 않는다.
- 가입한 본인 계정으로 랭킹 참가를 선택하고 별명을 정한다. 전체 참여자에게 공개되는 내용은 별명·오늘 걸음수·순위다. 실명/이메일/계정ID/혈당/위치/원시 건강 기록은 공개하지 않는다.
- 기존 건강 읽기는 휴대폰 안에서만 동작한다. 랭킹은 **별도 선택 동의** 후 오늘 합계만 서버에 보낸다. 웹에서 만든 8자리 연결 숫자를 건강 앱에 직접 입력하고, 휴대폰 소유자가 별도 공유 동의를 확인한다. 숫자는 10분·일회용. 기기 토큰은 30일, 서버에는 해시만, 휴대폰에는 네이티브 보안 저장소만 사용한다.
- 자동 갱신은 앱이 열려 있는 동안·다시 열 때·수동 새로고침 때 수행한다. 새 건강 백그라운드 읽기 권한은 요청하지 않는다. 건강 읽기 실패/권한 해제는 0으로 전송하지 않는다.
- 서버는 당일 합계 하나만 유지한다. 전날 숫자는 오늘 랭킹에서 즉시 제외하고 기존 하루 정리 작업 또는 다음 갱신에 제거한다. 참가 해제 시 별명·합계·기기 연결·미사용 연결 숫자를 제거한다. 기기에 남은 알림은 기기에서 별도 끈다.
- 알림은 설치형 앱에서 본인이 선택한 식사 후 시각에 매일 표시한다. 동의 전 OS 알림 요청/예약은 하지 않는다. `식사를 마치셨다면, 몸이 편할 때 가볍게 걸어볼까요?`라는 조건형 안내를 쓴다. 식사 감지 성공으로 표현하지 않는다.
- 혈당 안내는 선택 사항: `혈당을 재는 분은 안내받은 측정 시각도 확인해 주세요.` 걸음수로 혈당을 계산하거나 모두에게 측정을 처방하지 않는다. 몸이 불편하면 쉬고, 인슐린 등 치료 중이면 개인 진료 계획을 따르도록 짧게 안내한다.

근거: [CDC 혈당 관리](https://www.cdc.gov/diabetes/treatment/), [ADA 운동과 혈당](https://diabetes.org/health-wellness/fitness/blood-glucose-and-exercise). 이 기능은 건강 진단이나 혈당 측정 기능이 아니다.

## 구현 계약

기존 Vercel 고정 원점의 `/api/walking/` 엔드포인트를 `[action].mjs` 함수 하나로 묶는다. 플랫폼이 넣은 action 값은 경로와 정확히 일치하는 단일 값일 때만 제거하고, 다른 쿼리·중복 값은 거절한다. 카카오 고정 함수 4개와 SmartThings 1개를 보존하여 Hobby의 함수 12개 제한 안에서 총 6개를 사용한다. 기존 Firebase 서비스 계정과 서버 비공개 `bapmunnaSystem/walking` 하위 컬렉션만 사용한다. 기존 브라우저 Rules/IAM/결제 변경은 없다. 실계정은 검증된 Firebase ID token·기존 account profile 동의를 검사한다. Native Origin은 `https://localhost`, `capacitor://localhost`만 명시 허용하며 앱 데이터 접근권한은 별도의 기기 토큰으로 검사한다.

웹: `Authorization: Bearer <Firebase ID token>`; native: `Authorization: Bearer <walking device token>` (기기 전용 엔드포인트만 허용). 모든 응답 no-store. 오류는 `{error:code}`.

| 엔드포인트 | 계약 |
| --- | --- |
| GET config | `{enabled:true,consentVersion:'2026-11-17',timeZone:'Asia/Seoul'}` |
| GET profile | Firebase 인증, `{joined,nickname?,publicId?,deviceConnected?,deviceExpiresAt?,lastSyncedAt?,date?,count?}` |
| POST join | Firebase 인증, `{nickname,consentVersion:'2026-11-17',shareTodaySteps:true}` → profile |
| POST leave | Firebase 인증, `{}` → `{ok:true}`; 참가/기기/연결 숫자 철회 |
| POST pairing | Firebase 인증·참가 확인, `{}` → `{code,expiresAt}`. 이전 미사용 숫자는 폐기하고 기존 기기는 새 기기 confirm 때 교체 |
| POST pair | Native Origin, `{code}` → `{token,expiresAt,nickname,publicId,confirmed:false}`. 10분 확인 대기, 업로드·순위조회 불가 |
| POST confirm | 대기 기기 인증, `{consentVersion:'2026-11-17',shareTodaySteps:true}` → `{ok:true,confirmed:true,nickname,publicId,expiresAt}`. 목적지 별명을 확인하고 동의한 뒤 30일 연결 활성화 |
| POST unpair | 기기 인증, `{}` → `{ok:true}`. 만료·계정 철회 뒤에도 자신의 불투명 기기 토큰만 폐기 가능 |
| POST sync | Native 기기 인증, `{date,count,source,queriedAt,timeZone:'Asia/Seoul'}` → `{ok:true,date,count,syncedAt}`. 정수·날짜·출처·최신성 검증, 옛 응답은 최신 합계를 덮어쓰지 않음 |
| GET board | Firebase 인증·참가 확인 또는 Native 기기 인증. `{date,timeZone,updatedAt,entries:[{publicId,nickname,count,rank}],me:{publicId,nickname,count:null\|number,rank:null\|number,lastSyncedAt:null\|string},total,limit}`. 상위50명과 내 정확한 순위, 조회량 제한 |

네이티브 PhoneSteps에 추가할 메서드(기존 건강 읽기 API는 보존):

- `readRankingToday(): Promise<PhoneStepsSnapshot>`: KST 오늘 합계, 권한 요청 없음.
- `rankingLink({code})`: 고정 Vercel pair 호출·대기 토큰 보안 저장. 별명·기한·미확인 상태만 반환하며 토큰을 JS에 반환하지 않는다.
- `rankingConfirm({consentVersion,shareTodaySteps})`: 표시된 별명과 공개 범위에 동의한 뒤에만 연결을 활성화한다.
- `rankingStatus(): Promise<{linked,nickname?,expiresAt?}>`: 네트워크 없이 보관 상태만 반환.
- `rankingSync(): Promise<{ok,date?,count?,syncedAt?,reason?}>`: KST 건강 읽기→고정 Vercel sync; 토큰/원시 건강 기록을 반환하지 않는다. 권한/데이터 없으면 업로드 안 함.
- `rankingBoard(): Promise<Board>`: native token으로 고정 board 호출.
- `rankingDisconnect()`: 먼저 영구적인 전송 중단 표시를 저장한 뒤 서버 토큰을 철회한다. 오프라인이면 해제 대기를 유지하고 재시작 뒤에도 전송하지 않으며 다음 연결 때 철회를 재시도한다. 웹 참가 해제는 별도다.
- `walkReminderStatus(): Promise<{enabled,times:string[],bloodSugarReminder:boolean,permission:string}>`
- `configureWalkReminders({enabled,times,bloodSugarReminder}): Promise<same>`: 시각 HH:mm 최대4개, 사용자 실행 시만 권한 요청, 하루 반복 OS 알림; 끄기는 권한 요청 없이 취소.

## 담당 파일과 검증

- 서버 담당: `integrations/bapmunna-firebase/server/walking-*.mjs`, 해당 테스트, `workspaces/smartthings-vercel/template/api/walking/*`, template/runtime/walking-handler, stage.mjs/vercel.json, 기존 cleanup의 작은 통합.
- 네이티브 담당: `packages/phone-steps/**`, `workspaces/bapmunna-mobile/**`, `components/walking/NativeWalkingPanel.tsx`. 토큰은 DOM/로그/브라우저 저장소에 남기지 않는다.
- 총괄: 웹 메뉴·랭킹 화면·Firebase 사용자 요청 브리지·문구/개인정보 안내·데모·문서·배포와 종합 검증.
- 독립 검토: 동의 철회, 타 계정 접근 차단, 기기 연결 교체/만료, 날짜·공동 순위·역순 업로드, 동의 전 건강 업로드·알림 권한 요청 없음, 데모 격리.

모든 실제 기기 수치·알림 도착은 실기기 검증과 구분해 기록한다. 기존 삼성/카카오·다른 공개 경로를 보존한다. 구현 완료 후 실제 결과를 아래에 추가한다.
