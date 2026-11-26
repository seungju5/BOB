import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { firebaseView } from "@/lib/data/firebase";

const context = vi.hoisted(() => ({ view: null as unknown, actions: {}, accountKey: null }));
vi.mock("@/lib/data/useApp", () => ({ useApp: () => context }));
vi.mock("@/components/DevicePushSettings", () => ({ DevicePushSettings: () => null }));
import AlertsPage from "@/app/(guardian)/alerts/page";

describe("notification inbox", () => {
  it("keeps report access available without inventing issued reports on an empty account", () => {
    context.view = firebaseView({ settings: null, household: null });
    const html = renderToStaticMarkup(createElement(AlertsPage));
    expect(html).toMatch(/href="\/report\/?"/);
    expect(html).toContain("최근 7일 리포트");
    expect(html).toContain("아직 받은 알림이 없어요");
    expect(html).not.toContain("리포트가 발행되었어요");
    expect(html.indexOf("최근 7일 리포트")).toBeLessThan(html.indexOf("이 휴대폰 알림 설정"));
  });
  it("retains both read report history and new family notices, with report navigation", () => {
    const view = firebaseView({ settings: null, household: null });
    view.alerts = [
      { id: "weekly", type: "weekly_report", triggeredAt: "2026-11-23T00:00:00Z", acknowledgedAt: "2026-11-23T01:00:00Z", resolvedAt: null },
      { id: "help", type: "help_request", triggeredAt: "2026-11-26T00:00:00Z", acknowledgedAt: null, resolvedAt: null },
    ];
    context.view = view;
    const html = renderToStaticMarkup(createElement(AlertsPage));
    expect(html).toContain('id="notice-weekly"');
    expect(html).toContain('id="notice-help"');
    expect(html.indexOf('id="notice-help"')).toBeLessThan(html.indexOf('id="notice-weekly"'));
    expect(html).toContain("리포트 보기");
    expect(html).toContain("확인함");
    expect(html).toContain("모두 확인");
  });
});
