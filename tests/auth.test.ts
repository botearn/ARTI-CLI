import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("auth session behavior", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("rejects expired token-only sessions for server-backed commands", async () => {
    vi.doMock("../src/config.js", () => ({
      loadConfig: () => ({
        api: { baseUrl: "https://wklskhbrjnyppqfmxhxa.supabase.co/functions/v1", timeout: 1000 },
        backend: { enabled: true, url: "https://backend.example.com", timeout: 1000 },
        auth: {
          token: "eyJhbGciOiJIUzI1NiJ9.eyJleHAiOjEsInN1YiI6InUxIiwiZW1haWwiOiJ1QGV4YW1wbGUuY29tIn0.sig",
          refreshToken: "",
          expiresAt: 1,
          userId: "u1",
          email: "u@example.com",
          supabaseUrl: "https://wklskhbrjnyppqfmxhxa.supabase.co",
          publishableKey: "sb_publishable_test",
        },
        data: {
          provider: "hybrid",
          artiDataBaseUrl: "",
          artiDataTimeout: 15000,
          artiDataInternalKey: "",
        },
        display: { market: "US", lang: "zh" },
        watchlist: [],
      }),
      saveConfig: vi.fn(),
      deriveSupabaseUrlFromApiBase: vi.fn(() => "https://wklskhbrjnyppqfmxhxa.supabase.co"),
      getDefaultSupabaseUrl: vi.fn(() => "https://wklskhbrjnyppqfmxhxa.supabase.co"),
    }));

    const { getActiveBillingState } = await import("../src/billing.js");
    await expect(getActiveBillingState()).rejects.toThrow(/重新登录|refresh token/);
  });
});
