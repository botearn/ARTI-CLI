import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("researchCommand layer1-only", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it("在 layer1_complete 后立即结束，不再等待后续 SSE 关闭", async () => {
    let generatorClosed = false;

    vi.doMock("ora", () => ({
      default: () => ({
        text: "",
        start() {
          return this;
        },
        stop() {
          return this;
        },
        succeed() {
          return this;
        },
        warn() {
          return this;
        },
        fail() {
          return this;
        },
      }),
    }));

    vi.doMock("../src/api.js", () => ({
      AGENT_TYPES: ["tony"],
      AGENT_LABELS: { tony: "技术面" },
      MASTER_LABELS: {},
      fetchResearch: vi.fn(),
      streamOrchestrator: vi.fn(),
      async *streamOrchestratorBackend() {
        try {
          yield {
            type: "layer1_agent_done",
            agent: "tony",
            label: "技术面",
            report: {
              title: "mock title",
              summary: "mock summary",
              keyPoints: ["point 1"],
              sentiment: "中性",
              confidence: 0.68,
              fullReport: "mock full report",
            },
          };

          yield { type: "layer1_complete" };

          await new Promise(() => {});
        } finally {
          generatorClosed = true;
        }
      },
    }));

    vi.doMock("../src/config.js", () => ({
      loadConfig: () => ({
        backend: { enabled: true, url: "https://backend.example.com", timeout: 1000 },
        auth: { token: "token" },
        api: { baseUrl: "https://api.example.com", timeout: 1000 },
      }),
    }));

    vi.doMock("../src/data/research-context.js", () => ({
      buildResearchStockContext: vi.fn().mockResolvedValue({
        stockData: "AAPL mock stock data",
        backendStockData: "{\"symbol\":\"AAPL\"}",
        technicalSource: "backend",
      }),
    }));

    vi.doMock("../src/output.js", () => ({
      output: (_data: unknown, render: () => void) => render(),
    }));

    vi.doMock("../src/tracker.js", () => ({
      track: vi.fn(),
    }));

    vi.doMock("../src/errors.js", () => ({
      printError: vi.fn(),
    }));

    vi.doMock("../src/billing.js", () => ({
      InsufficientCreditsError: class extends Error {},
      assertSufficientCredits: vi.fn(() => ({ credits: 100 })),
      applyDeduction: vi.fn(() => undefined),
      printDeductResult: vi.fn(),
    }));

    vi.doMock("../src/format.js", () => ({
      title: (value: string) => value,
      divider: () => "----",
      sentimentBadge: (value: string) => value,
      confidenceBar: (value: number) => `${Math.round(value * 100)}%`,
    }));

    const { researchCommand } = await import("../src/commands/research.js");

    await expect(Promise.race([
      researchCommand("AAPL", { mode: "layer1-only", full: true }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("researchCommand timed out")), 200)),
    ])).resolves.toBeUndefined();

    expect(generatorClosed).toBe(true);
  });

  it("在 layer1-only --full 时输出报告结构化章节", async () => {
    vi.doMock("ora", () => ({
      default: () => ({
        text: "",
        start() {
          return this;
        },
        stop() {
          return this;
        },
        succeed() {
          return this;
        },
        warn() {
          return this;
        },
        fail() {
          return this;
        },
      }),
    }));

    vi.doMock("../src/api.js", () => ({
      AGENT_TYPES: ["tony"],
      AGENT_LABELS: { tony: "技术面" },
      MASTER_LABELS: {},
      fetchResearch: vi.fn(),
      streamOrchestrator: vi.fn(),
      async *streamOrchestratorBackend() {
        yield {
          type: "layer1_agent_done",
          agent: "tony",
          label: "技术面",
          report: {
            title: "技术分析报告",
            summary: "趋势偏强但接近阻力位",
            keyPoints: '["突破前高","成交量放大","短线回调风险","乐观情景：放量突破 195，概率 30%","基准情景：区间震荡，概率 50%","悲观情景：跌破 185，概率 20%"]',
            sentiment: "中性",
            confidence: 0.68,
            fullReport: "建议观望\n仓位上限 30%\n不追高，等待回踩确认\n乐观情景：放量突破 195，概率 30%\n基准情景：区间震荡，概率 50%\n悲观情景：跌破 185，概率 20%\n第一段\n第二段",
          },
        };

        yield { type: "layer1_complete" };
      },
    }));

    vi.doMock("../src/config.js", () => ({
      loadConfig: () => ({
        backend: { enabled: true, url: "https://backend.example.com", timeout: 1000 },
        auth: { token: "token" },
        api: { baseUrl: "https://api.example.com", timeout: 1000 },
      }),
    }));

    vi.doMock("../src/data/research-context.js", () => ({
      buildResearchStockContext: vi.fn().mockResolvedValue({
        stockData: "AAPL: $190.00 +1.25% 成交量:12,345,678 | MA20:185 | RSI:61.2 | 信号:偏多",
        backendStockData: JSON.stringify({
          symbol: "AAPL",
          quote: { price: 190, yearHigh: 195, yearLow: 150 },
          technical: {
            ma: { MA10: 188, MA20: 185 },
            bbands: { upper: 196, middle: 185, lower: 174 },
            atr: 4,
            overallSignal: "偏多",
          },
        }),
        technicalSource: "backend",
      }),
    }));

    vi.doMock("../src/output.js", () => ({
      output: (_data: unknown, render: () => void) => render(),
    }));

    vi.doMock("../src/tracker.js", () => ({
      track: vi.fn(),
    }));

    vi.doMock("../src/errors.js", () => ({
      printError: vi.fn(),
    }));

    vi.doMock("../src/billing.js", () => ({
      InsufficientCreditsError: class extends Error {},
      assertSufficientCredits: vi.fn(() => ({ credits: 100 })),
      applyDeduction: vi.fn(() => undefined),
      printDeductResult: vi.fn(),
    }));

    vi.doMock("../src/format.js", () => ({
      title: (value: string) => value,
      divider: () => "----",
      sentimentBadge: (value: string) => value,
      confidenceBar: (value: number) => `${Math.round(value * 100)}%`,
    }));

    const { researchCommand } = await import("../src/commands/research.js");

    await researchCommand("AAPL", { mode: "layer1-only", full: true });

    const outputText = logSpy.mock.calls.flat().join("\n");
    expect(outputText).toContain("详细分析报告");
    expect(outputText).toContain("报告结论");
    expect(outputText).toContain("操作摘要");
    expect(outputText).toContain("一句话判断");
    expect(outputText).toContain("当前建议");
    expect(outputText).toContain("关键价位");
    expect(outputText).toContain("操作参考");
    expect(outputText).toContain("核心驱动");
    expect(outputText).toContain("关键风险");
    expect(outputText).toContain("多空拆解");
    expect(outputText).toContain("情景推演");
    expect(outputText).toContain("分析师详报");
    expect(outputText).toContain("突破前高");
    expect(outputText).toContain("短线回调风险");
    expect(outputText).toContain("乐观情景");
    expect(outputText).toContain("基准情景");
    expect(outputText).toContain("悲观情景");
    expect(outputText).toContain("正文摘录");
    expect(outputText).toContain("已省略其余正文");
  });
});
