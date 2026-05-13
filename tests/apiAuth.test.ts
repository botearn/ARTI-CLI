import { afterEach, describe, expect, it, vi } from "vitest";

describe("callEdge auth header", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("在提供 ARTI_AUTH_TOKEN 时附带 Bearer token", async () => {
    vi.stubEnv("ARTI_API_URL", "https://example.com/functions/v1");
    vi.stubEnv("ARTI_AUTH_TOKEN", "token-123");

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const { callEdge } = await import("../src/api.js");
    await callEdge("test-fn", { hello: "world" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toMatchObject({
      "Content-Type": "application/json",
      Authorization: "Bearer token-123",
    });
  });
});
