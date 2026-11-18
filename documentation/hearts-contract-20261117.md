# 산책 하트 통합 계약 — 2026-11-17

사용자 자료: 9쪽 하트 기능 설계안(PDF와 `.md`라는 이름의 PDF는 같은 내용), 카톡의 B안 우선 결정, 공원 산책 토끼 화면. B를 기본, 기존 랭킹/A는 선택 보조 화면으로 둔다. 기존 로그인·온보딩·세 어르신 행동·내부 분석 함수·산책 연결은 보존한다.

## 판단과 보관

- 취사는 식사량·칼로리의 증거가 아니다. 실제 칼로리 환산은 하지 않는다. 개인이 설정한 하루 걸음 목표(default 5000, 500..20000, 100단위)를 사용한다. 처음 도착한 당일 기록에서 목표를 고정하고 목표 변경은 다음 날 적용한다. 실제 건강 조언 또는 처방으로 표시하지 않는다.
- 진척률 = 오늘의 확인된 걸음 합계 / 당일 고정 목표 × 100. 표시율은 300% 이상도 유지하되 주간 점수는 하루 300점까지다. 기록 미도착은 null, 0걸음과 구분한다.
- 다섯 단계는 취사 소식(또는 명시적 외식 확인), 25%, 50%, 100%, 200%. 걸음 단계는 취사가 없어도 인정한다. 취사 신호를 식사 완료라고 부르지 않는다.
- 꾸미기 하트: 50% 누적1개, 100% 누적3개, 200% 누적5개. 같은 날 반복·역순 수신으로 중복 지급하지 않는다. 자정(KST)에 하루 진행만 새로 시작하고 지갑/구매 목록은 유지한다. 수정된 걸음수가 내려가면 현재 진행은 낮추되 이미 지급한 하트를 부채로 만들지 않는다.
- 7일/30일 특별 아이템은 확인된 '밥솥·외식 소식 이어진 날'로만 계산한다. 신호 미수신/부재를 결식으로 해석하지 않는다.
- 기본은 혼자 보기. 예시는 별도 localStorage 키와 고정 가상 인물만 사용하며 서버로 보내지 않는다. 실제 기록은 권한 확인된 네이티브 걸음/서버의 내부 확인된 취사 요약만 쓴다. 웹의 slider/self-report로 실제 점수를 올리지 않는다.
- 하트 기록 보관·가족 응원 공유·주간 리그는 별도 명시 동의. 서버는 일별 요약 최대35일, 메시지 최대30일, 지갑·구매한 아이템은 동의 유지 동안 보관. 끄기는 새 수집 중단, 삭제는 하트 기록/메시지/아이템 삭제. 기존 건강 앱 원본은 유지.

## 공동 타입 / 순수 패키지

`packages/walking-hearts/core.mjs`와 `core.d.mts`가 계산/카탈로그 원본이다.

- `HEART_POLICY`, `HEART_ITEMS`, `heartDate(now)`, `heartWeek(date)`, `heartProgress({count,goal,cooking})`
- `createHeartState({date,goal?})`, `advanceHearts(state,{date,count,cooking?,now?})`, `setHeartGoal(state,goal)`, `buyHeartItem(state,itemId)`, `equipHeartItem(state,itemId)`, `heartSummary(state,date)`, `heartLeague(rows,date)`
- 전체 상태 JSON 직렬화 가능. 거래 실패는 throw. 날짜 역행 입력은 보상/날짜를 바꾸지 않는다. 구매/장착은 idempotent.
- Catalog: 8 items `scarf`(accessory3), `basket`(accessory3), `straw-hat`(hat6), `hiking-cap`(hat6), `vest`(outfit9), `hanbok`(outfit15 or7dayunlock), `crown`(hat15 or30dayunlock), `autumn`(background3). 기본 공원/기본 의상은 무료. 카테고리당 한 아이템만 장착, UI는 카테고리별3~4개 이하.
- 타입은 agent가 구체화 후 총괄에게 즉시 전달. 핵심 기능은 네트워크/DB/React 없는 순수 함수와 회귀 테스트로 검증한다.

## 서버/네이티브 경계

기존 walking 인증과 확정된 휴대폰 토큰만 재사용한다. 신규 API는 walking 서비스 아래에 추가한다. SmartThings service/store/runtime/portal은 다른 채팅 소유로 수정하지 않는다. 별도 취사 입력은 HTTP에 공개하지 않고 내부 `recordCooking` 계약과 검사만 준비한다.

