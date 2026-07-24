import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("requestConversationSummary", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("通过普通 v1-chat 请求结构化摘要并兼容 Markdown code fence", async () => {
    async function* fakeStream() {
      yield "```json\n";
      yield JSON.stringify({
        goal: "评估 NVDA",
        activeSymbols: ["NVDA"],
        facts: [{ text: "价格 180 美元", asOf: "2026-07-24" }],
        conclusions: ["趋势偏强"],
        risks: ["估值偏高"],
        assumptions: [],
        unresolvedQuestions: [],
        artifactIds: ["artifact_123"],
      });
      yield "\n```";
    }
    const streamChat = vi.fn(() => fakeStream());
    const onUsage = vi.fn();
    vi.doMock("../src/api.js", () => ({ streamChat }));

    const { requestConversationSummary } = await import(
      "../src/core/conversation-compact.js"
    );
    const summary = await requestConversationSummary({
      focus: "保留风险",
      previousSummary: undefined,
      messages: [{ role: "user", content: "分析 NVDA" }],
      activeSymbols: ["NVDA"],
      artifacts: [{
        id: "artifact_123",
        type: "quick_scan",
        digest: "NVDA 快速扫描摘要",
      }],
    }, { onUsage });

    expect(summary.risks).toEqual(["估值偏高"]);
    expect(streamChat).toHaveBeenCalledWith(
      [expect.objectContaining({
        role: "user",
        content: expect.stringContaining("保留风险"),
      })],
      {
        clientCapabilities: { usageEvents: true },
        onUsage,
      },
    );
  });

  it("模型未返回合法结构时抛错，不接受普通文本摘要", async () => {
    async function* fakeStream() {
      yield "NVDA 总体趋势不错，但需要注意风险。";
    }
    vi.doMock("../src/api.js", () => ({ streamChat: vi.fn(() => fakeStream()) }));

    const { requestConversationSummary } = await import(
      "../src/core/conversation-compact.js"
    );

    await expect(requestConversationSummary({
      previousSummary: undefined,
      messages: [{ role: "user", content: "分析 NVDA" }],
      activeSymbols: ["NVDA"],
      artifacts: [],
    })).rejects.toThrow("结构化摘要");
  });
});
