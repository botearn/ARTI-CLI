import { describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "../src/commands/chat.js";
import {
  appendChatTurn,
  clearChatHistory,
  dispatchReplChat,
  dispatchReplFreeText,
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

  it("REPL chat 命令传入完整历史并追加完整 assistant 文本", async () => {
    const history: ChatMessage[] = [
      { role: "user", content: "上一问" },
      { role: "assistant", content: "上一答" },
    ];
    const runChat = vi.fn().mockResolvedValue("本次完整回答");

    await dispatchReplChat(["--raw", "继续", "分析"], history, runChat);

    expect(runChat).toHaveBeenCalledWith("继续 分析", {
      raw: true,
      history: [
        { role: "user", content: "上一问" },
        { role: "assistant", content: "上一答" },
      ],
    });
    expect(history.slice(-2)).toEqual([
      { role: "user", content: "继续 分析" },
      { role: "assistant", content: "本次完整回答" },
    ]);
  });

  it("自由文本 general-chat 共用历史，quick/report 不写入历史", async () => {
    const history: ChatMessage[] = [];
    const runRawChat = vi.fn().mockResolvedValue("聊天回答");
    const generalDispatch = vi.fn(async (text, options) => {
      await options.onGeneralChat(text);
      return "general-chat" as const;
    });

    await dispatchReplFreeText("聊聊大盘", history, generalDispatch, runRawChat);

    expect(runRawChat).toHaveBeenCalledWith("聊聊大盘", { history: [] });
    expect(history).toEqual([
      { role: "user", content: "聊聊大盘" },
      { role: "assistant", content: "聊天回答" },
    ]);

    const quickDispatch = vi.fn().mockResolvedValue("quick-scan" as const);
    await dispatchReplFreeText("扫描 AAPL", history, quickDispatch, runRawChat);

    expect(history).toHaveLength(2);
  });
});
