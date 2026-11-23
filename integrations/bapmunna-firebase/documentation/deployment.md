# 이전 디자인 통합판의 배포 이력

이 통합판은 이제 로컬에서 디자인·역할 전환·Firebase 에뮬레이터 호환성을 검사하는 데 사용한다. 팀 운영 앱의 소스는 `main`의 `apps/warming-up/`에 있고, Hosting과 인증·데이터베이스는 팀 프로젝트 `warming-up-bapmunna`에서 관리한다. [로컬 통합판 실행](../README.md) · [팀 운영 안내](../../../docs/team-migration.md) · [팀 웹앱](https://warming-up-bapmunna.web.app/)

## 2026년 10월 16일의 별도 정적 사이트 기록

| 당시 게시 대상 | Hosting 버전 | 확인한 내용 |
| --- | --- | --- |
| Impact Series 통합판 | `d2bcdd9c6e1e59a0` | 주요 HTML·모듈·관리센터 응답의 해시 일치, 모바일 체험과 기록 화면 확인. 기존 2,260개 경로 보존 |
| KU Open World 경주路 | `3cfac32c25a470b3` | 게시된 파일 지도 일치. 당시 트래픽 한도로 공개 접속 시 HTTP 509 응답 |
| Impact Series 환영 인트로 | `ab4b4deca45a6b51` | UI 파일 7개와 영상·포스터 2개의 해시 일치, 다른 2,309개 경로와 Hosting 설정 보존 |

당시 두 사이트의 저장 한도로 첫 게시 시도가 중단됐다. 이후 승인된 Impact Series 과거 버전 49개와 KU Open World 과거 버전 178개를 정리한 뒤 위 버전을 게시했다. 트래픽 제한과 실제 로그인은 당시 별도 확인 항목으로 남았다. 역할별 화면, 관리센터와 데이터 권한, 워크시트 요구사항의 검증 기록은 각 문서에 보관한다. [어르신용·보호자용 화면](editions.md) · [계정과 데이터 계약](database.md) · [개발 기록](log.md)
