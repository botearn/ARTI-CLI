import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// M-S1：承载 Bearer token 的 URL 配置键，非 localhost 必须 https。
describe("setConfigValue URL scheme 校验", () => {
  let tempHome: string | null = null;

  beforeEach(() => {
    tempHome = mkdtempSync(join(tmpdir(), "arti-url-"));
    vi.stubEnv("HOME", tempHome);
    mkdirSync(join(tempHome, ".config", "arti"), { recursive: true });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    if (tempHome && existsSync(tempHome)) rmSync(tempHome, { recursive: true, force: true });
    tempHome = null;
  });

  it("拒绝非 localhost 的 http URL", async () => {
    const { setConfigValue } = await import("../src/config.js");
    expect(() => setConfigValue("api.baseUrl", "http://api.example.com")).toThrow(/https/);
  });

  it("接受 https URL", async () => {
    const { setConfigValue, getConfigValue } = await import("../src/config.js");
    expect(() => setConfigValue("api.baseUrl", "https://api.example.com")).not.toThrow();
    expect(getConfigValue("api.baseUrl")).toBe("https://api.example.com");
  });

  it("允许 localhost 的 http URL", async () => {
    const { setConfigValue } = await import("../src/config.js");
    expect(() => setConfigValue("backend.url", "http://localhost:8080")).not.toThrow();
    expect(() => setConfigValue("backend.url", "http://127.0.0.1:8080")).not.toThrow();
  });

  it("拒绝非法 URL", async () => {
    const { setConfigValue } = await import("../src/config.js");
    expect(() => setConfigValue("backend.mcpUrl", "not-a-url")).toThrow(/合法 URL/);
  });

  it("非 URL 配置键不受 scheme 约束", async () => {
    const { setConfigValue, getConfigValue } = await import("../src/config.js");
    expect(() => setConfigValue("api.timeout", "45000")).not.toThrow();
    expect(getConfigValue("api.timeout")).toBe(45000);
  });
});
