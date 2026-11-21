// 배포 대상(계정·주소)은 config/deployment.json 한 곳에서만 관리한다.
// 팀 계정으로 옮길 때 코드 대신 그 파일을 바꾼다 (docs/team-migration.md).
import deployment from "@/config/deployment.json";

/** 공개 웹앱 주소의 origin. 예: https://<프로젝트>.web.app */
export const WEB_ORIGIN = deployment.webOrigin;
/** Vercel 서버(SmartThings·카카오·걸음수·하트) origin */
export const API_ORIGIN = deployment.apiOrigin;
/** 개인정보 문의 이메일 */
export const PRIVACY_SUPPORT_EMAIL = deployment.privacySupportEmail;
/** 정적 게시판 경로 (/bapmunna/...) 아래의 공개 주소 */
export const publicUrl = (path: string) => `${WEB_ORIGIN}/bapmunna${path.startsWith("/") ? path : `/${path}`}`;
export const ANDROID_APK_URL = deployment.androidApkUrl;
export const ANDROID_RELEASE_URL = `${WEB_ORIGIN}${deployment.androidReleaseJsonPath}`;
