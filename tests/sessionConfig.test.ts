import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("Session 保留期配置", () => {
  let tempHome: string | null = null;

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    if (tempHome && existsSync(tempHome)) {
      rmSync(tempHome, { recursive: true, force: true });
    }
    tempHome = null;
  });

  async function loadFreshConfig() {
    tempHome = mkdtempSync(join(tmpdir(), "arti-session-config-"));
    vi.stubEnv("HOME", tempHome);
    return import("../src/config.js");
  }

  it("默认保留 30 天并允许配置调整", async () => {
    const { loadConfig, setConfigValue } = await loadFreshConfig();

    expect(loadConfig().session.retentionDays).toBe(30);
    setConfigValue("session.retentionDays", "45");
    expect(loadConfig().session.retentionDays).toBe(45);
  });

  it("拒绝非正整数保留期", async () => {
    const { setConfigValue } = await loadFreshConfig();

    expect(() => setConfigValue("session.retentionDays", "0")).toThrow("正整数");
    expect(() => setConfigValue("session.retentionDays", "abc")).toThrow("正整数");
  });

  it("允许环境变量覆盖保留期", async () => {
    const { loadConfig } = await loadFreshConfig();
    vi.stubEnv("ARTI_SESSION_RETENTION_DAYS", "60");

    expect(loadConfig().session.retentionDays).toBe(60);
  });
});
