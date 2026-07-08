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

  it("uses configured Poly base URL and existing login Bearer token", async () => {
    tempHome = mkdtempSync(join(tmpdir(), "arti-poly-api-"));
    vi.stubEnv("HOME", tempHome);
    vi.stubEnv("ARTI_POLY_API_URL", "https://example.test/api/v1");
    vi.stubEnv("ARTI_AUTH_TOKEN", "login-token-123");
    vi.stubEnv("ARTI_AUTH_EXPIRES_AT", "4100000000");

    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: [{ slug: "event-1" }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { polyGet } = await import("../src/poly/api.js");
    await expect(polyGet("events?limit=1")).resolves.toEqual({ data: [{ slug: "event-1" }] });

    expect(fetchMock).toHaveBeenCalledWith("https://example.test/api/v1/events?limit=1", {
      headers: { Authorization: "Bearer login-token-123" },
    });
  });

  it("surfaces ARTi-poly error bodies", async () => {
    tempHome = mkdtempSync(join(tmpdir(), "arti-poly-api-"));
    vi.stubEnv("HOME", tempHome);
    vi.stubEnv("ARTI_AUTH_TOKEN", "login-token-123");
    vi.stubEnv("ARTI_AUTH_EXPIRES_AT", "4100000000");

    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      error: { code: "unauthorized", message: "Login required" },
    }), { status: 401, statusText: "Unauthorized" })));

    const { polyGet, PolyApiError } = await import("../src/poly/api.js");
    await expect(polyGet("events")).rejects.toMatchObject({
      name: "PolyApiError",
      status: 401,
      code: "unauthorized",
      message: "Poly API 401: Login required",
    });
    await expect(polyGet("events")).rejects.toBeInstanceOf(PolyApiError);
  });

  it("requires arti login", async () => {
    tempHome = mkdtempSync(join(tmpdir(), "arti-poly-api-"));
    vi.stubEnv("HOME", tempHome);

    const { polyGet } = await import("../src/poly/api.js");
    await expect(polyGet("events")).rejects.toThrow("未登录。运行: arti login");
  });
});
