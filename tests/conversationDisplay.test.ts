import { describe, expect, it } from "vitest";
import {
  formatSessionList,
  formatSessionStatus,
  formatSessionUsage,
} from "../src/core/conversation-display.js";
import type { ConversationSessionSnapshot } from "../src/core/conversation-session.js";

function snapshot(
  overrides: Partial<ConversationSessionSnapshot> = {},
): ConversationSessionSnapshot {
  return {
    entry: {
      id: "session_12345678",
      title: "NVDA 跟踪",
      createdAt: "2026-07-24T00:00:00.000Z",
      updatedAt: "2026-07-24T00:01:00.000Z",
      lastModel: "claude-sonnet",
      activeSymbols: ["NVDA"],
      totalUsage: {
        inputTokens: 2_000,
        outputTokens: 400,
        cachedInputTokens: 500,
        totalTokens: 2_400,
        contextWindow: 128_000,
      },
    },
    events: [],
    messages: [],
    contextMessages: [],
    artifacts: [],
    lastUsage: {
      requestId: "req-1",
      model: "claude-sonnet",
      inputTokens: 1_200,
      outputTokens: 320,
      cachedInputTokens: 400,
      totalTokens: 1_520,
      contextWindow: 128_000,
    },
    ...overrides,
  };
}

describe("Session 状态与 Token usage 展示", () => {
  it("/status 分开展示模型、上下文和活动标的", () => {
    expect(formatSessionStatus(snapshot())).toEqual([
      "Session: session_12345678",
      "标题: NVDA 跟踪",
      "模型: claude-sonnet",
      "上下文: 1,200 / 128,000 tokens (0.9%)",
      "活动标的: NVDA",
      "Artifacts: 0",
    ]);
  });

  it("/usage 分开展示最近一轮与会话累计 Token", () => {
    expect(formatSessionUsage(snapshot())).toEqual([
      "最近一轮: 输入 1,200 · 输出 320 · 缓存 400 · 总计 1,520",
      "会话累计: 输入 2,000 · 输出 400 · 缓存 500 · 总计 2,400",
    ]);
  });

  it("服务端没有返回 usage 时明确显示未知，不做本地估算", () => {
    const noUsage = snapshot({
      entry: {
        ...snapshot().entry,
        lastModel: undefined,
        totalUsage: {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
        },
      },
      lastUsage: undefined,
    });

    expect(formatSessionStatus(noUsage)).toContain("上下文: 服务端尚未返回 Token usage");
    expect(formatSessionUsage(noUsage)).toEqual(["服务端尚未返回 Token usage"]);
  });

  it("/resume 无参数按最近更新时间列出 Session", () => {
    expect(formatSessionList([
      snapshot().entry,
      {
        ...snapshot().entry,
        id: "session_abcdefgh",
        title: "AAPL",
        updatedAt: "2026-07-23T00:00:00.000Z",
      },
    ], "session_12345678")).toEqual([
      "最近会话:",
      "* session_12345678 · 2026-07-24 00:01 · NVDA 跟踪",
      "  session_abcdefgh · 2026-07-23 00:00 · AAPL",
      "使用 /resume <Session ID 或前缀> 恢复",
    ]);
  });
});
