# 밥뭇나 Firebase 통합판

기존 Firebase 디자인을 보존하면서 루트 Next.js/Supabase 앱의 판단 함수를 함께 사용하는 별도 프런트엔드입니다. 루트 앱을 대체하지 않으며, 이 폴더를 추가하는 것만으로 운영 사이트나 데이터베이스가 바뀌지 않습니다.

## 실행과 검증

저장소 루트에서 Node 24와 잠긴 의존성을 사용합니다.

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run sync:firebase
npm run dev:firebase
```

포트를 직접 지정하려면 다음을 사용합니다.

```sh
npm --prefix integrations/bapmunna-firebase run dev -- --port=5293
```

개발 서버가 출력한 주소의 `/`, `/senior/`, `/carer/`에서 시작·어르신·보호자 화면을 확인합니다. 역할 전환은 화면만 바꾸며 인증 권한을 부여하지 않습니다.

```sh
npm test
npm run test:firebase
npx tsc --noEmit
npm run build:firebase
```

`workshop/bapmunna.html`은 오프라인 체험용 단일 파일입니다. SDK 소스를 다시 빌드할 경우에만 이 폴더에서 별도로 `npm ci`와 `npm run build:cloud`를 실행합니다. 일반 화면·도메인 검증에는 중첩 의존성 설치나 Firebase 로그인이 필요하지 않습니다.

단일 파일은 외부 자산 없이 묶여 있으며 localhost에서 역할 전환·1분 체험을 검증했습니다. 현재 검증 브라우저는 `file:` URL을 허용하지 않아, 파일을 더블클릭하는 실행 방식 자체는 해당 브라우저에서 확인하지 못했습니다.

## 이번 체험에서 볼 수 있는 것

- 시작 화면의 **1분 안부 체험**: 신호 전 → 뚜껑 열림 → 보호자 요약 → 다섯 가지 하루. 기존 체험 기록과 분리된 메모리를 사용하므로 몇 번 반복해도 현재 가족·계정 데이터는 바뀌지 않습니다.
- **안부 한 그릇**: 밥그릇·최근 소식·연락 동선을 한 영역에 모았습니다. 도움 요청은 그보다 먼저 표시하며, 읽음 처리를 실제 연락 완료로 표시하지 않습니다.
- **설명 가능한 기록**: 오늘의 끼니나 기록 그래프의 날짜를 누르면 해당 기록의 근거를 볼 수 있습니다. 기기 신호와 직접 남긴 외식 소식은 구분합니다. 그래프는 좌우 방향키·Home·End로도 이동합니다.
- **어르신의 세 가지 행동**: 외식·외출·도움 요청 후 남긴 소식을 화면에 유지합니다. 설정은 단계별 초안으로 작성하고 마지막에만 반영합니다.
- **편한 외출 입력**: Supabase의 오늘만·2일·3일·일주일 선택지를 제공합니다. 오늘을 포함한 달력 날짜이며 현재 가상 시각부터 해당 마지막 날 자정까지 적용합니다. 과거 끼니를 소급 변경하지 않고, 직접 날짜·시간 선택도 펼쳐서 사용할 수 있습니다. 귀가하면 안내도 즉시 갱신합니다.
- **동일한 판단 규칙**: 위 화면들은 공통 엔진의 결과를 설명하는 표시 계층입니다. 별도 임계값이나 새로운 식사·건강 판정을 추가하지 않았습니다.

2026-10-17에 확인한 Supabase 기준은 `4b4970f6481c80bfecaa2794aee04373fef2eb13`입니다. 이 커밋의 가구 정보 뒤 환영 화면을 Firebase의 토끼·노란 디자인으로 반영했습니다. 실서버 온보딩·페어링 기능이 통합됐다는 뜻은 아닙니다.

## 소개 영상과 발표 순서

58.25초, 7장면, Full HD/24fps, 한국어 합성 음성·화면 자막을 사용하는 소개 영상을 제작했습니다. 구조는 **질문 → 밥솥 신호 → 어르신 행동 → 보호자 확인 → 예외 상황 → 다정한 연결**입니다. 토끼의 두 번 점프와 실제 로컬 앱 캡처를 사용하며, 센서·전화가 연결된 실서비스처럼 연출하지 않습니다.

- 시나리오: `documentation/introduction-storyboard.json`
- 영상 생성기: `scripts/render-introduction.mjs`
- 1페이지 장면별 대본 PDF 생성기: `scripts/render-storyboard.py`
- 최종 MP4·SRT·PDF는 로컬 산출물로 별도 전달합니다. 대용량 렌더 중간 파일은 Git에 넣지 않습니다.

재제작에는 기존 설치된 `ffmpeg`, `ffprobe`, macOS `say`의 Yuna 음성, `@napi-rs/canvas`가 필요합니다. 앱의 실행 의존성에는 추가하지 않았습니다. 출력 폴더의 `source/`에 manifest가 지정한 `senior.jpg`, `guardian.jpg`, `signal-before.jpg`, `signal.jpg`, `offline.jpg`를 **가상 데이터 상태에서 390×844px로 직접 캡처**해 둡니다. 개인 계정 화면을 캡처하거나 외부에 업로드하지 않습니다.

```sh
# 저장소 루트. 경로는 각 작업 환경에 맞게 바꿉니다.
BAPMUNNA_CANVAS_MODULE=/absolute/path/to/@napi-rs/canvas \
  node integrations/bapmunna-firebase/scripts/render-introduction.mjs /absolute/output/directory
