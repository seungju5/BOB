import { beforeEach, describe, expect, it, vi } from "vitest";
import { readOwnAccount, saveOwnName, type OwnAccount } from "@/lib/supabase/account";
import { studio } from "@/lib/supabase/studio";
const db = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: () => db, supabaseConfigured: true }));
const saved: OwnAccount = { legacy: false, households: [], profile: { name: "김보호", version: "v1", savedAt: null } };
beforeEach(() => { vi.resetAllMocks(); });

describe("Supabase household accounts", () => {
  it("saves for the signed-in uid with a revision and rereads the new name", async () => {
    db.rpc.mockResolvedValueOnce({data:null,error:null}).mockResolvedValueOnce({
      data:{households:[],profile:{name:"박보호",version:"v2",savedAt:null}},error:null,
    });
    await expect(saveOwnName("member", saved, " 박보호 ")).resolves.toMatchObject({profile:{name:"박보호"}});
    expect(db.rpc.mock.calls).toEqual([
      ["warming_save_name",{actor:"member",subject:"member",next_name:"박보호",expected_at:"v1"}],
      ["warming_account_summary",{actor:"member"}],
    ]);
  });
  it("does not claim success if the server returned a different value",async () => {
    db.rpc.mockResolvedValueOnce({data:null,error:null}).mockResolvedValueOnce({data:saved,error:null});
    await expect(saveOwnName("member", saved, "박보호")).rejects.toMatchObject({code:"40001"});
  });
  it("does not bypass an ordinary permission or network failure with a legacy read",async () => {
    db.rpc.mockResolvedValue({data:null,error:{code:"42501"}});
    await expect(readOwnAccount("member")).rejects.toMatchObject({code:"42501"});
    expect(db.from).not.toHaveBeenCalled();
  });
  it("handles an existing member against the original schema before migration 0006", async () => {
    db.rpc.mockResolvedValue({data:null,error:{code:"PGRST202"}});
    const predicates: Record<string,string[]> = {};
    db.from.mockImplementation((table:string)=>({ select: () => ({
      eq: (column:string,id:string) => {
        predicates[table]=[column,id];
        if(table==="profiles") return {maybeSingle:async()=>({data:{name:"보호자",created_at:"t1"},error:null})};
        return Promise.resolve({data:[],error:null});
      },
    }) }));
    await expect(readOwnAccount("member")).resolves.toEqual({
      legacy:true,profile:{name:"보호자",savedAt:null,version:"t1"},households:[],
    });
    expect(predicates).toEqual({profiles:["id","member"],household_guardians:["user_id","member"]});
  });
  it("checks an operator's identity again on every search, detail and edit RPC", async () => {
    db.rpc.mockResolvedValue({data:null,error:null});
    await studio.page("operator", "profiles", "example@example.invalid", {at:"fixture-time",id:"cursor"});
    await studio.detail("operator","subject");
    await studio.save("operator","subject",{type:"case",stage:"review",note:"메모",version:null});
    expect(db.rpc.mock.calls).toEqual([
      ["warming_studio_page",{actor:"operator",kind:"profiles",search_text:"example@example.invalid",after_at:"fixture-time",after_id:"cursor"}],
      ["warming_studio_detail",{actor:"operator",member_id:"subject"}],
      ["warming_studio_save_case",{actor:"operator",subject:"subject",next_stage:"review",next_note:"메모",expected_at:null}],
    ]);
  });
});
