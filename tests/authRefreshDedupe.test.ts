import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// M-S4：并发刷新同一 refresh token 应合并为单次网络请求，
// 避免 Supabase refresh token rotation 下先返回者使旧 token 失效导致被登出。
describe("refreshAuthSession 并发去重", () => {
  let tempHome: string | null = null;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    tempHome = mkdtempSync(join(tmpdir(), "arti-auth-refresh-"));
    vi.stubEnv("HOME", tempHome);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    if (tempHome && existsSync(tempHome)) {
      rmSync(tempHome, { recursive: true, force: true });
    }
    tempHome = null;
  });

  it("并发调用只发起一次 token 刷新请求", async () => {
    vi.doMock("../src/config.js", () => ({
      loadConfig: () => ({
        api: { baseUrl: "https://proj.supabase.co/functions/v1", timeout: 1000 },
        backend: { enabled: true, url: "https://backend.example.com", timeout: 1000 },
        auth: {
          token: "old.token.sig",
          refreshToken: "refresh-abc",
          expiresAt: 1,
          userId: "u1",
          email: "u@example.com",
          supabaseUrl: "https://proj.supabase.co",
          publishableKey: "sb_publishable_test",
        },
        data: { provider: "hybrid", artiDataBaseUrl: "", artiDataTimeout: 15000, artiDataInternalKey: "" },
        display: { market: "US", lang: "zh" },
        watchlist: [],
      }),
      saveConfig: vi.fn(),
      deriveSupabaseUrlFromApiBase: vi.fn(() => "https://proj.supabase.co"),
      getDefaultSupabaseUrl: vi.fn(() => "https://proj.supabase.co"),
    }));

    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({
        access_token: "new.token.sig",
        refresh_token: "refresh-xyz",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: { id: "u1", email: "u@example.com" },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ));
    vi.stubGlobal("fetch", fetchMock);

    const { refreshAuthSession } = await import("../src/auth.js");

    // 三路并发刷新
    const [a, b, c] = await Promise.all([
      refreshAuthSession(),
      refreshAuthSession(),
      refreshAuthSession(),
    ]);

    // 去重的核心可观测证据：三路并发只触发一次网络刷新，且共享同一结果。
    // （返回值内容由 getAuthState()→loadConfig 决定，此处 config 被 mock 为常量，故不断言 token 文本。）
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
    expect(b).toEqual(c);
  });

  it("刷新完成后 inflight 释放，下次刷新重新发起请求", async () => {
    vi.doMock("../src/config.js", () => ({
      loadConfig: () => ({
        api: { baseUrl: "https://proj.supabase.co/functions/v1", timeout: 1000 },
        backend: { enabled: true, url: "https://backend.example.com", timeout: 1000 },
        auth: {
          token: "old.token.sig",
          refreshToken: "refresh-abc",
          expiresAt: 1,
          userId: "u1",
          email: "u@example.com",
          supabaseUrl: "https://proj.supabase.co",
          publishableKey: "sb_publishable_test",
        },
        data: { provider: "hybrid", artiDataBaseUrl: "", artiDataTimeout: 15000, artiDataInternalKey: "" },
        display: { market: "US", lang: "zh" },
        watchlist: [],
      }),
      saveConfig: vi.fn(),
      deriveSupabaseUrlFromApiBase: vi.fn(() => "https://proj.supabase.co"),
      getDefaultSupabaseUrl: vi.fn(() => "https://proj.supabase.co"),
    }));

    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({
        access_token: "new.token.sig",
        refresh_token: "refresh-xyz",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: { id: "u1", email: "u@example.com" },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ));
    vi.stubGlobal("fetch", fetchMock);

    const { refreshAuthSession } = await import("../src/auth.js");

    await refreshAuthSession();
    await refreshAuthSession();

    // 两次串行刷新，inflight 已释放，各发一次
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("两个 CLI 进程共享落盘登录态时只消费一次 refresh token", async () => {
    vi.doUnmock("../src/config.js");

    const { loadConfig, saveConfig } = await import("../src/config.js");
    const config = loadConfig();
    config.auth = {
      token: "old.token.sig",
      refreshToken: "refresh-abc",
      expiresAt: 1,
      userId: "u1",
      email: "u@example.com",
      supabaseUrl: "https://proj.supabase.co",
      publishableKey: "sb_publishable_test",
    };
    saveConfig(config);

    const firstAuthModule = await import("../src/auth.js");
    vi.resetModules();
    const secondAuthModule = await import("../src/auth.js");

    let finishRefresh: (() => void) | undefined;
    const refreshStarted = new Promise<void>((resolve) => {
      finishRefresh = resolve;
    });
    const fetchMock = vi.fn(async () => {
      await refreshStarted;
      return new Response(
        JSON.stringify({
          access_token: "new.token.sig",
          refresh_token: "refresh-xyz",
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user: { id: "u1", email: "u@example.com" },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const first = firstAuthModule.refreshAuthSession(firstAuthModule.getAuthState());
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const second = secondAuthModule.refreshAuthSession(secondAuthModule.getAuthState());
    finishRefresh?.();

    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(firstResult.token).toBe("new.token.sig");
    expect(secondResult.token).toBe("new.token.sig");
    expect(secondResult.refreshToken).toBe("refresh-xyz");
  });
});
