import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {beforeEach, expect, it, vi} from "vitest";
import AccountPage from "@/app/account/page";

const f = vi.hoisted(() => ({mode:vi.fn(), account:vi.fn()}));
vi.mock("@/lib/data/mode", () => ({useMode:f.mode}));
vi.mock("@/lib/data/firebase", () => ({useFirebaseAccount:f.account, refreshFirebaseAccount:vi.fn(), renameFirebaseProfile:vi.fn()}));
const user = {uid:"test-owner", verified:true, email:"guardian@example.test"};
const profile = {ownerUid:user.uid,displayName:"검사 보호자",consentVersion:"2026-10-16",savedAt:"2026-11-22T02:15:00Z",revision:"10:17"};
const saved = {household:null,settings:null,savedAt:{household:null,settings:null}};
const state = {user,profile,saved,revision:3,loading:false,error:null,view:{onboardingStep:3}};
const page = () => renderToStaticMarkup(createElement(AccountPage));
beforeEach(() => { f.mode.mockReset().mockReturnValue("live"); f.account.mockReset().mockReturnValue(state); });
it("shows server-confirmed profile time and leaves missing household and settings empty",()=>{
  const html = page();
  expect(html).toContain(profile.displayName);
  expect(html).toContain('dateTime="2026-11-22T02:15:00Z"');
  expect(html).toContain("보호자 이름 수정");
  expect(html).toContain("아직 저장한 가구 정보가 없어요");
  expect(html).toContain("아직 저장한 생활·알림 설정이 없어요");
  expect(html).not.toContain("끼니 시간대");
});
it("keeps an old in-memory account invisible in demo, signed-out, loading, and other-owner sessions",()=>{
  for (const mode of ["demo",null,undefined]) {
    f.mode.mockReturnValue(mode); expect(page()).not.toContain(user.email);
    expect(f.account).toHaveBeenLastCalledWith(false);
  }
  f.mode.mockReturnValue("live");
  for (const invalid of [{user:null}, {loading:true}, {user:{...user,verified:false}}, {profile:{...profile,ownerUid:"different"}}, {error:"서버 조회 실패"}]) {
    f.account.mockReturnValue({...state,...invalid});
    const html=page(); expect(html).not.toContain(user.email); expect(html).not.toContain(profile.displayName);
  }
});
it("lists only persisted household details and keeps the stored phone number out of the account summary",()=>{
  f.account.mockReturnValue({...state,saved:{household:{alias:"테스트 가구",residentCount:2,hasPet:false},settings:{windows:[{}],missedMealsThreshold:2,phone:"010-0000-0000",onboardingStep:8},savedAt:{household:profile.savedAt,settings:profile.savedAt}}});
  const html=page();
  expect(html).toContain("테스트 가구");expect(html).toContain("대표 연락처 등록됨");expect(html).not.toContain("010-0000-0000");
});
