import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConversationRuntime } from "../src/core/conversation-runtime.js";
import { ConversationSessionStore } from "../src/core/conversation-session.js";

describe("ConversationRuntime", () => {
  let testDir: string | null = null;

  afterEach(() => {
    if (testDir && existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    testDir = null;
  });

  function createRuntime(): ConversationRuntime {
    testDir = mkdtempSync(join(tmpdir(), "arti-runtime-"));
    const store = new ConversationSessionStore(testDir);
    return new ConversationRuntime(store);
  }

  it("运行对话时传入完整历史和 conversation context，并持久化 usage", async () => {
    const runtime = createRuntime();
    runtime.initialize(30);
    const runner = vi.fn(async (_text, options) => {
      options.onUsage({
        requestId: "req-1",
        model: "claude-sonnet",
        inputTokens: 100,
        outputTokens: 20,
        totalTokens: 120,
        contextWindow: 128_000,
      });
      return "第一轮回答";
    });

    await runtime.runTurn("第一轮问题", runner);
    await runtime.runTurn("继续分析", runner);

    expect(runner.mock.calls[0][1].history).toEqual([]);
    expect(runner.mock.calls[1][1].history).toEqual([
      { role: "user", content: "第一轮问题" },
      { role: "assistant", content: "第一轮回答" },
    ]);
    expect(runner.mock.calls[1][1].conversation).toMatchObject({
      sessionId: runtime.activeSessionId,
      activeSymbols: [],
      artifacts: [],
    });
    expect(runtime.snapshot().messages).toHaveLength(4);
    expect(runtime.snapshot().entry.totalUsage.totalTokens).toBe(240);
  });

  it("/new 创建新会话但不删除旧 transcript，/resume 用前缀恢复历史", async () => {
    const runtime = createRuntime();
    runtime.initialize(30);
    await runtime.runTurn("旧问题", vi.fn().mockResolvedValue("旧回答"));
    const oldSessionId = runtime.activeSessionId as string;

    const newSession = runtime.newSession("新的研究");

    expect(newSession.id).not.toBe(oldSessionId);
    expect(runtime.history()).toEqual([]);
    expect(runtime.listSessions()).toHaveLength(2);

    const resumed = runtime.resume(oldSessionId.slice(0, 12));
    expect(resumed.id).toBe(oldSessionId);
    expect(runtime.history()).toEqual([
      { role: "user", content: "旧问题" },
      { role: "assistant", content: "旧回答" },
    ]);
  });

  it("能力执行后记录活动标的供 /status 和后续上下文使用", () => {
    const runtime = createRuntime();
    runtime.initialize(30);
    runtime.newSession();

    runtime.trackSymbol("nvda");

    expect(runtime.snapshot().entry.activeSymbols).toEqual(["NVDA"]);
    expect(runtime.conversationContext().activeSymbols).toEqual(["NVDA"]);
  });
});
