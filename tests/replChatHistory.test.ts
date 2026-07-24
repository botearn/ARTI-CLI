import { describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "../src/commands/chat.js";
import {
  appendChatTurn,
  clearChatHistory,
  dispatchReplConversationText,
} from "../src/core/repl.js";

describe("REPL chat 会话历史", () => {
  it("只保留最近 6 轮 user/assistant 消息", () => {
    const history: ChatMessage[] = [];

    for (let i = 1; i <= 7; i += 1) {
      appendChatTurn(history, `问题 ${i}`, `回答 ${i}`);
    }

    expect(history).toHaveLength(12);
    expect(history[0]).toEqual({ role: "user", content: "问题 2" });
    expect(history.at(-1)).toEqual({ role: "assistant", content: "回答 7" });
  });

  it("clear/reset 使用的清空函数会移除当前进程内上下文", () => {
    const history: ChatMessage[] = [
      { role: "user", content: "问题" },
      { role: "assistant", content: "回答" },
    ];

    clearChatHistory(history);

    expect(history).toEqual([]);
  });

  it("REPL 普通对话传入完整历史并追加完整 assistant 文本", async () => {
    const history: ChatMessage[] = [
      { role: "user", content: "上一问" },
      { role: "assistant", content: "上一答" },
    ];
    const runRawChat = vi.fn().mockResolvedValue("本次完整回答");

    await dispatchReplConversationText("继续分析", history, runRawChat);

    expect(runRawChat).toHaveBeenCalledWith("继续分析", {
      history: [
        { role: "user", content: "上一问" },
        { role: "assistant", content: "上一答" },
      ],
    });
    expect(history.slice(-2)).toEqual([
      { role: "user", content: "继续分析" },
      { role: "assistant", content: "本次完整回答" },
    ]);
  });

  it("裸命令文本不做意图分发，原样进入对话", async () => {
    const history: ChatMessage[] = [];
    const runRawChat = vi.fn().mockResolvedValue("聊天回答");

    await dispatchReplConversationText("deep NVDA", history, runRawChat);

    expect(runRawChat).toHaveBeenCalledWith("deep NVDA", { history: [] });
    expect(history).toEqual([
      { role: "user", content: "deep NVDA" },
      { role: "assistant", content: "聊天回答" },
    ]);
  });
});