```

`BAPMUNNA_VIDEO_FRAMES_ONLY=1`을 함께 설정하면 음성·영상 인코딩 전에 7개 장면의 글자 넘침과 구도를 점검할 수 있습니다. 생성된 MP4는 전체 디코딩, 프레임·음성 길이, 자막 순서를 검사하고 각 장면을 시각 검수합니다. PDF는 ReportLab과 한국어 TTF 폰트로 생성한 뒤 페이지 이미지로 다시 확인합니다.

발표 권장 순서는 영상 재생 → 1분 체험의 신호 전후 → 어르신 외식 버튼 → 보호자 기록 근거 → 연결 중단·도움 요청입니다. 마지막에는 **실제 센서 실측, 가족 간 실시간 전송, 현장 사용성 검증이 남아 있음**을 명시합니다.

## 계속 일치시킬 범위

원본은 루트 `config/detection.ts`, `lib/judge/`, `lib/data/view.ts`입니다. `scripts/sync-firebase.mjs`가 검토된 파일만 `docs/shared/`에 컴파일합니다. 생성 파일은 직접 편집하지 않습니다.

| 기능 | 통합 방식 |
| --- | --- |
| 취사·열림 판정 | 같은 `detectEvents` 함수와 상수 |
| 끼니 상태 | 같은 `resolveMealSlots`; 기기 확인 > 외식 > 부재 > 미확인/대기 |
| 외식 버튼 | 누른 시각에 가장 가까운 식사 시간대 자동 선택 |
| 주의·재확인 | 같은 `evaluateAlerts`; 마지막 활동 기준 기본 48·72시간 |
| 연결 장애 | 공통 2시간 기준, 오프라인 기간 제외 |
| 패턴 리포트 | 같은 `patternReport`; 최근 7일과 이전 28일 |
| 시각 디자인 | Firebase의 노랑·로고·토끼·단순한 조작 유지 |

공통 파일 변경 후 `npm run sync:firebase`와 전체 테스트를 실행합니다. 검사는 생성본 누락, 판단 결과 차이, 기본 디자인 계약 위반을 검출합니다. [CI 설치안](ci/README.md)은 연결 계정의 `workflow` 권한 부족으로 아직 자동 실행되지 않습니다. 권한 있는 관리자의 별도 설치가 필요하며 계정 권한은 변경하지 않았습니다. 새로운 화면·API·DB 기능까지 자동으로 이식하는 시스템은 아닙니다. Supabase 기능 변경 PR마다 [제품 결정 기록](PRODUCT_DECISIONS.md)의 점검표를 확인해야 합니다. 필수 병합 조건 설정도 이번 변경에 포함하지 않습니다.

## 데이터와 운영 경계

- 시뮬레이터는 합성 데이터만 메모리에 두며 새로고침하면 초기화합니다. 전력 버퍼는 최대 90개이며 실제 기기 연결·원시 전력 영구 저장·자동 신고가 없습니다.
- `docs/parity.mjs`는 기존 Firebase의 슬롯 요약을 공통 함수 입력으로 바꾸는 어댑터입니다. 공유 중지, 관찰 시작 전 상태, 선택하지 않은 끼니, 과거 외출 제외 기록은 기존 개인정보 보호 동작을 유지합니다.
- 전력 시뮬레이터는 흐름을 바로 보여줍니다. Supabase 서버의 주기 실행·이벤트 마감 지연까지 재현하지 않습니다. 실제 밥솥 정확도 검증으로 해석하면 안 됩니다.
- `확인됨`은 승인된 Supabase 규칙의 표현입니다. 실제 섭취량·영양·건강 상태를 증명하지 않습니다. 밥그릇 그림도 소식의 유무를 표현합니다.
- 기존 Firebase 계정·본인 수동 기록과 루트 Supabase BOB 계정·가족 페어링은 별도입니다. 기존 선택형 Supabase 제공자도 BOB와 다른 프로젝트입니다. 자격 증명·DB·RLS·사용자 데이터를 합치지 않았습니다.
- 실제 SmartThings, 가족 실시간 동기화, 푸시, BOB 인증 어댑터는 별도 승인·구현·통합 테스트가 필요합니다. 현재 가족 체험은 같은 탭에서만 동작합니다.

운영 주소는 `https://impact-series.web.app/`입니다. 여기의 커밋·PR은 해당 Firebase 운영 사이트로 자동 배포되지 않습니다. 저장소에 이미 연결된 루트 앱의 Vercel 미리보기는 별개이며, 2026-10-17에는 커밋 작성자의 GitHub 계정 확인 문제로 차단됐습니다. 이 작업은 작성자 설정·계정 권한·배포 연결을 바꾸지 않았습니다. `stage:firebase`, `firebase:inspect`, 배포 관련 스크립트에는 기존 프로젝트 설정이 있으므로 대상을 확인하고 별도 배포 요청 없이 실행하지 마세요. 기존 `documentation/`은 원본 개발 이력이며, 충돌하는 판단 규칙과 실행 경계는 이 README와 루트 ADR-006을 따릅니다.

