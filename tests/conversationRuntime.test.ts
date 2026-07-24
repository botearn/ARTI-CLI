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

  it("/compact 写入 summary boundary，保留原 transcript 并缩小活跃上下文", async () => {
    const runtime = createRuntime();
    runtime.initialize(30);
    await runtime.runTurn("分析 NVDA", vi.fn().mockResolvedValue("基本面稳健"));
    await runtime.runTurn("主要风险呢", vi.fn().mockResolvedValue("估值偏高"));
    const compactRunner = vi.fn().mockResolvedValue({
      goal: "评估 NVDA",
      activeSymbols: ["NVDA"],
      facts: [{ text: "估值处于高位", asOf: "2026-07-24" }],
      conclusions: ["基本面稳健"],
      risks: ["估值偏高"],
      assumptions: [],
      unresolvedQuestions: [],
      artifactIds: [],
    });

    const result = await runtime.compact("保留风险", compactRunner);

    expect(compactRunner.mock.calls[0][0]).toMatchObject({
      focus: "保留风险",
      messages: [
        { role: "user", content: "分析 NVDA" },
        { role: "assistant", content: "基本面稳健" },
        { role: "user", content: "主要风险呢" },
        { role: "assistant", content: "估值偏高" },
      ],
    });
    expect(result.compactedMessages).toBe(4);
    expect(runtime.snapshot().messages).toHaveLength(4);
    expect(runtime.snapshot().contextMessages).toEqual([]);
    expect(runtime.conversationContext().summary?.risks).toEqual(["估值偏高"]);
  });

  it("重启恢复 compact 后的 summary，只加载 boundary 后的消息", async () => {
    const runtime = createRuntime();
    runtime.initialize(30);
    await runtime.runTurn("分析 NVDA", vi.fn().mockResolvedValue("基本面稳健"));
    const sessionId = runtime.activeSessionId as string;
    await runtime.compact(undefined, vi.fn().mockResolvedValue({
      goal: "评估 NVDA",
      activeSymbols: ["NVDA"],
      facts: [],
      conclusions: ["基本面稳健"],
      risks: [],
      assumptions: [],
      unresolvedQuestions: [],
      artifactIds: [],
    }));

    const restarted = new ConversationRuntime(
      new ConversationSessionStore(testDir as string),
    );
    restarted.initialize(30);
    restarted.resume(sessionId);

    expect(restarted.history()).toEqual([]);
    expect(restarted.conversationContext().summary?.goal).toBe("评估 NVDA");
    const runner = vi.fn().mockResolvedValue("继续回答");
    await restarted.runTurn("继续", runner);
    expect(runner.mock.calls[0][1].history).toEqual([]);
    expect(runner.mock.calls[0][1].conversation.summary?.conclusions).toEqual([
      "基本面稳健",
    ]);
  });

  it("/compact 失败时不写 summary、不改变活跃上下文", async () => {
    const runtime = createRuntime();
    runtime.initialize(30);
    await runtime.runTurn("保留这句话", vi.fn().mockResolvedValue("会保留"));
    const before = runtime.history();

    await expect(runtime.compact(
      undefined,
      vi.fn().mockRejectedValue(new Error("结构化摘要无效")),
    )).rejects.toThrow("结构化摘要无效");

    expect(runtime.history()).toEqual(before);
    expect(runtime.snapshot().lastSummary).toBeUndefined();
  });

  it("空会话不发起可能计费的 compact 请求", async () => {
    const runtime = createRuntime();
    runtime.initialize(30);
    runtime.newSession();
    const runner = vi.fn();

    await expect(runtime.compact(undefined, runner)).rejects.toThrow(
      "没有可压缩内容",
    );
    expect(runner).not.toHaveBeenCalled();
  });

  it("能力原文进入 Artifact，conversation context 只包含 digest", () => {
    const runtime = createRuntime();
    runtime.initialize(30);
    runtime.newSession();
    const callId = runtime.beginToolCall("quick", { symbol: "NVDA" });

    const artifact = runtime.completeToolCall(callId, {
      type: "quick_scan",
      symbol: "NVDA",
      digest: "NVDA 快速扫描摘要",
      payload: { privateLargePayload: "完整原文" },
    });

    expect(runtime.snapshot().artifacts[0].payload).toEqual({
      privateLargePayload: "完整原文",
    });
    expect(runtime.conversationContext().artifacts).toEqual([{
      id: artifact.id,
      type: "quick_scan",
      digest: "NVDA 快速扫描摘要",
    }]);
    expect(JSON.stringify(runtime.conversationContext())).not.toContain("完整原文");
  });
});
