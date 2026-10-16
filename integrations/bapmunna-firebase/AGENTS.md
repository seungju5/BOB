# Firebase 통합판 작업 원칙

루트 AGENTS.md와 CLAUDE.md를 먼저 따른다. 이 폴더를 변경하기 전 README.md와 PRODUCT_DECISIONS.md를 읽는다. 사용자의 최신 명시적 결정이 오래된 시안·문서보다 우선한다.

- 기능·판단의 기준은 루트 Supabase 앱이다. 공통 판단 코드를 복제 수정하지 말고 루트에서 `npm run sync:firebase`로 생성한다. `docs/shared/`는 수동 편집하지 않는다.
- Firebase의 기존 노란색 디자인·밥솥 로고·토끼 정체성을 유지한다. Supabase UI로 덮어쓰지 않는다. 시니어 주요 버튼은 세 개이며 사진 촬영을 요구하지 않는다.
- 루트 Next.js 앱, DB, 인증, RLS, 운영 배포는 이 통합판 작업과 분리한다. 기능 동등성은 데이터베이스 공유를 의미하지 않는다.
- 새 Supabase 기능은 도메인·화면·데이터 연결을 나눠 확인한다. 미이식 기능을 완료로 표시하거나 자동 동기화가 된다고 주장하지 않는다.
- 변경 뒤 `npm test`, `npm run test:firebase`, `npx tsc --noEmit`, `npm run build:firebase`를 루트에서 실행하고 역할 전환을 포함해 모바일 화면을 확인한다.
- 운영 서비스·센서·신고·유료 작업은 별도 요청 없이 실행하지 않는다. 이 폴더의 이전 배포 스크립트를 무심코 실행하지 않는다.
