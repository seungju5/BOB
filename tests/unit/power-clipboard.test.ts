import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { PowerTranscriptionSection } from "@/components/power/PowerTranscriptionSection";
import { demoPowerTranscript } from "@/lib/power/power-transcription-model";

const updated = vi.hoisted(() => vi.fn());
// Exercise the expanded JSON tab with both outcomes of the browser clipboard API.
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useId: () => "transcript",
  useState: (initial: unknown) => [initial === false ? true : initial === "input" ? "json" : initial, updated],
}));
type Element = ReactElement<{children?:ReactNode; onClick?:() => Promise<void>}>;
function elements(node: ReactNode): Element[] {
  return Children.toArray(node).flatMap(child =>
    isValidElement<Element["props"]>(child) ? [child, ...elements(child.props.children)] : []
  );
}
function jsonTab() {
  const transcript = demoPowerTranscript({mode:"demo",dataSource:"demo"})!;
  const rendered = elements(PowerTranscriptionSection({transcript}));
  const preview = rendered.find(el => el.type === "pre")!.props.children as string;
  const copy = rendered.find(el => el.type === "button" && el.props.children === "예시 JSON 복사")!.props.onClick!;
  return {preview,copy};
}
afterEach(() => { vi.unstubAllGlobals(); updated.mockClear(); });

it("copies exactly the displayed JSON including the synthetic source and computed result", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", {clipboard:{writeText}});
  const {preview,copy} = jsonTab();
  await copy();
  expect(writeText.mock.calls).toEqual([[preview]]);
  expect(JSON.parse(preview)).toMatchObject({source:"demo",dataOrigin:"SYNTHETIC_NOT_HOUSEHOLD_DATA",interpretation:{minimumCookSamples:1}});
  expect(JSON.parse(preview).interpretation.events).toHaveLength(2);
  expect(updated).toHaveBeenLastCalledWith("출처를 포함한 예시 JSON을 복사했어요.");
});
it.each([undefined, {writeText:vi.fn().mockRejectedValue(new Error("denied"))}])("keeps the preview available when clipboard access fails", async clipboard => {
  vi.stubGlobal("navigator", {clipboard});
  const {preview,copy} = jsonTab();
  await copy();
  expect(JSON.parse(preview).samples).toHaveLength(9);
  expect(updated).toHaveBeenLastCalledWith(expect.stringContaining("직접 선택해 복사"));
});
