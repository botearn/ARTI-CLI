import { describe, expect, it } from "vitest";
import { formatBackendResearchStockData, formatResearchStockData } from "../src/data/research-context.js";
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

  it("为 backend 生成结构化 JSON", () => {
    const quote: QuoteData = {
      symbol: "AAPL",
      name: "Apple",
      last_price: 100,
      open: 99,
      high: 101,
      low: 98,
      prev_close: 98,
      volume: 500000,
      change: 2,
      change_percent: 2.04,
      year_high: 120,
      year_low: 80,
      ma_50d: 95,
      ma_200d: 90,
      volume_average: 450000,
      currency: "USD",
    };

    const technical: TechnicalData = {
      symbol: "AAPL",
      price: 100,
      change: 2,
      change_percent: 2.04,
      ma: { MA20: 97, MA60: 92 },
      rsi: 65,
      macd: { MACD: 1.2, signal: 0.8, histogram: 0.4 },
      bbands: { upper: 103, middle: 98, lower: 93 },
      atr: 3.5,
      adx: 24,
      obv: 123,
      stochastic: { K: 71, D: 68 },
      recent: [],
      signals: ["多头"],
      overall_signal: "偏多",
    };

    const json = formatBackendResearchStockData("AAPL", quote, technical, "backend");
    const parsed = JSON.parse(json);
    expect(parsed.symbol).toBe("AAPL");
    expect(parsed.quote.price).toBe(100);
    expect(parsed.technical.ma.MA20).toBe(97);
    expect(parsed.technicalSource).toBe("backend");
  });
});
