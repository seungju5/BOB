import deployment from "@/config/deployment.json";
import { APP_BASE_PATH } from "@/lib/app-path";

export const WEB_ORIGIN = APP_BASE_PATH === "/bapmunna/app"
  ? deployment.webOrigin
  : deployment.supabaseWebOrigin;
export const API_ORIGIN = "";
export const PRIVACY_SUPPORT_EMAIL = deployment.privacySupportEmail;

export const publicUrl = (path: string) => WEB_ORIGIN + "/" + path.replace(/^\/+/, "");
