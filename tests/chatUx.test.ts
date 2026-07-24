import { describe, expect, it } from "vitest";
import {
  buildChatCompletionText,
  buildChatLoadingText,
  buildResearchGuideLines,
  shouldShowResearchGuide,
} from "../src/core/chat-display.js";

describe("普通对话 Loading 与能力引导", () => {
  it("等待超过 8 秒后显示耗时和取消提示", () => {
    expect(buildChatLoadingText(1_200)).toBe(
      "普通对话 · 正在生成回答… 1.2s",
    );
    expect(buildChatLoadingText(8_000)).toBe(
      "普通对话 · 已等待 8s，可按 Ctrl+C 取消",
    );
  });

  it("完成信息只展示服务端实际返回的模型与 Token", () => {
    expect(buildChatCompletionText(4_240)).toBe(
      "✓ 普通对话完成 · 4.2s",
    );
    expect(buildChatCompletionText(4_240, {
      requestId: "req-1",
      model: "claude-sonnet",
      inputTokens: 120,
      outputTokens: 30,
      totalTokens: 150,
    })).toBe(
      "✓ 普通对话完成 · 4.2s · claude-sonnet · 150 tokens",
    );
  });

  it("能力引导解释三档入口和 AI 角色边界", () => {
    const text = buildResearchGuideLines().join("\n");

    expect(text).toContain("/quick <代码>");
    expect(text).toContain("/full <代码>");
    expect(text).toContain("/deep <代码>");
    expect(text).toContain("AI 分析角色");
    expect(text).toContain("投资框架模拟");
    expect(text).toContain("并非真人意见");
    expect(text).toContain("无法验证内部多角色过程");
    expect(text).toContain("可见、可追踪");
    expect(text).not.toContain("未调用 AI 分析角色");
  });

  it("只在 Session 第一次成功回答后展示完整引导", () => {
    expect(shouldShowResearchGuide({
      history: [],
      conversation: {
        schemaVersion: 1,
        mode: "client-managed",
        sessionId: "session_12345678",
        activeSymbols: [],
        artifacts: [],
      },
    })).toBe(true);

    expect(shouldShowResearchGuide({
      history: [{ role: "assistant", content: "上一轮回答" }],
      conversation: {
        schemaVersion: 1,
        mode: "client-managed",
        sessionId: "session_12345678",
        activeSymbols: [],
        artifacts: [],
      },
    })).toBe(false);

    expect(shouldShowResearchGuide({
      history: [],
      conversation: {
        schemaVersion: 1,
        mode: "client-managed",
        sessionId: "session_12345678",
        activeSymbols: [],
        artifacts: [],
        summary: {
          goal: "继续研究 NVDA",
          facts: [],
          conclusions: [],
          risks: [],
          assumptions: [],
          openQuestions: [],
          activeSymbols: ["NVDA"],
          artifactIds: [],
        },
      },
    })).toBe(false);
  });
});
