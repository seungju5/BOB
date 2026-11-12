import { describe, expect, it, vi } from "vitest";
import { verifyCallback } from "@/lib/auth/verifyCallback";

describe("OAuth·이메일 콜백", () => {
  it("코드 교환과 서버 사용자 확인이 모두 성공해야 이메일을 돌려준다", async () => {
    const auth = {
      exchangeCodeForSession: vi.fn().mockResolvedValue({ error: null }),
      getUser: vi.fn().mockResolvedValue({ data: { user: { email: "care@example.test" } }, error: null }),
    };
    await expect(verifyCallback("one-time-code", auth)).resolves.toBe("care@example.test");
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith("one-time-code");
    expect(auth.getUser).toHaveBeenCalledOnce();
  });

  it("코드 교환 실패 때 사용자 확인을 건너뛴다", async () => {
    const auth = {
      exchangeCodeForSession: vi.fn().mockResolvedValue({ error: new Error("expired") }),
      getUser: vi.fn(),
    };
    await expect(verifyCallback("used-code", auth)).rejects.toThrow("expired");
    expect(auth.getUser).not.toHaveBeenCalled();
  });

  it("세션 교환 후 사용자 확인이 실패하면 로그인으로 인정하지 않는다", async () => {
    const auth = {
      exchangeCodeForSession: vi.fn().mockResolvedValue({ error: null }),
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    };
    await expect(verifyCallback("one-time-code", auth)).rejects.toThrow("사용자 정보가 없습니다");
  });

  it("카카오 계정이 이메일을 제공하지 않아도 검증된 사용자를 허용한다", async () => {
    const auth = {
      exchangeCodeForSession: vi.fn().mockResolvedValue({ error: null }),
      getUser: vi.fn().mockResolvedValue({ data: { user: {} }, error: null }),
    };
    await expect(verifyCallback("one-time-code", auth)).resolves.toBeNull();
  });
});
