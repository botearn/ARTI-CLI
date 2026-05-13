import { describe, expect, it } from "vitest";
import { buildTechnicalFromHistory } from "../src/data/technical.js";
import type { HistoricalBar } from "../src/openbb.js";

function makeBars(count: number): HistoricalBar[] {
  const bars: HistoricalBar[] = [];
  for (let i = 0; i < count; i++) {
    const base = 10 + i * 0.5;
    bars.push({
      date: `2026-01-${String((i % 28) + 1).padStart(2, "0")}`,
      open: base,
      high: base + 1,
      low: base - 1,
      close: base + 0.2,
      volume: 1000 + i * 10,
    });
  }
  return bars;
}

describe("buildTechnicalFromHistory", () => {
  it("数据不足时返回 error", () => {
    const result = buildTechnicalFromHistory("000001", makeBars(10));
    expect(result.error).toContain("数据不足");
  });

  it("足够数据时返回技术指标与 recent", () => {
    const result = buildTechnicalFromHistory("000001", makeBars(60));
    expect(result.error).toBeUndefined();
    expect(result.price).toBeGreaterThan(0);
    expect(result.ma.MA5).toBeDefined();
    expect(result.ma.MA20).toBeDefined();
    expect(result.rsi).not.toBeNull();
    expect(result.macd).not.toBeNull();
    expect(result.recent).toHaveLength(5);
    expect(["偏多", "偏空", "中性"]).toContain(result.overall_signal);
  });
});
