import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { PowerTranscriptionSection } from "@/components/power/PowerTranscriptionSection";
import { PowerSampleFigure } from "@/components/power/PowerSampleFigure";
import { demoPowerTranscript } from "@/lib/power/power-transcription-model";

it("only builds the synthetic dataset for an actual demo view", () => {
  expect(demoPowerTranscript(null)).toBeNull();
  expect(demoPowerTranscript({ mode: "live", dataSource: "supabase" })).toBeNull();
  expect(demoPowerTranscript({ mode: "demo", dataSource: "supabase" })).toBeNull();
  const fixture = demoPowerTranscript({ mode: "demo", dataSource: "demo" })!;
  expect(fixture.interpretation.minimumCookWatts).toBe(700);
  expect(fixture.interpretation.checkIntervalMinutes).toBe(10);
  expect(fixture.interpretation.events.filter(e => e.type === "cook")).toHaveLength(2);
  expect(renderToStaticMarkup(createElement(PowerTranscriptionSection, { transcript: fixture }))).toContain("예시");
  const figure = renderToStaticMarkup(createElement(PowerSampleFigure, { transcript: fixture }));
  expect(figure).toContain("<table");
  expect(figure).toContain("700");
  expect(figure).toContain("07:40");
});
