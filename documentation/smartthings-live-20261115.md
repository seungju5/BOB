# SmartThings 공개 서버 결과 · 2026-11-15

## 현재 결론

**전용 서버 배포·비밀 설정·실제 Firebase 읽기·공개 API 경계 검증 완료. 삼성 앱 URL 변경은 403으로 거부되어 실제 사용자 OAuth·자동 기기 수신은 미완료다.** Firebase Spark와 Vercel Hobby를 유지했고 신규 결제는 실행하지 않았다. 서버 `config.enabled=true`는 서버 내부 설정이 준비됐다는 뜻이며 삼성 등록·실기기 성공을 뜻하지 않는다. 웹앱의 `smartThingsApiOrigin`은 빈 값으로 유지한다.

## 실제 완료한 것

| 항목 | 확인 결과 |
| --- | --- |
| 고정 운영 서버 | `https://bapmunna-smartthings.vercel.app` |
| 현재 정상 응답 배포 | `dpl_22Lwa2Vr6oWA2UE1YWYpeXPqvwxg` (마지막 보안 헤더 보완 포함) |
| 이전 정상 응답 배포 | `dpl_kRFKE6WMV23EGbcHD8AhL158sgyq`; `/connect/` 헤더 보완 전 버전 |
| 최초 배포 | `dpl_8wnLhdpsozDZqYarBxP5ZGgTkB7B`; 초기 라이브러리 로딩 실패로 현재 복구 대상으로 사용하지 않음 |
| Vercel 프로젝트 | `bapmunna-smartthings`, project `prj_oGTlANnAsT3dLHCWcsCNzOwpyhW3`, Hobby |
| Firebase 전용 계정 | 승인받은 `bapmunna-smartthings` 계정·8개 권한, Owner/Editor 없음 |
| 실서버 권한 확인 | 전용 키로 무작위 미존재 Firestore 문서 조회와 Firebase Auth 사용자 조회 허용 확인. 실사용자 데이터 조회·쓰기 없음 |
| 운영 환경 | production 전용 비밀값 6개와 일반 설정 8개 저장 성공을 UI에서 확인 |
| 원본 파일 | 비밀을 제외한 명시적 15개 파일만 업로드. 모델 학습 데이터 공유는 업로드 전에 해제 |
| 복귀 경로 | `https://impact-series.web.app/bapmunna/carer/#connect`; 최신 `/app/settings#device`와 동일 Firebase UID 연결 계약 유지 |

기본 Vercel Node 실행에서는 Firebase Admin 14 → jwks-rsa 4 → jose 6 로딩이 `ERR_REQUIRE_ESM`으로 실패했다. Vercel 공식 `NODE_OPTIONS=--experimental-require-module` 설정 후 재배포하여 API 200을 확인했다. 라이브러리 강제 다운그레이드·인증 생략은 하지 않았다. `NODEJS_HELPERS=0`도 production에 명시했다.

## 공개 API 검사

| 요청 | 응답 및 검증 |
| --- | --- |
| `GET /api/smartthings/config` | 200, 서버 설정 준비, 허용 origin과 복귀 URL 일치 |
| 인증 없는 `GET /status` | 401 `login_required` |
| 서명 없는 `POST /events` | 401 `invalid_webhook` |
| 임의 code/state callback | 400 `invalid_state` |
| 비밀 없는 `GET /cleanup` | 401 `unauthorized` |
| 승인 origin 사전 요청 | 204, 정확한 Impact Series origin만 허용 |
| 다른 origin 사전 요청 | 403 `invalid_origin` |

API 응답에 `no-store`·`no-referrer`를 확인했다. 최종 배포 후 위 7개 API 경계와 연결 화면 3개 URL의 공개 응답 검사 **10개 통과**. 로컬 실제 HTTP 및 Vercel 어댑터 검사 **13개 통과, 실패·skip 0**. 임의 callback 값은 합성 진단값이며 실제 OAuth code가 아니다. 로그인한 실제 사용자 토큰으로 `/status`를 확인하거나 자동 웹훅을 수신한 증거는 아직 없다.

## 마지막 보완 배포 완료

이전 배포의 `/connect`와 `/connect/index.html`에는 CSP·`no-store`·`no-referrer`가 있지만 **끝 슬래시 `/connect/`에는 누락**되어 있었다. 독립 서버 전체 경로에 적용하도록 `template/vercel.json`의 헤더 매칭을 보완하고, Node 호환 설정도 재현 가능한 배포 템플릿에 넣었다.

보완 ZIP은 파일 15개, 540,627바이트, SHA-256 `dfe029a3b812a94e2081386d181caa1d04604a45f1f32ba8de200e24f7112b3b`이다. 공식 Vercel Drop의 **기존 프로젝트 업데이트** 화면에서 정확한 `bapmunna-smartthings` production 대상을 선택했다. 추가 이메일 인증 후 새 배포 `dpl_22Lwa2Vr6oWA2UE1YWYpeXPqvwxg`의 Ready 및 운영 도메인 할당을 확인했다.

2026-11-15 09:19 KST 공개 재검사에서 `/connect`, `/connect/`, `/connect/index.html` 모두 200, CSP, `no-store`, `no-referrer`, `X-Frame-Options: DENY`를 확인했다. 기존 API 인증·서명·state·CORS 검사도 유지됐다. 안전한 배포 영수증은 `workspaces/smartthings-vercel/releases/20261115-production.json`에 보관했다.

