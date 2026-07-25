import { describe, expect, it } from "vitest";
import {
  buildChatCompletionText,
  buildChatFailureText,
  buildChatLoadingLines,
  buildChatLoadingText,
  buildResearchGuideLines,
  shouldShowResearchGuide,
} from "../src/core/chat-display.js";

describe("普通对话 Loading 与能力引导", () => {
  const context = {
    historyMessages: 4,
    hasSummary: true,
    artifactCount: 2,
    activeSymbols: ["NVDA"],
  };

  it("按等待时长展示真实阶段、上下文和取消提示", () => {
    expect(buildChatLoadingText(1_200, context)).toBe(
      "普通对话 · 正在整理会话上下文… 1.2s",
    );

    const connected = buildChatLoadingLines(2_000, context).join("\n");
    expect(connected).toContain("正在连接 ARTI");
    expect(connected).toContain("普通对话 · general");
    expect(connected).toContain("发送：当前问题");
    expect(connected).toContain("历史 4");
    expect(connected).toContain("摘要 1");
    expect(connected).toContain("Artifact 2 个");
    expect(connected).toContain("标的 NVDA");
    expect(connected).not.toContain("投资原则");
    expect(connected).not.toContain("Ctrl+C");

    const waiting = buildChatLoadingLines(8_000, context).join("\n");
    expect(waiting).toContain("等待 ARTI 返回首个回答");
    expect(waiting).toContain("投资原则：");
    expect(waiting).not.toContain("Ctrl+C");

    expect(buildChatLoadingLines(20_000, context).join("\n")).toContain(
      "Ctrl+C 可取消",
    );
  });

  it("上下文只展示前三个活动标的，避免窄终端换行残影", () => {
    const text = buildChatLoadingLines(2_000, {
      ...context,
      activeSymbols: ["AAPL", "NVDA", "TSLA", "GOOGL"],
    }).join("\n");

    expect(text).toContain("标的 AAPL、NVDA、TSLA 等 4 个");
    expect(text).not.toContain("GOOGL");
  });

  it("等待超过 8 秒后每 6 秒轮换原创投资原则", () => {
    const first = buildChatLoadingLines(8_000, context).at(-1);
    const second = buildChatLoadingLines(14_000, context).at(-1);

    expect(first).toBe("投资原则：先定义风险，再讨论收益。");
    expect(second).toBe("投资原则：事实、推断和行动要分开。");
    expect(second).not.toBe(first);
  });

  it("失败信息包含已等待时间", () => {
    expect(buildChatFailureText(4_240)).toBe(
      "普通对话未完成 · 4.2s",
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
