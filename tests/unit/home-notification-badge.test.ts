import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { firebaseView } from "@/lib/data/firebase";

const context = vi.hoisted(() => ({ view: null as unknown, now: new Date("2026-11-26T03:00:00Z") }));
vi.mock("@/lib/data/useApp", () => ({ useApp: () => context }));
import HomePage from "@/app/(guardian)/home/page";

describe("home notification badge", () => {
  it("counts active unacknowledged notices, including reports, and clears after acknowledgement", () => {
    const view = firebaseView({ settings: null, household: null });
    const notice = { type: "weekly_report" as const, triggeredAt: context.now.toISOString(), acknowledgedAt: null, resolvedAt: null };
    view.alerts = [
      { ...notice, id: "new" },
      { ...notice, id: "read", acknowledgedAt: context.now.toISOString() },
      { ...notice, id: "resolved", resolvedAt: context.now.toISOString() },
    ];
    context.view = view;
    const render = () => renderToStaticMarkup(createElement(HomePage));
    expect(render()).toContain('aria-label="미확인 알림 1개 확인하기"');
    expect(render()).toMatch(/data-notification-badge[^>]*>1<\/span>/);
    expect(render()).toMatch(/href="\/alerts\/?"/);
    view.alerts[0].acknowledgedAt = context.now.toISOString();
    expect(render()).not.toContain("data-notification-badge");
    expect(render()).toContain('aria-label="알림 확인하기"');
  });

  it("caps the compact badge while retaining the exact accessible count", () => {
    const view = firebaseView({ settings: null, household: null });
    view.alerts = Array.from({ length: 100 }, (_, i) => ({ id: `notice-${i}`, type: "weekly_report" as const, triggeredAt: context.now.toISOString(), acknowledgedAt: null, resolvedAt: null }));
    context.view = view;
    const html = renderToStaticMarkup(createElement(HomePage));
    expect(html).toContain('aria-label="미확인 알림 100개 확인하기"');
    expect(html).toMatch(/data-notification-badge[^>]*>99\+<\/span>/);
  });
});
