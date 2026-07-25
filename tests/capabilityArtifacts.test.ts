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

  it("quick-scan 渲染线上判断并用行情时间生成 Artifact", async () => {
    const scan = {
      code: "NVDA",
      name: "NVIDIA",
      price: 180,
      pct: 2.5,
      overall_signal: "偏多",
      trend_signal: "上涨",
      support: 175,
      resist: 188,
      rsi: 62,
      macd: 1.5,
      vol_ratio: 1.2,
      quote_as_of: "2026-07-24T14:38:27.451Z",
      data_source: "Yahoo Finance",
      quote_mode: "准实时行情",
      market_status: "交易中",
      interpretation: "趋势偏强，但临近压力位。",
      diagnosis: {
        company: "AI 算力龙头。",
        natasha_score: 7,
        natasha: "宏观环境中性偏多。",
        tony: "价格保持在主要均线上方。",
        tony_entry: "$175-$178",
        tony_target: "$188",
        tony_stop: "$172",
        steve: "资金流保持活跃。",
        master_name: "价值守门人",
        master_role: "价值投资",
        master_view: "增长确定，但需关注估值安全边际。",
        verdict: "观望",
        verdict_tone: "趋势仍强，但当前价格接近压力位。",
        divergence: "增长与估值的权衡。",
        trigger: "放量突破压力位。",
        risk: "估值回落风险。",
      },
      fundamentals: {
        pe: 32,
        market_cap: 4_000_000_000_000,
      },
    };
    const output = vi.fn((_payload: unknown, render: () => void) => render());
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
    const rendered = vi.mocked(console.log).mock.calls
      .map(([line]) => String(line))
      .join("\n");
    expect(rendered).toContain("【分析判断】");
    expect(rendered).toContain("AI 算力龙头");
    expect(rendered).toContain("宏观环境中性偏多");
    expect(rendered).toContain("资金流保持活跃");
    expect(rendered).toContain("价值守门人");
    expect(rendered).toContain("【综合结论】");
    expect(rendered).toContain("估值回落风险");
    expect(rendered).toContain("Yahoo Finance");
    expect(rendered).toContain("准实时行情");
    expect(result).toEqual({
      json: { symbol: "NVDA", scan },
      artifact: {
        type: "quick_scan",
        symbol: "NVDA",
        dataAsOf: "2026-07-24T14:38:27.451Z",
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
