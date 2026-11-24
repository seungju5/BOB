import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

// Execute the actual route components. Only hooks, router and the external SDK are simulated.
type Element = { type: string; props: Record<string, unknown> };
function elements(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(elements);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const element = value as Element;
  return [element, ...elements(element.props.children)];
}
function render(file: string, dependencies: Record<string, unknown>, globals: Record<string, unknown>) {
  const source = readFileSync(new URL("../../" + file,import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {compilerOptions: { module: ts.ModuleKind.CommonJS, target:ts.ScriptTarget.ES2022, jsx:ts.JsxEmit.ReactJSX }}).outputText;
  const exports: { default?: () => Element } = {};
  const jsx = (type: string, props: Record<string, unknown>) => ({type,props});
  const modules: Record<string,unknown> = {
    react: {
      useState: (initial: unknown) => [initial,vi.fn()], useEffect: (run: () => void) => run(),
      useSyncExternalStore: (_: unknown, read: () => unknown) => read(),
    },
    "react/jsx-runtime": { jsx,jsxs:jsx,Fragment:"Fragment" },
    ...dependencies,
  };
  runInNewContext(compiled, {exports,URLSearchParams,AbortController,...globals,require:(id:string)=>{
    if (!(id in modules)) throw new Error("Unexpected dependency: " + id);
    return modules[id];
  }});
  return exports.default!();
}

describe("Supabase app's bookmarked Kakao route", () => {
  it.each([
    ["?code=test-code&redirect=https%3A%2F%2Fother.invalid", "/auth/callback?code=test-code"],
    ["?error=access_denied&error_description=details", "/auth/callback?error=access_denied"],
    ["?error_code=unexpected", "/auth/callback?error=configuration"],
    ["?next=//other.invalid", "/login"],
  ])("sends approved fields to a local route and disables the Firebase observer", async (search,expected) => {
    const replace = vi.fn(); const history = {replaceState:vi.fn()};
    const observer = vi.fn(() => ({user:null,loading:false,view:null}));
    const firebase = vi.fn();
    render("app/auth/kakao/page.tsx", {
      "next/navigation": {useRouter:()=>({replace})}, "next/link":"Link",
      "@/components/Mascot":{Logo:"Logo",Mascot:"Mascot"},
      "@/lib/firebase/bridge":{usesImpactFirebase:false,connectFirebase:firebase},
      "@/lib/data/firebase":{useFirebaseAccount:observer}, "@/lib/data/mode":{setMode:vi.fn()},
    },{window:{location:{search,pathname:"/auth/kakao",hash:"#old_private_handoff"},history}});
    await Promise.resolve();
    expect(observer).toHaveBeenCalledWith(false);
    expect(firebase).not.toHaveBeenCalled();
    expect(history.replaceState).toHaveBeenCalledWith(null,"","/auth/kakao");
    expect(replace).toHaveBeenCalledWith(expected);
  });
});

describe("login with a missing team public key", () => {
  it("shows readiness and opens the working demo without calling the Auth SDK", () => {
    const push = vi.fn(), setMode = vi.fn(), sdk=vi.fn();
    const root = render("components/auth/SupabaseLogin.tsx", {
      "next/navigation":{useRouter:()=>({push,replace:vi.fn()})},
      "@/lib/supabase/login-return":{}, "@/lib/supabase/studio":{}, "@/components/forms":{TextInput:"TextInput"},
      "@/components/icons":{IconCheck:"IconCheck"}, "@/components/Mascot":{Mascot:"Mascot"},
      "@/components/privacy/PrivacyNotice":{PrivacyNotice:"Privacy"}, "@/components/ui":{Button:"Button",PageHeader:"Header"},
      "@/components/SocialLogin":{SocialLogin:"Social"}, "@/lib/data/accounts":{useRecentAccounts:()=>[]},
      "@/lib/data/mode":{setMode,useSession:()=>null}, "@/lib/supabase":{supabase:sdk,supabaseConfigured:false},
    },{location:{search:""}});
    expect(JSON.stringify(root)).toContain("팀 서버의 로그인 설정");
    const demo = elements(root).find(n => n.type==="Button" && n.props.children==="로그인 없이 데모로 둘러보기");
    expect(demo).toBeDefined();
    (demo!.props.onClick as () => void)();
    expect(setMode).toHaveBeenCalledWith("demo"); expect(push).toHaveBeenCalledWith("/start");
    expect(sdk).not.toHaveBeenCalled();
  });
});