## 출처와 보존

- 가져온 원본: `jooji13/Synagogue`의 커밋 `f66fe1f7d3177d08280b97048ceaa01f43f3fb65`.
- 파일 목록: `.env.example`, `.gitattributes`, `.gitignore`, `LICENSE`, `cloud/`, `docs/`, `documentation/`, `firebase.emulators.json`, `firebase/`, `package*.json`, `scripts/`, `supabase/`, `tests/`, `workshop/`.
- 원본 작업 폴더의 미커밋 변경과 로컬 비밀 파일은 가져오지 않았습니다. 라이선스·출처와 기존 로고·토끼 원본을 보존했습니다.
- 새 토끼는 `docs/assets/bunny-natural.png`, 원본은 `docs/assets/bunny.png`입니다. [이미지 제작 기록](documentation/character-refinement.md)에 편집 의도와 프롬프트를 남겼습니다.
- 사용자 제공 밥솥 캐릭터는 `docs/assets/rice-cooker-companion.png`입니다. 투명 배경으로 편집해 시니어 소식·보호자 카드 제목·센서 체험에 적용했습니다. 기존 `rice-companion.svg`와 로고·토끼는 보존했습니다. 기록에 따라 변하는 밥그릇과 구분되는 장식이며, 기존 소개 영상은 이번 캐릭터 변경으로 재렌더링하지 않았습니다.
