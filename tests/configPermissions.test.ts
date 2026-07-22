import { afterEach, describe, expect, it, vi } from "vitest";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

describe("config file permissions", () => {
  let tempHome: string | null = null;

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    if (tempHome && existsSync(tempHome)) {
      rmSync(tempHome, { recursive: true, force: true });
    }
    tempHome = null;
  });

  function fileMode(path: string): number {
    return statSync(path).mode & 0o777;
  }

  it("saveConfig 落盘为 0600，目录为 0700", async () => {
    tempHome = mkdtempSync(join(tmpdir(), "arti-config-"));
    vi.stubEnv("HOME", tempHome);

    const { loadConfig, saveConfig, getConfigPath } = await import("../src/config.js");
    saveConfig(loadConfig());

    const configFile = getConfigPath();
    expect(fileMode(configFile)).toBe(0o600);
    expect(fileMode(dirname(configFile))).toBe(0o700);
  });

  it("saveConfig 收紧既有 0644 文件", async () => {
    tempHome = mkdtempSync(join(tmpdir(), "arti-config-"));
    vi.stubEnv("HOME", tempHome);

    const configDir = join(tempHome, ".config", "arti");
    mkdirSync(configDir, { recursive: true });
    const configFile = join(configDir, "config.json");
    writeFileSync(configFile, "{}", { mode: 0o644 });
    chmodSync(configFile, 0o644);

    const { loadConfig, saveConfig } = await import("../src/config.js");
    saveConfig(loadConfig());

    expect(fileMode(configFile)).toBe(0o600);
  });

  it("loadConfig 收紧历史遗留的 0644 配置文件", async () => {
    tempHome = mkdtempSync(join(tmpdir(), "arti-config-"));
    vi.stubEnv("HOME", tempHome);

    const configDir = join(tempHome, ".config", "arti");
    mkdirSync(configDir, { recursive: true });
    const configFile = join(configDir, "config.json");
    writeFileSync(configFile, "{}");
    chmodSync(configFile, 0o644);

    const { loadConfig } = await import("../src/config.js");
    loadConfig();

    expect(fileMode(configFile)).toBe(0o600);
  });
});
