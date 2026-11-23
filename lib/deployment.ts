// 팀 공용 웹앱으로 연결하는 공개 경로. 루트 호환판의 API는 같은 origin만 사용한다.
import deployment from "@/config/deployment.json";

export const WEB_ORIGIN = deployment.webOrigin;
export const API_ORIGIN = "";
export const PRIVACY_SUPPORT_EMAIL = deployment.privacySupportEmail;

export const publicUrl = (path: string) => WEB_ORIGIN + "/" + path.replace(/^\/+/, "");
