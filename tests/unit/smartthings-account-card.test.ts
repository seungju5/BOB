/**
 * [EN] Unit tests for SmartThingsAccountCard, account-model, and useSmartThingsSyncController.
 * [KR] SmartThings 연동 카드, 데이터 모델, 동기화 컨트롤러를 검증하는 단위 테스트입니다.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const mocks = vi.hoisted(() => ({
  useApp: vi.fn(),
  updateDemo: vi.fn(),
}));

vi.mock("@/lib/data/useApp", () => ({ useApp: mocks.useApp }));
vi.mock("@/lib/demo/store", () => ({ updateDemo: mocks.updateDemo }));

import {
  DEFAULT_SMARTTHINGS_PROFILE,
  formatSmartThingsKst,
} from "@/lib/smartthings/account-model";
import { SmartThingsAccountCard } from "@/components/SmartThingsAccountCard";

describe("SmartThings Account Model and Formatter", () => {
  it("provides verified owner cloud device defaults [KR: 사용자 클라우드 밥솥 플러그 기본값 검증]", () => {
    expect(DEFAULT_SMARTTHINGS_PROFILE.deviceId).toBe("demo-rice-cooker-plug");
    expect(DEFAULT_SMARTTHINGS_PROFILE.deviceLabel).toBe("우리 집 밥솥 플러그");
    expect(DEFAULT_SMARTTHINGS_PROFILE.locationName).toBe("My home");
    expect(DEFAULT_SMARTTHINGS_PROFILE.roomName).toBe("Living room");
    expect(DEFAULT_SMARTTHINGS_PROFILE.capabilities).toContain("powerMeter");
    expect(DEFAULT_SMARTTHINGS_PROFILE.capabilities).toContain("switch");
    expect(DEFAULT_SMARTTHINGS_PROFILE.switchState).toBe("on");
  });

  it("formats timestamps into human-readable KST strings [KR: KST 시각 포맷 변환 검증]", () => {
    const formatted = formatSmartThingsKst("2026-11-18T07:28:11.584Z");
    expect(formatted).toMatch(/11월\s*18일/);
    expect(formatSmartThingsKst(null)).toBe("아직 수신 기록 없음");
    expect(formatSmartThingsKst("invalid-date")).toBe("확인 필요");
  });
});

describe("SmartThingsAccountCard Presentation Contract", () => {
  beforeEach(() => {
    mocks.useApp.mockReset().mockReturnValue({
      view: {
        plug: {
          deviceId: "demo-rice-cooker-plug",
          online: true,
          lastReadingAt: "2026-11-18T07:28:11.584Z",
        },
      },
    });
  });

  it("renders compact mode with linked badges and location [KR: 홈 화면용 컴팩트 모드 렌더링 검증]", () => {
    const html = renderToStaticMarkup(createElement(SmartThingsAccountCard, { compact: true }));
    expect(html).toContain("SmartThings 연결 예시");
    expect(html).toContain("우리 집 밥솥 플러그");
    expect(html).toContain("My home · Living room");
    expect(html).toContain('href="/connect"');
    expect(html).toContain("상세 보기");
  });

  it("renders full mode with capabilities and refresh button [KR: 기기 연결 상세 모드 렌더링 검증]", () => {
    const html = renderToStaticMarkup(createElement(SmartThingsAccountCard, { compact: false }));
    expect(html).toContain("SmartThings 연결 예시");
    expect(html).toContain("예시 신호 수신");
    expect(html).toContain("우리 집 밥솥 플러그");
    expect(html).toContain("demo-rice-cooker-plug");
    expect(html).toContain("Living room");
    expect(html).toContain("My home");
    expect(html).toContain("전력·에너지 측정 플러그");
    expect(html).toContain("예시 취사 신호 반영하기");
    expect(html).toContain("산책길 밥김 하트 보기");
  });
});
