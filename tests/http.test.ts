import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWithTimeout, RequestTimeoutError } from "../src/http.js";

describe("fetchWithTimeout", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("正常响应时直接返回 Response", async () => {
    const fake = new Response("ok", { status: 200 });
    vi.stubGlobal("fetch", vi.fn(async () => fake));
    const res = await fetchWithTimeout("https://example.com", { timeoutMs: 1000 });
    expect(res.status).toBe(200);
    vi.unstubAllGlobals();
  });

  it("超时后 abort 并抛 RequestTimeoutError", async () => {
    // 模拟一个永不 resolve、但监听 abort 的 fetch
    vi.stubGlobal("fetch", vi.fn((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      }),
    ));

    await expect(
      fetchWithTimeout("https://slow.example.com", { timeoutMs: 20 }),
    ).rejects.toBeInstanceOf(RequestTimeoutError);

    vi.unstubAllGlobals();
  });

  it("调用方 abort 时抛原始错误而非超时错误", async () => {
    vi.stubGlobal("fetch", vi.fn((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      }),
    ));

    const ac = new AbortController();
    const p = fetchWithTimeout("https://example.com", { timeoutMs: 10_000, signal: ac.signal });
    ac.abort();
    await expect(p).rejects.not.toBeInstanceOf(RequestTimeoutError);

    vi.unstubAllGlobals();
  });
});
