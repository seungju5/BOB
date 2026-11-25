import {afterEach,describe,expect,it,vi} from "vitest";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe("Firebase 하위 경로", () => {
  it("브라우저 경로에 마운트 경로를 붙이고 인증 쿼리를 보존한다", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_BASE_PATH", "/bapmunna/app");
    const {appPath} = await import("@/lib/app-path");
    expect(appPath("/auth/callback?code=example")).toBe("/bapmunna/app/auth/callback?code=example");
    expect(appPath("/brand/bunny.png")).toBe("/bapmunna/app/brand/bunny.png");
    expect(() => appPath("//other.example/login")).toThrow();
  });

  it("기본 루트 배포 경로는 그대로 유지한다", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_BASE_PATH", "");
    const {appPath} = await import("@/lib/app-path");
    expect(appPath("/start")).toBe("/start");
  });

  it("서버 알림 경로를 해당 앱으로 보내고 다른 사이트 주소는 거부한다", () => {
    const source=readFileSync(new URL("../../public/sw.js",import.meta.url),"utf8");
    const {safeClickURL}=runInNewContext(source+";({safeClickURL})",{
      URL, importScripts:vi.fn(),
      self:{registration:{scope:"https://impact-series.web.app/bapmunna/app/"},addEventListener:vi.fn()},
    });
    expect(safeClickURL("/report")).toBe("https://impact-series.web.app/bapmunna/app/report/");
    expect(safeClickURL("/bapmunna/app/alerts?example=1")).toBe("https://impact-series.web.app/bapmunna/app/alerts/");
    expect(safeClickURL("https://other.example/")).toBe("https://impact-series.web.app/bapmunna/app/alerts/");
    expect(safeClickURL("http://[")).toBe("https://impact-series.web.app/bapmunna/app/alerts/");
  });

  it("홈 화면 설치가 루트와 하위 경로에서 각각 자기 앱에 머문다", () => {
    const manifest=JSON.parse(readFileSync(new URL("../../app/manifest.webmanifest",import.meta.url),"utf8"));
    for(const prefix of ["/", "/bapmunna/app/"]){
      const url="https://impact-series.web.app"+prefix+"manifest.webmanifest";
      expect(new URL(manifest.scope,url).pathname).toBe(prefix);
      expect(new URL(manifest.start_url,url).pathname).toBe(prefix);
      const icons = manifest.icons.map((icon: {src: string; purpose: string}) =>
        [new URL(icon.src,url).pathname, icon.purpose]);
      expect(icons).toEqual([
        [prefix+"brand/home-icon-white-192.png","any"],
        [prefix+"brand/home-icon-white-512.png","any"],
        [prefix+"brand/home-icon-white-maskable-512.png","maskable"],
      ]);
    }
  });
});
