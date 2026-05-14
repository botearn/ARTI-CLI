import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("browser login flow", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("builds the official web login url with callback and state", async () => {
    const { buildBrowserLoginUrl } = await import("../src/browser-login.js");
    const url = new URL(buildBrowserLoginUrl(
      "https://www.artifin.ai/auth",
      "http://127.0.0.1:43123/cli-auth/callback",
      "state-123",
    ));

    expect(url.origin + url.pathname).toBe("https://www.artifin.ai/auth");
    expect(url.searchParams.get("cli")).toBe("1");
    expect(url.searchParams.get("callback_url")).toBe("http://127.0.0.1:43123/cli-auth/callback");
    expect(url.searchParams.get("state")).toBe("state-123");
  });

  it("persists the callback payload after the browser login completes", async () => {
    let currentConfig = {
      api: { baseUrl: "https://wklskhbrjnyppqfmxhxa.supabase.co/functions/v1", timeout: 30000 },
      backend: { enabled: true, url: "", timeout: 60000 },
      auth: {
        token: "",
        refreshToken: "",
        expiresAt: null,
        userId: "",
        email: "",
        supabaseUrl: "https://wklskhbrjnyppqfmxhxa.supabase.co",
        publishableKey: "sb_publishable_5SIVwCD2q2QjtijkX8zn5Q_NSiocgl5",
      },
      data: {
        provider: "hybrid" as const,
        artiDataBaseUrl: "",
        artiDataTimeout: 15000,
        artiDataInternalKey: "",
      },
      display: { market: "US" as const, lang: "zh" as const },
      watchlist: [],
    };

    vi.doMock("../src/config.js", () => ({
      loadConfig: () => currentConfig,
      saveConfig: (next: typeof currentConfig) => {
        currentConfig = next;
      },
      deriveSupabaseUrlFromApiBase: vi.fn(() => "https://wklskhbrjnyppqfmxhxa.supabase.co"),
      getDefaultSupabaseUrl: vi.fn(() => "https://wklskhbrjnyppqfmxhxa.supabase.co"),
      getDefaultSupabasePublishableKey: vi.fn(() => "sb_publishable_5SIVwCD2q2QjtijkX8zn5Q_NSiocgl5"),
    }));

    const { completeBrowserLogin } = await import("../src/browser-login.js");
    const auth = completeBrowserLogin({
      access_token: "eyJhbGciOiJIUzI1NiJ9.eyJleHAiOjQxMDAwMDAwMDAsInN1YiI6InVzZXItMSIsImVtYWlsIjoiY2xpQGFydGlmaW4uYWkifQ.sig",
      refresh_token: "refresh-123",
      expires_at: 4100000000,
      user_id: "user-1",
      email: "cli@artifin.ai",
      state: "state-123",
    }, "state-123");

    expect(auth.userId).toBe("user-1");
    expect(auth.email).toBe("cli@artifin.ai");
    expect(auth.refreshToken).toBe("refresh-123");
    expect(currentConfig.auth.token).toContain("eyJhbGciOiJIUzI1NiJ9");
    expect(currentConfig.auth.expiresAt).toBe(4100000000);
  });
});
