import { describe, expect, it } from "vitest";
import { formatResearchStockData } from "../src/data/research-context.js";
import type { QuoteData, TechnicalData } from "../src/openbb.js";

describe("formatResearchStockData", () => {
  it("同时包含 quote 和 technical 时拼出增强上下文", () => {
    const quote: QuoteData = {
      symbol: "000001.SZ",
      name: "Ping An Bank",
      last_price: 12.34,
      open: 12,
      high: 12.5,
      low: 11.9,
      prev_close: 12,
      volume: 1234567,
      change: 0.34,
      change_percent: 2.83,
      year_high: 15,
      year_low: 8,
      ma_50d: 11.5,
      ma_200d: 10.2,
      volume_average: 1000000,
      currency: "CNY",
    };

    const technical: TechnicalData = {
      symbol: "000001.SZ",
      price: 12.34,
      change: 0.34,
      change_percent: 2.83,
      ma: { MA20: 11.8, MA60: 10.9 },
      rsi: 61.2,
      macd: { MACD: 0.12, signal: 0.08, histogram: 0.04 },
      bbands: { upper: 13, middle: 12, lower: 11 },
      atr: 0.5,
      adx: 27.1,
      obv: 12345,
      stochastic: { K: 70, D: 66 },
      recent: [],
      signals: ["MACD多头"],
      overall_signal: "偏多",
    };

    const text = formatResearchStockData("000001.SZ", quote, technical, "arti-data");
    expect(text).toContain("000001.SZ: $12.34");
    expect(text).toContain("MA50:11.5");
    expect(text).toContain("RSI:61.2");
    expect(text).toContain("信号:偏多");
    expect(text).toContain("source:arti-data");
  });

  it("无数据时返回空字符串", () => {
    expect(formatResearchStockData("AAPL", null, null, null)).toBe("");
  });
});
