import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("能力命令 Artifact 返回值", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("quick-scan 保持原输出并返回完整结构化 payload 与短摘要", async () => {
    const scan = {
      price: 180,
      pct: 2.5,
      overall_signal: "偏多",
      data_as_of: "2026-07-24",
      vol_ratio: 1.2,
    };
    const output = vi.fn();
    vi.doMock("../src/api.js", () => ({
      scanStockBackend: vi.fn().mockResolvedValue({ scan }),
    }));
    vi.doMock("../src/commands/research.js", () => ({
      researchCommand: vi.fn(),
    }));
    vi.doMock("../src/core/handler.js", () => ({
      handleCommand: async (_label: string, run: () => Promise<unknown>) => run(),
    }));
    vi.doMock("../src/output.js", () => ({ output }));
    vi.doMock("../src/tracker.js", () => ({ track: vi.fn() }));
    vi.doMock("../src/errors.js", () => ({ printError: vi.fn() }));
    vi.doMock("../src/billing.js", () => ({
      InsufficientCreditsError: class extends Error {},
    }));

    const { quickScanCommand } = await import("../src/commands/product.js");
    const result = await quickScanCommand("nvda");

    expect(output).toHaveBeenCalledWith({ symbol: "NVDA", scan }, expect.any(Function));
    expect(result).toEqual({
      json: { symbol: "NVDA", scan },
      artifact: {
        type: "quick_scan",
        symbol: "NVDA",
        dataAsOf: "2026-07-24",
        digest: expect.stringContaining("NVDA"),
        payload: { symbol: "NVDA", scan },
      },
    });
  });

  it("poly 保持原输出并返回查询结果 Artifact", async () => {
    const response = {
      data: [{
        id: "event-1",
        title: "美联储九月会降息吗？",
      }],
    };
    const output = vi.fn();
    vi.doMock("../src/poly/api.js", () => ({
      polyGet: vi.fn().mockResolvedValue(response),
    }));
    vi.doMock("../src/output.js", () => ({ output }));
    vi.doMock("../src/errors.js", () => ({ printError: vi.fn() }));
    vi.doMock("../src/poly/format.js", () => ({
      renderEvent: vi.fn(),
      renderEvents: vi.fn(),
      renderPicks: vi.fn(),
      renderSummary: vi.fn(),
    }));

    const { polyCommand } = await import("../src/poly/commands.js");
    const result = await polyCommand(["events"], { limit: "1" });

    expect(output).toHaveBeenCalledWith(response, expect.any(Function));
    expect(result).toEqual({
      json: response,
      artifact: {
        type: "poly_result",
        digest: expect.stringContaining("美联储九月会降息吗"),
        payload: response,
      },
    });
  });
});
