# Stack · v0.3 기술 구성

2026-10-16

| 영역 | 사용 기술 | 역할 |
| --- | --- | --- |
| 화면 | HTML5·CSS·ES modules | Figma A·B·C 기반 반응형 앱·별도 CRM |
| 가상 도메인 | 순수 JavaScript | 기기·끼니·가족 초대·시간·공유 중지 시뮬레이션 |
| 계정 UI | `docs/account-view.mjs` | 로그인·가입·비밀번호 찾기·실제 기록·CRM |
| Firebase | SDK 12.18.0 | Auth·Firestore, Google 및 이메일 로그인 |
| Supabase | supabase-js 2.118.0 | Auth·PostgreSQL·RLS |
| SDK 빌드 | esbuild 0.27.3 | 공식 SDK를 로컬 ESM으로 번들·라이선스 포함 |
| 검증 | Node assert·rules-unit-testing 5.0.2 | 58개 가상 규칙, 31개 Firebase 에뮬레이터 검사 |
| DB 검증 | PostgreSQL SQL·역할 전환 | 계정 24개·돌봄 58개 검사 후 rollback |
| 실행·배포 | Node 22+·firebase-tools 15.28.2 | 로컬 미리보기·기존 Hosting 파일 해시 보존 |
| 에뮬레이터 런타임 | Java 21 | Auth·Firestore 검사. 개발용이며 배포하지 않음 |
| 호스팅 | 기존 `ku-gpa` Firebase Hosting | `/bapmunna/`와 `/bapmunna/supabase/` |
| 버전 관리 | private `jooji13/Synagogue` main | 소스·문서·단일 파일 앱 |

UI 프레임워크는 추가하지 않았다. Figma 이미지와 폰트는 로컬 자산이며 외부 CDN을 요구하지 않는다. 인증·실제 저장 모듈만 선택한 서비스와 통신한다. 순수 체험 로직은 서버에 가상 데이터를 전송하지 않는다.

Supabase 프로젝트는 `dakozsbqltciqihazzel`이다. 이전 생략 요청은 이후의 ‘같은 웹앱·DB 구현’ 요청으로 변경되었다. 두 저장소를 자동 동기화하지 않는다. 클라이언트 설정에는 Firebase 공개 SDK 설정과 Supabase publishable key만 포함한다.

14개 Supabase 테이블·가족 RPC와 Firebase 가족 권한 규칙·인덱스를 추가했다. 실기기 API·푸시 스케줄러·실제 가족 공유 UI·AI 학습은 아직 연결하지 않았다. 메일·인증 운영 제약과 보존·권한 정책은 [database.md](database.md), 실제 배포 기록은 [deployment.md](deployment.md)를 따른다.


관리센터 차트는 HTML/CSS 막대와 접근 가능한 SVG 도넛으로 구현한다. `manage/metrics.mjs`의 집계는 Node 기본 테스트 러너로 검증한다(`npm run test:manage`). 추가 런타임 의존성·차트 CDN·유료 서비스는 없다. 합성 자료 미리보기는 `node scripts/preview-management.mjs`의 localhost 전용 화면이다.

## 역할별 배포 구성

새 프레임워크·외부 라이브러리 없이 `build-editions.mjs`가 공통 shell에서 Senior/Carer HTML을 생성한다. `npm run test:editions`는 7개 라우팅·공급자 경로·콜백·단일 HTML 역할 검사를 실행한다.

## v1.1 구현 추가 · 2026-10-16

추가 런타임 의존성 없이 ES modules(`power.mjs`, `worksheet.mjs`)와 기존 CSS/네이티브 폼을 사용한다. `build-portable.mjs`가 두 모듈과 worksheet.css를 단일 HTML에 포함한다. 새 센서·네트워크 API SDK를 설치하거나 유료 서비스를 켜지 않았다.
