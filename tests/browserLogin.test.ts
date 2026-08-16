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
      "session-123",
      "A7K9X2",
    ));

    expect(url.origin + url.pathname).toBe("https://www.artifin.ai/auth");
    expect(url.searchParams.get("cli")).toBe("1");
    expect(url.searchParams.get("session_id")).toBe("session-123");
    expect(url.searchParams.get("device_code")).toBe("A7K9X2");
  });

  it("keeps a dev auth session on the dev web origin", async () => {
    const { resolveWebAuthUrl } = await import("../src/browser-login.js");
    const resolved = resolveWebAuthUrl({
      serverUrl: "https://www.artifin.ai/auth",
      supabaseUrl: "https://laoclhqedllwjuboyqib.supabase.co",
      config: {
        api: { baseUrl: "https://laoclhqedllwjuboyqib.supabase.co/functions/v1", timeout: 30000 },
        backend: { enabled: true, url: "https://api-gateway-dev-dev.up.railway.app", timeout: 60000, mcpUrl: "", mcpEnabled: false, mcpTimeout: 10000, mcpFailureCooldown: 60000 },
        auth: { token: "", refreshToken: "", expiresAt: null, userId: "", email: "", supabaseUrl: "https://laoclhqedllwjuboyqib.supabase.co", publishableKey: "test" },
        data: { provider: "hybrid", artiDataBaseUrl: "", artiDataTimeout: 15000, artiDataInternalKey: "" },
        display: { market: "US", lang: "zh" },
        poly: { apiBaseUrl: "https://www.artifin.ai/app/predict/api/v1" },
        session: { retentionDays: 30 },
        watchlist: [],
      },
    });

    expect(resolved).toBe("https://dev.artifin.ai/cli/auth");
  });

  it("prefers an explicit web auth url", async () => {
    const { resolveWebAuthUrl } = await import("../src/browser-login.js");
    const resolved = resolveWebAuthUrl({
      requestedUrl: "https://preview.artifin.test/cli/auth",
      serverUrl: "https://www.artifin.ai/auth",
      supabaseUrl: "https://laoclhqedllwjuboyqib.supabase.co",
      config: {
        api: { baseUrl: "https://example.test/functions/v1", timeout: 30000 },
        backend: { enabled: true, url: "https://example.test", timeout: 60000, mcpUrl: "", mcpEnabled: false, mcpTimeout: 10000, mcpFailureCooldown: 60000 },
        auth: { token: "", refreshToken: "", expiresAt: null, userId: "", email: "", supabaseUrl: "https://example.test", publishableKey: "test" },
        data: { provider: "hybrid", artiDataBaseUrl: "", artiDataTimeout: 15000, artiDataInternalKey: "" },
        display: { market: "US", lang: "zh" },
        poly: { apiBaseUrl: "https://www.artifin.ai/app/predict/api/v1" },
        session: { retentionDays: 30 },
        watchlist: [],
      },
    });

    expect(resolved).toBe("https://preview.artifin.test/cli/auth");
  });

  it("polls the server-side login session and persists the approved session", async () => {
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

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        session_id: "session-123",
        code: "A7K9X2",
        poll_token: "poll-secret",
        login_url: "https://www.artifin.ai/auth?cli=1&session_id=session-123&code=A7K9X2",
        poll_interval_ms: 1,
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        status: "approved",
        session: {
          access_token: "eyJhbGciOiJIUzI1NiJ9.eyJleHAiOjQxMDAwMDAwMDAsInN1YiI6InVzZXItMSIsImVtYWlsIjoiY2xpQGFydGlmaW4uYWkifQ.sig",
          refresh_token: "refresh-123",
          expires_at: 4100000000,
          user: {
            id: "user-1",
            email: "cli@artifin.ai",
          },
        },
      }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { loginWithBrowser } = await import("../src/browser-login.js");
    const auth = await loginWithBrowser({
      onOpenUrl: vi.fn(),
    });

    expect(auth.userId).toBe("user-1");
    expect(auth.email).toBe("cli@artifin.ai");
    expect(auth.refreshToken).toBe("refresh-123");
    expect(currentConfig.auth.token).toContain("eyJhbGciOiJIUzI1NiJ9");
    expect(currentConfig.auth.expiresAt).toBe(4100000000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0].toString()).toContain("poll_token=poll-secret");
  });
});
