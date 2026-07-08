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

  it("uses configured Poly base URL and X-API-Key", async () => {
    tempHome = mkdtempSync(join(tmpdir(), "arti-poly-api-"));
    vi.stubEnv("HOME", tempHome);
    vi.stubEnv("ARTI_POLY_API_URL", "https://example.test/api/v1");
    vi.stubEnv("ARTI_POLY_API_KEY", "poly_test_key");

    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: [{ slug: "event-1" }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { polyGet } = await import("../src/poly/api.js");
    await expect(polyGet("events?limit=1")).resolves.toEqual({ data: [{ slug: "event-1" }] });

    expect(fetchMock).toHaveBeenCalledWith("https://example.test/api/v1/events?limit=1", {
      headers: { "X-API-Key": "poly_test_key" },
    });
  });

  it("surfaces ARTi-poly error bodies", async () => {
    tempHome = mkdtempSync(join(tmpdir(), "arti-poly-api-"));
    vi.stubEnv("HOME", tempHome);
    vi.stubEnv("ARTI_POLY_API_KEY", "poly_test_key");

    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      error: { code: "blocked_api_key", message: "API key is blocked" },
    }), { status: 403, statusText: "Forbidden" })));

    const { polyGet, PolyApiError } = await import("../src/poly/api.js");
    await expect(polyGet("events")).rejects.toMatchObject({
      name: "PolyApiError",
      status: 403,
      code: "blocked_api_key",
      message: "Poly API 403: API key is blocked",
    });
    await expect(polyGet("events")).rejects.toBeInstanceOf(PolyApiError);
  });

  it("requires a Poly API Key", async () => {
    tempHome = mkdtempSync(join(tmpdir(), "arti-poly-api-"));
    vi.stubEnv("HOME", tempHome);

    const { polyGet } = await import("../src/poly/api.js");
    await expect(polyGet("events")).rejects.toThrow("未设置 Poly API Key");
  });
});
