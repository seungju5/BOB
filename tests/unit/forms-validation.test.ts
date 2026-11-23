import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { changeMealWindow, MealWindowsEditor, mealWindowProblems, windowsValid } from "@/components/forms";
import { FOUR_MEAL_WINDOWS, mealSlotsForCount } from "@/lib/data/view";
import { deviceReadingLabel, seniorDetailsProblems } from "@/components/onboarding/settings-validation";
import { completeTutorial } from "@/components/onboarding/tutorial-flow";

describe("independent meal time editing", () => {
  it("preserves all other meal drafts when one time becomes overlapping", () => {
    const before = structuredClone(FOUR_MEAL_WINDOWS);
    const next = changeMealWindow(before, 0, "end", "12:00");
    expect(next.slice(1)).toEqual(before.slice(1));
    expect(before).toEqual(FOUR_MEAL_WINDOWS);
    expect(windowsValid(next)).toBe(false);
    expect(mealWindowProblems(next)[1]).toContain("12:00");
    expect(mealWindowProblems(next)[1]).toContain("첫 끼");
  });

  it("allows clearing a field without restoring the old input or changing another meal", () => {
    const next = changeMealWindow(FOUR_MEAL_WINDOWS, 3, "start", "");
    expect(next[3].start).toBe("");
    expect(next.slice(0, 3)).toEqual(FOUR_MEAL_WINDOWS.slice(0, 3));
    expect(windowsValid(next)).toBe(false);
    expect(mealWindowProblems(next)[3]).toContain("모두 입력");
  });

  it.each(["24:00", "09:60", "9:00", "not-a-time"])("rejects malformed time %s", (time) => {
    expect(windowsValid(changeMealWindow(FOUR_MEAL_WINDOWS, 0, "start", time))).toBe(false);
  });

  it("accepts adjacent independent windows and rejects an overnight range", () => {
    expect(windowsValid(FOUR_MEAL_WINDOWS)).toBe(true);
    expect(windowsValid(changeMealWindow(FOUR_MEAL_WINDOWS, 3, "end", "01:00"))).toBe(false);
    expect(windowsValid([])).toBe(false);
  });

  it.each([1, 2, 3, 4])("labels %s meal inputs by displayed order and keeps an accessible time label", (count) => {
    const windows = mealSlotsForCount(count).map((slot) => FOUR_MEAL_WINDOWS.find((window) => window.slot === slot)!);
    const html = renderToStaticMarkup(createElement(MealWindowsEditor, { windows, onChange: () => {} }));
    expect((html.match(/type="time"/g) ?? []).length).toBe(count * 2);
    expect(html).toContain('aria-label="첫 끼 시작 시간"');
    expect(html).toContain('aria-describedby=');
    expect(html).toContain("다른 끼니 시간은 바뀌지 않아요");
    if (count === 4) expect(html).toContain('aria-label="네 끼 끝 시간"');
  });
});

describe("settings input and truthful device timing", () => {
  it("requires one relation and representative name while leaving a phone optional", () => {
    expect(seniorDetailsProblems({ relation: "", name: " ", phone: "" })).toMatchObject({ relation: expect.any(String), name: expect.any(String), phone: null });
    expect(seniorDetailsProblems({ relation: "부모님", name: "정숙", phone: "" })).toEqual({ relation: null, name: null, phone: null });
  });
  it.each(["010-1234-5678", "+82 (10) 1234 5678"])("accepts formatted phone %s without needing a device", (phone) => {
    expect(seniorDetailsProblems({ relation: "어머니", name: "정숙", phone }).phone).toBeNull();
  });
  it("rejects a partial or nonnumeric phone and keeps that error local to the phone", () => {
    expect(seniorDetailsProblems({ relation: "어머니", name: "정숙", phone: "010-ABC" })).toEqual({ relation: null, name: null, phone: expect.any(String) });
  });
  it.each(["name", "relation"] as const)("allows 30 characters and rejects 31 for %s", (field) => {
    const senior = { relation: "어머니", name: "정숙", phone: "" };
    expect(seniorDetailsProblems({ ...senior, [field]: "가".repeat(30) })[field]).toBeNull();
    expect(seniorDetailsProblems({ ...senior, [field]: "가".repeat(31) })[field]).not.toBeNull();
  });
  it("accepts a 24-character formatted phone and rejects a 25-character phone", () => {
    const senior = { relation: "어머니", name: "정숙", phone: "+82 (10) 1234-5678" };
    const phone24 = "+" + "1234567" + "-".repeat(16);
    expect(phone24).toHaveLength(24);
    expect(seniorDetailsProblems({ ...senior, phone: phone24 }).phone).toBeNull();
    expect(seniorDetailsProblems({ ...senior, phone: phone24 + "-" }).phone).not.toBeNull();
  });
  it.each(["++821012345678", "82+1012345678", "010\t1234-5678", "123456", "1234567890123456"])("rejects a phone outside the canonical contract: %s", (phone) => {
    expect(seniorDetailsProblems({ relation: "어머니", name: "정숙", phone }).phone).not.toBeNull();
  });
  it("uses the received timestamp in KST and never substitutes a current date", () => {
    expect(deviceReadingLabel("2026-11-13T23:10:00Z")).toBe("2026-11-14 08:10 (한국 시간·KST)");
    expect(deviceReadingLabel(null)).toBe("아직 수신한 기록이 없어요.");
    expect(deviceReadingLabel("invalid")).toBe("아직 수신한 기록이 없어요.");
  });
});

describe("tutorial completion persistence", () => {
  it("waits for a successful save before allowing household navigation", async () => {
    let resolveSave: (() => void) | undefined;
    const saveOnboarding = vi.fn(() => new Promise<void>((resolve) => { resolveSave = resolve; }));
    let destination: string | undefined;
    const finishing = completeTutorial(1, { saveOnboarding }).then((next) => { destination = next; });
    await Promise.resolve();
    expect(destination).toBeUndefined();
    expect(saveOnboarding).toHaveBeenCalledWith(3, {});
    resolveSave!(); await finishing;
    expect(destination).toBe("/onboarding");
  });
  it("does not return a destination after a failed save", async () => {
    await expect(completeTutorial(1, { saveOnboarding: vi.fn().mockRejectedValue(new Error("offline")) })).rejects.toThrow("offline");
  });
  it.each([3, 4, 5, 6, 7, 8])("replaying at saved step %s does not rewind any account data", async (step) => {
    const saveOnboarding = vi.fn();
    expect(await completeTutorial(step, { saveOnboarding })).toBe(step === 8 ? "/home" : "/onboarding");
    expect(saveOnboarding).not.toHaveBeenCalled();
  });
});
