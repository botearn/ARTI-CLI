import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("config legacy API migration", () => {
  let tempHome: string | null = null;

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    if (tempHome && existsSync(tempHome)) {
      rmSync(tempHome, { recursive: true, force: true });
    }
    tempHome = null;
  });

  it("migrates the legacy Supabase Edge default to the unified project", async () => {
    tempHome = mkdtempSync(join(tmpdir(), "arti-config-"));
    vi.stubEnv("HOME", tempHome);

    const configDir = join(tempHome, ".config", "arti");
    const configFile = join(configDir, "config.json");
    mkdirSync(configDir, { recursive: true });

    writeFileSync(configFile, JSON.stringify({
      api: {
        baseUrl: "https://laoclhqedllwjuboyqib.supabase.co/functions/v1",
        timeout: 30000,
      },
      backend: {
        enabled: true,
        url: "https://api-gateway-production-b656.up.railway.app",
        timeout: 60000,
      },
      auth: {
        token: "",
        refreshToken: "",
        expiresAt: null,
        userId: "",
        email: "",
        supabaseUrl: "",
        publishableKey: "",
      },
      data: {
        provider: "hybrid",
        artiDataBaseUrl: "",
        artiDataTimeout: 15000,
        artiDataInternalKey: "",
      },
      display: {
        market: "US",
        lang: "zh",
      },
      watchlist: [],
    }, null, 2));

    const { loadConfig } = await import("../src/config.js");
    const config = loadConfig();

    expect(config.api.baseUrl).toBe("https://wklskhbrjnyppqfmxhxa.supabase.co/functions/v1");
    expect(config.auth.refreshToken).toBe("");
    expect(config.auth.expiresAt).toBeNull();
    expect(config.auth.supabaseUrl).toBe("https://wklskhbrjnyppqfmxhxa.supabase.co");
    expect(config.auth.publishableKey).toBe("sb_publishable_5SIVwCD2q2QjtijkX8zn5Q_NSiocgl5");

    const persisted = JSON.parse(readFileSync(configFile, "utf-8"));
    expect(persisted.api.baseUrl).toBe("https://wklskhbrjnyppqfmxhxa.supabase.co/functions/v1");
    expect(persisted.auth.publishableKey).toBe("sb_publishable_5SIVwCD2q2QjtijkX8zn5Q_NSiocgl5");
  });
});