## 최종 소스 검증

Node 24.22.1과 직접 시작한 `demo-bapmunna` 로컬 Firestore에서 전체 하네스를 실행했다. **427개 통과, 실패 0, skip 0**(하네스 25·앱 246·개인정보 48·Firebase 59·SmartThings 49). 타입·원본 동기화·Firebase 두 빌드·Next Webpack 빌드도 통과했고 검사 시작/종료 소스 지문이 같았다. 보고서: `.harness/runs/2026-11-15T00-23-23-580Z-12035/report.md`.

별도 읽기 전용 검토에서 두 설정 변경의 수정 필요 결함은 발견하지 않았다. 허용 목록의 소스/스테이징 파일 및 생성 manifest·lockfile 일치도 확인했다. 독립 검토자의 한계였던 CSP 실제 값은 이후 공개 연결 화면과 config API에서 템플릿과 정확히 일치함을 추가 확인했다. 이 변경은 UI·판단 규칙·Supabase·브라우저 Rules를 수정하지 않았으므로 기존 실기기/브라우저/푸시의 미확인 사항은 그대로 남긴다. 로컬 Firestore 검사는 실제 가구 계정·삼성 동의·자동 신호의 성공을 대신하지 않는다.

## 삼성에서 막힌 실제 요청

기존 앱 `f1b8149d-45c5-4f4b-8136-2ad518faf4ec`의 설정을 다시 읽어 비공개 복구본을 남긴 후 공식 CLI 3.0.1의 `smartapps:update`로 새 웹훅 주소를 요청했다. HTTP 403을 받았고 공식 CLI는 “Creating or modifying a Smart App requires a paid plan” 안내를 반환했다. 실패 후 OAuth 설정 변경은 실행하지 않았다.

공식 CLI가 403을 위 안내로 변환한다는 사실과 계정의 실제 플랜은 구분한다. Console의 Manage Plans는 다시 삼성 로그인을 요구하며 현재 CAPTCHA 확인 단계이므로 정확한 플랜·기존 앱 전환 적용 여부는 미확인이다. 새 앱·새 secret·추가 scope·유료 구독을 생성하지 않았다. 삼성 지원 문의도 아직 발송하지 않았다.

거부 이후 재조회한 등록값은 그대로다.

- Webhook: `https://impact-series.web.app/api/smartthings/events`
- Redirect: `https://impact-series.web.app/api/smartthings/callback`
- Scope: `r:devices:*`
- Target: `PENDING`

승인받아 적용하려던 주소는 아래와 같다. **아직 삼성 등록값이 아니다.**

- Webhook: `https://bapmunna-smartthings.vercel.app/api/smartthings/events`
- Redirect: `https://bapmunna-smartthings.vercel.app/api/smartthings/callback`

Firebase Spark 301/302로 서명된 POST 웹훅을 우회하거나, 개인 개발자 CLI 자격증명을 배포 서버 토큰으로 전용하지 않았다.

## 재개 순서와 복구

1. 삼성 Console에서 현재 이용 플랜·앱 수정 권한·기존 앱 적용 조건을 확인한다. 2~3가구 파일럿의 적합한 플랜·비용을 확정하고 별도 사용자 결정 전에는 결제하지 않는다.
2. 기존 앱 webhook와 redirect를 위 새 주소로 변경하고 `smartapps:confirm` 후 Target `CONFIRMED`를 재조회한다. 기존 secret·암호화 키와 읽기 scope는 유지한다.
3. 그 뒤에만 frontend API origin을 활성화한다. 최신 Hosting 기준 경로는 `tmp/worktrees/bapmunna-final-feedback/tmp/impact-final/site/bapmunna`이며 건강 안내가 포함된 릴리스 `8135bed18869753c`를 보존한다.
4. 실제 본인 OAuth·플러그 선택·새 자동 신호·갱신·해제·재연결·2~3가구 격리를 확인한다. 신호 수신 시각을 식사 완료나 실제 푸시 성공으로 바꾸어 표시하지 않는다.

Vercel 정상 응답 배포 ID는 위 표에 보존했다. 복구 시 source와 production 환경변수의 세대를 함께 확인한다. IAM 이전 정책, 비공개 키와 삼성 등록 전후 진단은 Git 제외 `tmp/smartthings-live-20261114/`에 있으며 공개 PR에 포함하지 않는다. 기존 원본 키를 유지하고 불필요한 일회성 비밀 입력 묶음은 정리한다.

## 근거

- [Vercel ESM 호환 설정](https://vercel.com/docs/functions/runtimes/node-js/advanced-node-configuration#experimental-nodejs-require-of-es-module)
- [삼성 API Access App 등록 조건과 Target 확인](https://developer.smartthings.com/docs/service-integrations/app-setup)
- [공식 CLI의 403 처리 소스](https://github.com/SmartThingsCommunity/smartthings-cli/blob/master/packages/cli/src/lib/command/util/smartapps-util.ts)

공유용 2쪽 PDF는 workspace `output/pdf/bapmunna-smartthings-status-20261115.pdf`에 있다. 비밀번호·인증번호·비밀키·기기 ID·원시 전력값은 보고서에 포함하지 않았다.
