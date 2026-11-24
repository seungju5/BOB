import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import ConnectPage from "@/app/connect/page";

const { useApp } = vi.hoisted(() => ({ useApp: vi.fn() }));
vi.mock("@/lib/data/useApp", () => ({ useApp }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("@/components/SmartThingsPanel", () => ({ SmartThingsPanel: () => null }));

const sourceTime = "2026-04-01T01:02:03.000Z";
const view = { mode: "live", dataSource: "supabase", onboardingStep: 8, seniorConsent: true,
  plug: { deviceId: "test-device", online: true, meterKind: "recognized", lastReadingAt: sourceTime, lastSignalHigh: true } };
function render(overrides: Record<string, unknown> = {}) {
  useApp.mockReturnValue({ provider: "supabase", accountKey: "test-user", now: new Date(sourceTime),
    actions: { registerPlug: vi.fn(), setPowerNotice: vi.fn(), disconnectPlug: vi.fn() }, needsLogin: false, view, ...overrides });
  return renderToStaticMarkup(createElement(ConnectPage));
}

it("renders the live saved plug, source-timed reading and explicit notice controls without a demo receipt", () => {
  const html = render();
  expect(html).toContain("이 측정에서 취사 기준에 맞는 신호가 있었어요");
  expect(html).toContain("기기 변경 또는 테스트 토큰 갱신");
  expect(html).toContain('role="switch"');
  expect(html).toContain("개인 전력 점검 파일 열기");
  expect(html).toContain("확인하고 연결 해제하기");
  expect(html).not.toContain("My home");
  expect(html).not.toContain("demo-rice-cooker-plug");
});
it("exposes the actual registration form to a consented signed-in household without a plug", () => {
  const html = render({ view: { ...view, plug: { deviceId: "", online: false, lastReadingAt: null } } });
  expect(html).toContain("SmartThings 테스트 토큰");
  expect(html).toContain("플러그 기기 ID");
  expect(html).not.toContain('role="switch"');
});
it("keeps virtual measurements in inspection mode and requires consent to read personal files", () => {
  const virtual = render({ view: { ...view, plug: { ...view.plug, meterKind: "virtual", lastSignalHigh: null } } });
  expect(virtual).toContain("가상 기기");
  expect(virtual).not.toContain('role="switch"');
  expect(virtual).not.toContain("이 측정에서 취사 기준에 맞는 신호가 있었어요");
  const withoutConsent = render({ view: { ...view, seniorConsent: false } });
  expect(withoutConsent).toContain("동의 확인하러 가기");
  expect(withoutConsent).not.toContain("개인 전력 점검 파일 열기");
  expect(withoutConsent).not.toContain("SmartThings 테스트 토큰");
  expect(render({ needsLogin: true, accountKey: undefined, view: null })).not.toContain("기기 변경 또는 테스트 토큰 갱신");
});
