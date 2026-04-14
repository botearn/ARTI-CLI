/**
 * classifySignal 信号分类测试
 * 覆盖：多头 / 空头 / 中性 关键词匹配
 */
import { describe, it, expect } from "vitest";
import { classifySignal } from "../src/openbb.js";

describe("classifySignal", () => {
  it("包含多头关键词 → bull", () => {
    expect(classifySignal("RSI 超卖反弹")).toBe("bull");
    expect(classifySignal("短期均线多头排列")).toBe("bull");
    expect(classifySignal("价格突破上轨")).toBe("bull");
  });

  it("包含空头关键词 → bear", () => {
    expect(classifySignal("RSI 超买回调")).toBe("bear");
    expect(classifySignal("均线空头排列")).toBe("bear");
    expect(classifySignal("价格跌破支撑位")).toBe("bear");
  });

  it("无匹配关键词 → neutral", () => {
    expect(classifySignal("成交量放大")).toBe("neutral");
    expect(classifySignal("MACD 柱状为正")).toBe("neutral");
    expect(classifySignal("")).toBe("neutral");
  });

  it("同时包含多头和空头关键词时，多头优先", () => {
    // classifySignal 先检查 BULL_KEYWORDS，匹配即返回
    expect(classifySignal("超卖但均线空头")).toBe("bull");
  });
});
