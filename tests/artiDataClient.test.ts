import { describe, expect, it, vi, afterEach } from "vitest";

describe("arti-data client helpers", () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("仅在 hybrid/arti-data 且配置齐全时启用 A 股 history", async () => {
    vi.stubEnv("ARTI_DATA_PROVIDER", "hybrid");
    vi.stubEnv("ARTI_DATA_API_URL", "https://arti-data.internal");
    vi.stubEnv("ARTI_DATA_INTERNAL_KEY", "secret");

    const { canUseArtiDataHistory } = await import("../src/data/client.js");
    expect(canUseArtiDataHistory("000001.SZ")).toBe(true);
    expect(canUseArtiDataHistory("000001")).toBe(true);
    expect(canUseArtiDataHistory("AAPL")).toBe(false);
  });

  it("openbb 模式下禁用 arti-data history", async () => {
    vi.stubEnv("ARTI_DATA_PROVIDER", "openbb");
    vi.stubEnv("ARTI_DATA_API_URL", "https://arti-data.internal");
    vi.stubEnv("ARTI_DATA_INTERNAL_KEY", "secret");

    const { canUseArtiDataHistory } = await import("../src/data/client.js");
    expect(canUseArtiDataHistory("000001.SZ")).toBe(false);
  });
});
