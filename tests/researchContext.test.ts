import { describe, expect, it } from "vitest";
import { formatBackendResearchStockData, formatResearchStockData } from "../src/data/research-context.js";
import type { BackendStockData } from "../src/api.js";

function makeScan(overrides: Partial<BackendStockData> = {}): BackendStockData {
  return {
    code: "000001.SZ",
    name: "Ping An Bank",
    price: 12.34,
    pct: 2.83,
    vol_ratio: 1.1,
    curr_vol: 1234567,
    turnover: null,
    overall_signal: "偏多",
    trend_signal: "多头",
    tech: {
      trend: "多头",
      ma5: 12.1, ma10: 12.0, ma20: 11.8, ma60: 10.9,
      rsi: 61.2, macd: 0.12,
      bb_pos: null, bb_up: 13, bb_dn: 11,
      atr: 0.5, atr_stop: null, atr_pct: null,
      support: 11.5, resist: 13.2,
    },
    recent_5d: [{ date: "2026-06-25", close: 12.34, pct: 2.83, vol: 1234567 }],
    fundamentals: { pe: 5.2, pb: 0.7, roe: 12.1 },
    profile: null,
    data_as_of: "2026-06-25",
    market_status: "closed",
    ...overrides,
  };
}

describe("formatResearchStockData", () => {
  it("有 scan 时拼出增强上下文", () => {
    const text = formatResearchStockData("000001.SZ", makeScan());
    expect(text).toContain("000001.SZ: $12.34");
    expect(text).toContain("MA20:11.8");
    expect(text).toContain("RSI:61.2");
    expect(text).toContain("信号:偏多");
  });

  it("无数据时返回空字符串", () => {
    expect(formatResearchStockData("AAPL", null)).toBe("");
  });

  it("为 backend 生成结构化 JSON", () => {
    const json = formatBackendResearchStockData(
      "AAPL",
      makeScan({ code: "AAPL", name: "Apple", price: 100, pct: 2.04 }),
    );
    const parsed = JSON.parse(json);
    expect(parsed.symbol).toBe("AAPL");
    expect(parsed.quote.price).toBe(100);
    expect(parsed.technical.ma20).toBe(11.8);
    expect(parsed.technical.overallSignal).toBe("偏多");
  });

  // M-C3: 后端违背类型契约回 null 时，格式化不应崩溃（此前 scan.pct.toFixed 抛 TypeError）
  it("price/pct 为 null 时不崩溃，渲染占位符", () => {
    const scan = makeScan({ price: null as unknown as number, pct: null as unknown as number });
    expect(() => formatResearchStockData("AAPL", scan)).not.toThrow();
    const text = formatResearchStockData("AAPL", scan);
    expect(text).toContain("AAPL: $—");
    expect(text).toContain("—");
  });
});
