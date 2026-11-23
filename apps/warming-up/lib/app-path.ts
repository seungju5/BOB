/** Build-time mount point for raw browser URLs. Next Link/router add basePath themselves. */
export const APP_BASE_PATH = process.env.NEXT_PUBLIC_APP_BASE_PATH ?? "";

/** Static export adds trailing slashes; compare navigation routes consistently. */
export function routePath(pathname: string): string {
  return pathname.replace(/\/+$/, "") || "/";
}

export function appPath(path: string): string {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) {
    throw new Error("앱 내부 경로만 사용할 수 있어요.");
  }
  return `${APP_BASE_PATH}${path}`;
}
