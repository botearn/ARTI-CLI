import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("Credits 启动校验错误", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("保留后端 401 状态供 banner 判断登录失效", async () => {
    vi.doMock("../src/auth.js", () => ({
      ensureValidAccessToken: vi.fn().mockResolvedValue("expired-token"),
      getAuthState: vi.fn(() => ({
        token: "expired-token",
        refreshToken: "refresh-token",
        expiresAt: 4_100_000_000,
        userId: "user-1",
        email: "u@example.com",
        supabaseUrl: "https://proj.supabase.co",
        publishableKey: "sb_publishable_test",
      })),
    }));
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      "authorization failed",
      { status: 401 },
    )));

    const { getActiveBillingState } = await import("../src/billing.js");
    const { isAuthenticationError } = await import("../src/errors.js");
    const error = await getActiveBillingState().catch(err => err);

    expect(isAuthenticationError(error)).toBe(true);
  });
});
