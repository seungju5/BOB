import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const mocks = vi.hoisted(() => ({ useApp: vi.fn(), push: vi.fn(), replace: vi.fn() }));
vi.mock("@/lib/data/useApp", () => ({ useApp: mocks.useApp }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push, replace: mocks.replace }) }));
vi.mock("@/lib/data/mode", () => ({ setMode: vi.fn() }));
vi.mock("@/lib/demo/store", () => ({ resetDemo: vi.fn(), updateDemo: vi.fn() }));
vi.mock("@/lib/data/live", () => ({ refreshLive: vi.fn() }));

import SettingsPage from "@/app/(guardian)/settings/page";
import OnboardingPage from "@/app/onboarding/page";
import TutorialPage from "@/app/tutorial/page";
import { ConnectionGuide } from "@/components/onboarding/ConnectionGuide";
import { createDemoState } from "@/lib/demo/state";
import { toView } from "@/lib/demo/derive";
import type { AppView } from "@/lib/data/view";

const NOW = new Date("2026-11-14T03:00:00Z");
let view: AppView;
beforeEach(() => {
  view = { ...toView(createDemoState(NOW), NOW), mode: "live", onboardingStep: 8, seniorConsent: true, senior: { relation: "어머니", name: "예시 정숙", phone: "010-1234-5678" }, plug: { deviceId: "", online: false, lastReadingAt: null } };
  mocks.useApp.mockReset().mockImplementation(() => ({ view, now: NOW, actions: {}, mode: view.mode, provider: view.dataSource ?? "supabase", needsLogin: false, error: null, accountKey: "synthetic-user", accountLabel: "synthetic@example.test", signOut: vi.fn() }));
});

describe("settings and onboarding presentation contracts", () => {
  it("starts with three collapsed categories while retaining the editable form contents", () => {
    const html = renderToStaticMarkup(createElement(SettingsPage));
    const groups = html.match(/<details[^>]*id="(?:alerts|life|device)"[^>]*>/g) ?? [];
    expect(groups).toHaveLength(3);
    for (const group of groups) expect(group).not.toMatch(/\sopen(?:=|\s|>)/);
    for (const label of ["알림 기준", "생활 기준", "기기", "대표자 성함", "대표자 연락처", "함께 사는 분", "반려견", "소개 다시 보기"]) expect(html).toContain(label);
    expect(html).toContain('id="account"');
    expect(html).toContain('for="settings-senior-name"');
    expect(html).toContain('for="settings-senior-phone"');
    expect(html).toContain("생활 기준 저장");
  });

  it("does not expose a PAT, fabricated family code or absence mutation for an unready Firebase account", () => {
    Object.assign(view, { dataSource: "firebase", careAvailable: false, seniorConsent: true, pairingCode: "867530", seniorPaired: false });
    const html = renderToStaticMarkup(createElement(SettingsPage));
    expect(html).toContain("기기 연결 준비 상태 보기");
    expect(html).toContain("아직 수신한 기록이 없어요");
    expect(html).toContain("부재 일정은 가족 연결이 준비된 뒤");
    expect(html).not.toContain("SmartThings 테스트 토큰");
    expect(html).not.toContain('type="password"');
    expect(html).not.toContain("867530");
    expect(html).not.toContain("부재 일정 추가");
    expect(html).not.toContain("연결 숫자 받기");
  });

  it("distinguishes a local demo from the signed-in account and avoids asking for real tokens", () => {
    view.mode = "demo";
    const html = renderToStaticMarkup(createElement(SettingsPage));
    expect(html).toContain("이 브라우저에만 저장");
    expect(html).toContain("예시 체험 도구");
    expect(html).not.toContain("synthetic@example.test");
    expect(html).not.toContain('type="password"');
  });

  it("shows the saved household review before optional lifestyle steps, with a later-from-home choice", () => {
    view.onboardingStep = 4;
    const html = renderToStaticMarkup(createElement(OnboardingPage));
    for (const label of ["입력하신 정보", "예시 정숙", "어머니", "함께 사는 분", "반려견", "이제 생활 설정하기", "홈에서 나중에 설정하기", "우리 집 정보 수정"]) expect(html).toContain(label);
    expect(html).toContain("우리 집 정보를 저장했어요");
    expect(html).not.toContain('type="password"');
  });

  it("shows preparation at the pairing step for a Firebase account without family service", () => {
    Object.assign(view, { onboardingStep: 7, dataSource: "firebase", careAvailable: false, seniorConsent: true, pairingCode: "867530" });
    const html = renderToStaticMarkup(createElement(OnboardingPage));
    expect(html).toContain("가족 휴대폰 연결을 준비하고 있어요");
    expect(html).toContain("홈으로 가기");
    expect(html).not.toContain("867530");
    expect(html).not.toContain("연결을 기다리는 중");
  });

  it("keeps the five-slide introduction and full start sequence explicit", () => {
    view.onboardingStep = 1;
    const html = renderToStaticMarkup(createElement(TutorialPage));
    expect(html).toContain('aria-valuemax="5"');
    for (const label of ["로그인", "소개", "우리 집", "홈", "건너뛰기", "밥솥이 안부를"]) expect(html).toContain(label);
    expect(html).toContain("rice-cooker-companion.png");
    expect(html).not.toContain("/brand/bunny.png");
  });

  it("provides two collapsed illustrative connection guides without authentication controls", () => {
    const html = renderToStaticMarkup(createElement(ConnectionGuide));
    expect((html.match(/<details\b/g) ?? []).length).toBe(2);
    expect(html).not.toMatch(/<details[^>]*\sopen/);
    expect(html).toContain("삼성 계정에서 권한 허용");
    expect(html).toContain("플러그 선택과 신호 확인");
    expect(html).toContain("안내 예시 · 실제 동작 없음");
    expect(html).toContain("prefers-reduced-motion: reduce");
    expect(html).not.toMatch(/<(button|input|iframe|video)\b/);
  });
});