- `GET hearts` → `{enabled,joined,state,summary,messages,leagueEnabled,region}`; 미동의면 `{enabled:false,joined:false}`.
- `POST heartjoin {consentVersion:'2026-11-17-hearts',enabled:true,goal,leagueEnabled:false,region:''}`
- `POST heartsettings {goal,leagueEnabled,region,enabled}` (각 필드 optional, 허용 필드만)
- `POST heartbuy {itemId}`, `POST heartequip {itemId}`, `POST heartgift {itemId}`
- `POST heartmessage {text,photo?,unlockPercent?,requestId?}` (1..280자, 사진 JPEG/PNG 최대160000 bytes, 선택 잠금 단계0/25/50/100/200, UUID 멱등키, 가족 계정→연결된 휴대폰, 최대20개/30일)
- `POST heartread {id}` (내 계정 메시지만)
- `POST heartleave {}` (모든 하트 부가기능 데이터 삭제, 기존 랭킹/연결은 유지)
- `GET heartleague` → 별도 동의한 참여자만의 주간 하트 순위. 지역은 선택 시·구 문자열이며 GPS 수집 없음. 실제 미참여자/예시 끼워넣지 않는다.
- Native bridge: `heartsRequest({action,body?})`, 위 allowlist만, 기존 secure token, 고정 origin, 토큰 JS 반환 금지. 웹 auth는 기존 Firebase bridge. native는 get/join/settings/buy/equip/read/leave/league만, guardian용 message/gift 제외.
- 가족 메시지/선물은 인증된 보호자 웹에서만 생성. 실제 push 채널이 없으면 앱 안 도착 알림으로 정직하게 표시. 취사 후30~60분 push는 외부 실제 수신+설치 앱 검증이 남으므로 기존 선택 시각 알림을 보존한다. 취사 기반 자동 예약은 아직 미연결이다.

## 파일 소유권

- 총괄: components/walking/Hearts*, app/walking/**, lib/walking/client.ts, lib/hearts/**, 관련 메뉴/동선/CSS/문서/자산/배포 스테이징.
- Domain agent: packages/walking-hearts/** 만.
- Backend agent: integrations/bapmunna-firebase/server/walking-*.mjs, 신규 heart-*.mjs, 해당 test/heart*.mjs 와 walking 관련 테스트만. SmartThings 소스 및 template/stage 미수정.
- Native agent: packages/phone-steps/**, components/walking/NativeWalkingPanel.tsx 만. 총괄 UI import 연결은 총괄과 조율.
- 독립 검토는 구현 후 read-only 별도 역할.

## 최종 연결·실패 계약

- 가족 전용 걸음 연결: `2026-11-17-private` + `shareTodaySteps:true, shareRanking:false`. 기존 공개 연결은 `2026-11-17`을 유지한다. 공개 걸음 순위와 주간 하트 리그 동의는 각각 선택이다.
- 편지 최초 잠금 해제 시 `unlockedAt`을 영속 저장한다. 다음 날·걸음 정정으로 다시 잠기지 않는다. 잠긴 native 응답은 본문/사진을 null로 제거한다.
- 편지 UUID는 같은 소유자/내용 재시도를 한 건으로 처리한다. 다른 내용이면409. 선물은 공동 하트 지갑에서 차감하고 중복 구매하지 않는다.
- `heartleague` 실제 응답은 `{enabled,week,weekEnd,region,group,total,practice,entries:[{publicId,nickname,score,rank,tier,isMe}],me,updatedAt}`. UI에서 `weekStart/points/myPublicId`로 정규화한다.
- 동시 구매/주간 정산은 Firestore 트랜잭션이다. 지역별 최대15명 그룹, 10명 미만 연습리그, 양수 점수 상위3명만 다음주 승급, 강등 없음. 동점도 승급 인원은3명이며 고정 공개ID 순서로 결정한다.
- 연결 해제/계정 전환은 native UI를 새 세션으로 마운트하고 기존 편지·사진·진행 상태를 즉시 지운다. 인증 종료 후 늦은 응답은 epoch로 거절한다. transient network error는 임의의 예시 데이터로 바꾸지 않는다.
- 네이티브에는 `/health`만 포장한다. 없는 로컬 walking 경로로 이동하지 않고 고정 시스템 브라우저 안내 또는 같은 화면 앵커를 사용한다.
