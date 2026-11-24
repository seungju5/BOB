import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { assertOnboardingConsent } from "@/lib/data/consent";
import { defaultPreferences, preferencesPatch } from "@/lib/data/firebase";
import type { OnboardingPatch } from "@/lib/data/view";
import PrivacyPage from "@/app/privacy/page";
import { HealthConnectionPage } from "@/components/senior/HealthConnectionPage";
import { HealthInstallGuide } from "@/components/senior/HealthInstallGuide";
import { PRIVACY_SUPPORT_EMAIL } from "@/lib/privacy/notice";

const current = { onboardingStep: 3, seniorConsent: false };
describe("required senior preparation consent", () => {
  it.each([4, 5, 6, 7, 8])("blocks step %s even if the UI handler is bypassed", step => {
    expect(() => assertOnboardingConsent(current, step, {})).toThrow("동의를 확인");
  });
  it.each<OnboardingPatch>([
    { senior: { name: "가상 이름", relation: "어머니", phone: "" } },
    { household: { residentCount: 2, hasPet: true } },
  ])("does not save personal information at an earlier step without consent: %j", patch => {
    expect(() => preferencesPatch({ settings: null, household: null }, 3, patch)).toThrow("동의를 확인");
  });
  it("allows tutorial progress before collecting household information", () => {
    expect(preferencesPatch({ settings: null, household: null }, 3, {}).settings.preparationAcknowledged).toBe(false);
  });
  it("withdraws an existing confirmation without deleting unrelated settings or authorizing new data", () => {
    const saved = { settings: { ...defaultPreferences(), onboardingStep: 8, preparationAcknowledged: true, phone: "010-0000-0000" }, household: null };
    const revoked = preferencesPatch(saved, 8, { seniorConsent: false });
    expect(revoked.settings).toMatchObject({ onboardingStep: 8, preparationAcknowledged: false, phone: "010-0000-0000" });
    expect(revoked.household).toBeNull();
    expect(() => preferencesPatch(saved, 8, { seniorConsent: false, senior: { name: "가상 이름", relation: "어머니", phone: "" } })).toThrow("동의를 확인");
    expect(() => preferencesPatch({ ...saved, settings: revoked.settings }, 8, { household: { residentCount: 2, hasPet: true } })).toThrow("동의를 확인");
  });
  it("accepts an explicit new confirmation without requesting a device connection", () => {
    const result = preferencesPatch({ settings: null, household: null }, 4, { seniorConsent: true, senior: { name: "가상 이름", relation: "어머니", phone: "" } });
    expect(result.settings.preparationAcknowledged).toBe(true);
    expect(result.household?.alias).toBe("가상 이름");
  });
});

describe("public privacy and honest device availability", () => {
  it("renders without a session and uses the configured support address", () => {
    const html = renderToStaticMarkup(createElement(PrivacyPage));
    expect(html).toContain(`mailto:${PRIVACY_SUPPORT_EMAIL}`);
    expect(html).toContain("로그인 없이 앱 안에서");
    expect(html).toContain("보관 기간이 확정되면");
    expect(html).not.toMatch(/notion\.com|target="_blank"/);
  });
  it("does not offer an unshipped iPhone binary or deep link from the web", () => {
    const html = renderToStaticMarkup(createElement(HealthConnectionPage));
    expect(html).toContain("아이폰에서 웹 테스트하기");
    expect(html).not.toContain("설치한 밥뭇나 열기");
    expect(html).not.toMatch(/bapmunna:\/\/|intent:\/\/|\.apk/);
    expect(html).not.toContain("기록이 보이지 않을 때");
  });
  it("links Android users to the team walking guide", () => {
    const html = renderToStaticMarkup(createElement(HealthInstallGuide, { phone: "android" }));
    expect(html).toContain("https://bob-tmdwn1.vercel.app/health/");
    expect(html).not.toMatch(/\.apk|download=/);
    expect(html).not.toContain("아이폰에서 웹 테스트하기");
  });
});
