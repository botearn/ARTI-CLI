import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// L13：chat --json 应输出结构化 JSON，而非流式纯文本。
describe("rawChatCommand JSON 模式", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it("JSON 模式下不流式写 stdout，并输出服务端返回的模型与 Token usage", async () => {
    async function* fakeStream(
      _messages: unknown,
      options?: {
        onUsage?: (usage: {
          requestId: string;
          model: string;
          inputTokens: number;
          outputTokens: number;
          cachedInputTokens: number;
          totalTokens: number;
        }) => void;
      },
    ) {
      options?.onUsage?.({
        requestId: "req-json",
        model: "claude-sonnet",
        inputTokens: 120,
        outputTokens: 30,
        cachedInputTokens: 20,
        totalTokens: 150,
      });
      yield "美股";
      yield "今天上涨";
    }
    const streamChat = vi.fn(fakeStream);
    const outputSpy = vi.fn();
    const ora = vi.fn();

    Object.defineProperty(process.stdout, "isTTY", {
      configurable: true,
      value: true,
    });
    Object.defineProperty(process.stderr, "isTTY", {
      configurable: true,
      value: true,
    });

    vi.doMock("ora", () => ({ default: ora }));
    vi.doMock("../src/api.js", () => ({ streamChat }));
    vi.doMock("../src/output.js", () => ({
      isJsonMode: () => true,
      output: outputSpy,
    }));
    vi.doMock("../src/billing.js", () => ({
      InsufficientCreditsError: class extends Error {},
    }));
    vi.doMock("../src/errors.js", () => ({ printError: vi.fn() }));
    vi.doMock("../src/tracker.js", () => ({ track: vi.fn() }));
    vi.doMock("../src/core/natural-dispatch.js", () => ({ dispatchNaturalText: vi.fn() }));

    let result: string | undefined;
    try {
      const { rawChatCommand } = await import("../src/commands/chat.js");
      result = await rawChatCommand("美股怎么样");
    } finally {
      delete (process.stdout as NodeJS.WriteStream & { isTTY?: boolean }).isTTY;
      delete (process.stderr as NodeJS.WriteStream & { isTTY?: boolean }).isTTY;
    }

    // 流式增量不应写入 stdout
    const streamed = stdoutSpy.mock.calls.map(c => String(c[0])).join("");
    expect(streamed).not.toContain("美股");
    expect(streamed).not.toContain("今天上涨");

    // 结构化输出包含完整 answer 与服务端权威 metadata
    expect(outputSpy).toHaveBeenCalledTimes(1);
    expect(outputSpy.mock.calls[0][0]).toEqual({
      answer: "美股今天上涨",
      requestId: "req-json",
      model: "claude-sonnet",
      usage: {
        inputTokens: 120,
        outputTokens: 30,
        cachedInputTokens: 20,
        totalTokens: 150,
      },
    });
    expect(streamChat).toHaveBeenCalledWith(
      [{ role: "user", content: "美股怎么样" }],
      {
        clientCapabilities: { usageEvents: true },
        onUsage: expect.any(Function),
      },
    );
    expect(result).toBe("美股今天上涨");
    expect(ora).not.toHaveBeenCalled();
  });
});
