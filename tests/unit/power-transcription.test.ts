/**
 * [EN] Unit tests for power transcription data model, controller hook, and presentation component.
 * [KR] 밥솥 전력 전사 데이터 모델, 컨트롤러, UI 프레젠테이션 계약을 검증하는 단위 테스트입니다.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const mocks = vi.hoisted(() => ({
  useApp: vi.fn(),
}));

vi.mock("@/lib/data/useApp", () => ({ useApp: mocks.useApp }));

import { classifyPowerState } from "@/lib/power/power-transcription-model";
import { PowerTranscriptionSection } from "@/components/power/PowerTranscriptionSection";

describe("Power State Classifier [KR: 전력 상태 임계치 분류 엔진]", () => {
  it("correctly identifies cooking, warming, and standby bands", () => {
    expect(classifyPowerState(845).state).toBe("COOKING");
    expect(classifyPowerState(700).state).toBe("COOKING");
    expect(classifyPowerState(38).state).toBe("WARMING");
    expect(classifyPowerState(25).state).toBe("WARMING");
    expect(classifyPowerState(1.2).state).toBe("STANDBY");
    expect(classifyPowerState(0).state).toBe("OFF");
  });
});

describe("PowerTranscriptionSection Presentation Contract [KR: 뷰 렌더링 및 점진적 공개 계약]", () => {
  beforeEach(() => {
    mocks.useApp.mockReset().mockReturnValue({
      view: {
        plug: {
          deviceId: "demo-rice-cooker-plug",
          online: true,
          lastReadingAt: "2026-11-18T16:28:00+09:00",
        },
      },
    });
  });

  it("renders non-cluttered compact card by default with progressive toggle [KR: 기본 상태는 깔끔한 요약 뱃지와 토글만 노출]", () => {
    const html = renderToStaticMarkup(createElement(PowerTranscriptionSection));
    expect(html).toContain("밥솥 전력 데이터 &amp; AI 해석 과정");
    expect(html).toContain("해석 신뢰도 99.4%");
    expect(html).toContain("845 W (취사 중)");
    expect(html).toContain("1.25 kWh");
    expect(html).toContain("우리 집 밥솥 플러그");
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("상세 전력 전사 데이터 &amp; AI 해석 과정 보기");
    // [EN] Ensures detailed internal tabs remain hidden when collapsed to prevent user overwhelm
    // [KR] 접힘 상태에서는 세부 탭이 렌더링되지 않아 유저가 번잡하지 않도록 보장
    expect(html).not.toContain("🔍 AI 해석 프로토콜");
  });
});
