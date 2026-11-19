# 🍚 SmartThings 연동 × 산책 하트(B안) 최종 통합 시연 가이드
> **SmartThings Cloud Integration & Walking Hearts (Plan B) Demo Guide**  
> 문서 일자: 2026-11-18 | 대상 브랜치: `codex/walking-hearts-20261117` | 라이브 URL: [impact-series.web.app/bapmunna/app/](https://impact-series.web.app/bapmunna/app/)

---

## 1. 개요 및 B안 선정 배경 (Overview & Design Rationale)

본 문서는 **Bapmunna(밥뭇나)** 프로젝트의 **삼성 SmartThings 클라우드 밥솥 플러그 연동**과 **산책 하트(B안) 파노라마 경험**을 결합한 통합 시연 가이드입니다.

### 1.1 A안(경쟁형 랭킹) vs B안(따뜻한 동행) 비교
초기 기획안(A안)은 걸음 수 중심의 순위 경쟁(Leaderboard) 모델이었으나, 사용자 인터뷰와 수업 논의를 거쳐 어르신 친화적인 **B안(산책 하트 & 공원 파노라마)**으로 전격 전환했습니다.

| 비교 항목 | A안 (걸음 수 랭킹형) | B안 (산책 하트 & 안부형 · 최종 채택) |
| :--- | :--- | :--- |
| **핵심 감성** | 수치 경쟁, 걸음 수 압박 | 따뜻한 동행, 심리적 안심 ("내 속도로 걸어요") |
| **진행 시각화** | 단순 막대그래프 및 등수 순위표 | **2장면 공원 파노라마** 위를 걷는 귀여운 토끼 애니메이션 |
| **식사/활동 결합**| 산책 기록만 단독 집계 | **취사 소식(🍚)**을 마중물로 삼는 **5단계 하트 게이지** |
| **달성 보상** | 상위권 배지 (경쟁 유도) | 모은 하트로 토끼 꾸미기(밀짚모자, 왕관) 및 가족 응원 편지 |

> [!NOTE]
> **비침해적·비처방적 UX 원칙 (Non-Intrusive Design)**:
> 취사 소식은 밥솥의 전력 패턴일 뿐 '식사 완료'나 '섭취 칼로리'로 단정하지 않습니다. 또한 걸음 목표(기본 5,000보)는 어르신 스스로 정하며, 무리하지 않고 쉬어갈 수 있도록 안심 카피를 제공합니다.

---

## 2. SmartThings 클라우드 연동 아키텍처 (Architecture)

삼성 SmartThings Cloud와 Bapmunna의 실시간 데이터 연동은 비인가 노출을 차단하는 보안 브릿지와 Firestore 실시간 동기화로 완성되었습니다.

```mermaid
sequenceDiagram
    autonumber
    actor Senior as 어르신 (가정)
    participant Plug as 우리 집 밥솥 플러그
    participant ST as Samsung SmartThings Cloud
    participant Bridge as CLI / REST API Bridge
    participant FS as Cloud Firestore (ku-gpa)
    participant WebApp as Bapmunna WebApp (보호자/어르신)

    Senior->>Plug: 밥솥 취사 시작 (전력 800W+ 감지)
    Plug->>ST: powerMeter / switch 이벤트 전송
    ST->>Bridge: 실시간 기기 상태 전달 (Capabilities: powerMeter, switch)
    Bridge->>FS: households/cookingEvents 문서 업데이트 (KST 시각 동기화)
    FS-->>WebApp: onSnapshot 실시간 수신 (/connect, /home, /s, /walking)
    WebApp-->>Senior: 취사 안부 배지(🍚) 점등 및 첫 번째 산책 하트 자동 활성화
```

### 2.1 실제 연동 기기 명세 (Verified Linked Device)
* **기기명**: `우리 집 밥솥 플러그` (SmartPlug · 전력/에너지 측정)
* **Device UUID**: `54fac45c-5a59-449e-8db1-2613c1bf5ec6`
* **장소 및 공간**: `My home` (`bad8febc-f349-4969-896a-f14d20dddd62`) · `Living room` (`c16241b3-45ac-4c21-93cd-773def27bc7f`)
* **지원 기능 (Capabilities)**: `switch`, `powerMeter`, `energyMeter`, `refresh`
* **현재 상태**: `켜짐 (ON) · 밥솥 취사 전력 신호 수신 완료` (실시간 정상)

---

## 3. 핵심 화면별 발표 시연 동선 (Step-by-Step Demo Flow)

발표 시나리오는 **기기 연동 확인 → 보호자 모니터링 → 어르신 화면 → 산책 하트 달성 → 토끼 옷장**의 5단계 흐름으로 자연스럽게 진행합니다.

```mermaid
flowchart LR
    A["① /connect<br/>기기 연동 허브"] --> B["② /home<br/>보호자 대시보드"]
    B --> C["③ /s<br/>어르신 직관 홈"]
    C --> D["④ /walking/today<br/>파노라마 산책 (B안)"]
    D --> E["⑤ /walking/closet<br/>토끼 꾸미기 & 편지"]
```

### ① `/connect` — 삼성 SmartThings 기기 연동 허브
* **핵심 컴포넌트**: `SmartThingsAccountCard`
* **시연 포인트**:
  - 삼성 SmartThings Cloud 정식 계정 연동 상태 및 거실 밥솥 플러그 UUID 실시간 확인.
  - 전원(ON) 상태와 마지막 전력 측정 시각 표시.
  - `지금 SmartThings 취사 신호 동기화` 원클릭 버튼을 통한 즉각적인 기기 상태 갱신.

### ② `/home` — 보호자 실시간 안부 대시보드
* **핵심 컴포넌트**: `ImpactConnectionLinks (compact)`, 상단 안부 배너
* **시연 포인트**:
  - 홈 상단에서 "SmartThings 연결됨 · Living room · 우리 집 밥솥 플러그" 요약 배너 표출.
  - 당일 식사 시간대별(아침·점심·저녁) 밥솥 취사 여부와 7일 끼니 확인율(%) 종합 브리핑.

### ③ `/s` — 어르신 전용 직관 인터페이스
* **핵심 컴포넌트**: `CookerBadge`, 3대 안부 버튼 (`BigButton`)
* **시연 포인트**:
  - 시인성이 높은 대형 폰트와 따뜻한 손글씨체 응원 문구.
  - **밥솥 안부 배지(`CookerBadge`)**: 당일 취사 감지 시 `🍚 오늘 밥솥 취사 소식이 전해졌어요 (산책길 첫 번째 하트가 채워졌어요)` 점등.
  - 하단 `오늘의 산책·하트 보기` 버튼을 통해 복잡한 조작 없이 산책 화면으로 바로 전환.

### ④ `/walking/today` — 파노라마 공원과 산책 하트 (B안 핵심)
* **핵심 컴포넌트**: `HeartsGarden`, `BunnyScene`, `ParkTrailWonders`
* **시연 포인트**:
  - **2장면 파노라마 공원**: 벤치와 가로수길 → 튤립 화단, 이정표, 빨간 우체통, 다람쥐가 끊김 없이 흐르는 횡스크롤 배경.
  - **살아 숨쉬는 토끼 애니메이션**: 앞뒤 다리 교차 보행, 사뿐사뿐 상체 바운스, 뽀얀 발먼지와 하트 이펙트, 클릭 시 깡총 점프(`is-hopping`).
  - **5단계 안부 게이지**: `🍚 취사 소식` + `25%` + `50%` + `100%` + `200%` 단계별 하트 점등.
  - **안심 카피**: *"하트는 저절로 채워져요. 내 속도로 걸어요."* / 목표 달성 시 *"편하게 쉬어도 좋아요."*

### ⑤ `/walking/closet` (및 가족 응원 탭) — 토끼 차림 꾸미기
* **핵심 컴포넌트**: `HeartsCloset`, `FamilyComposer`
* **시연 포인트**:
  - **하트 지갑**: 50%(누적 1개), 100%(누적 3개), 200%(누적 5개)로 획득한 하트로 아이템 교환.
  - **차림 카탈로그**: 밀짚모자(`straw-hat`), 등산모자, 조끼, 한복, 왕관(`crown`), 가을 단풍 배경 등 착용 즉시 토끼 반영.
  - **가족 응원함**: 보호자가 남긴 따뜻한 한마디와 사진이 특정 산책 단계(25%, 50%) 달성 시 선물상자로 열리는 감동 경험.

---

## 4. 배포 현황 및 무결성 검증 (Deployment & Verification)

| 검증 항목 | 내용 및 결과 |
| :--- | :--- |
| **라이브 웹앱 URL** | [https://impact-series.web.app/bapmunna/app/](https://impact-series.web.app/bapmunna/app/) |
| **배포 릴리스 버전** | `sites/impact-series/releases/1794988676683000` (Version: `c6ac5c6b3663fc35`) |
| **Git 소스 브랜치** | `codex/walking-hearts-20261117` (Commit: `887ebf6...`) |
| **테스트 스위트 통과**| **427개 전체 통과** (Root 314, Hearts 39, Steps 7, Shell 13, Server 46, Firebase 85 / **Failed 0**) |
| **보안 및 규정 준수**| OWASP Top 10 기준 개인정보 마스킹, 비처방 안내, Vercel/Firebase Spark 환경 통과 |

> [!TIP]
> **시연 팁 (Demo Tip)**:
> 발표 시 브라우저 개발자 도구의 모바일 뷰(iPhone 14/15 Pro 규격, 393×852px)로 시연하면 B안 파노라마 뷰와 토끼 보행 모션, 하트 인터랙션이 가장 자연스럽게 전달됩니다.
