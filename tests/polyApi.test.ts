import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("poly api", () => {
  let tempHome: string | null = null;

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
    if (tempHome && existsSync(tempHome)) {
      rmSync(tempHome, { recursive: true, force: true });
    }
    tempHome = null;
  });

  it("calls the poly-data Edge Function with existing login Bearer token", async () => {
    tempHome = mkdtempSync(join(tmpdir(), "arti-poly-api-"));
    vi.stubEnv("HOME", tempHome);
    vi.stubEnv("ARTI_API_URL", "https://example.test/functions/v1");
    vi.stubEnv("ARTI_AUTH_TOKEN", "login-token-123");
    vi.stubEnv("ARTI_AUTH_EXPIRES_AT", "4100000000");

    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      data: { data: [{ slug: "event-1" }] },
      meta: { requestId: "req-1" },
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { polyGet } = await import("../src/poly/api.js");
    await expect(polyGet("events?limit=1")).resolves.toEqual({ data: [{ slug: "event-1" }] });

    expect(fetchMock).toHaveBeenCalledWith("https://example.test/functions/v1/poly-data", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({
        "Content-Type": "application/json",
        Authorization: "Bearer login-token-123",
      }),
      body: JSON.stringify({ path: "events?limit=1" }),
    }));
  });

  it("requires arti login", async () => {
    tempHome = mkdtempSync(join(tmpdir(), "arti-poly-api-"));
    vi.stubEnv("HOME", tempHome);
    vi.stubEnv("ARTI_API_URL", "https://example.test/functions/v1");
    vi.stubEnv("ARTI_AUTH_TOKEN", "");
    vi.stubEnv("ARTI_AUTH_REFRESH_TOKEN", "");
    vi.stubEnv("ARTI_AUTH_EXPIRES_AT", "");

    const { polyGet } = await import("../src/poly/api.js");
    await expect(polyGet("events")).rejects.toThrow("未登录");
  });
});
