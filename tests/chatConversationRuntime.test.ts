import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("rawChatCommand conversation runtime", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("只在会话调用时附加 conversation、usage capability 和回调", async () => {
    async function* fakeStream() {
      yield "回答";
    }
    const streamChat = vi.fn(() => fakeStream());
    const onUsage = vi.fn();

    vi.doMock("../src/api.js", () => ({ streamChat }));
    vi.doMock("../src/output.js", () => ({
      isJsonMode: () => false,
      output: vi.fn(),
    }));
    vi.doMock("../src/billing.js", () => ({
      InsufficientCreditsError: class extends Error {},
    }));
    vi.doMock("../src/errors.js", () => ({ printError: vi.fn() }));
    vi.doMock("../src/tracker.js", () => ({ track: vi.fn() }));
    vi.doMock("../src/core/natural-dispatch.js", () => ({ dispatchNaturalText: vi.fn() }));

    const { rawChatCommand } = await import("../src/commands/chat.js");
    await rawChatCommand("继续", {
      history: [{ role: "assistant", content: "上一轮" }],
      conversation: {
        schemaVersion: 1,
        mode: "client-managed",
        sessionId: "session_12345678",
        activeSymbols: ["NVDA"],
        artifacts: [],
      },
      onUsage,
    });

    expect(streamChat).toHaveBeenCalledWith(
      [
        { role: "assistant", content: "上一轮" },
        { role: "user", content: "继续" },
      ],
      {
        conversation: {
          schemaVersion: 1,
          mode: "client-managed",
          sessionId: "session_12345678",
          activeSymbols: ["NVDA"],
          artifacts: [],
        },
        clientCapabilities: { usageEvents: true },
        onUsage: expect.any(Function),
      },
    );

    const streamOptions = streamChat.mock.calls[0][1];
    const usage = {
      requestId: "req-1",
      inputTokens: 10,
      outputTokens: 2,
      totalTokens: 12,
    };
    streamOptions.onUsage(usage);
    expect(onUsage).toHaveBeenCalledWith(usage);
  });

  it("TTY 下首个 Token 前显示状态，停止 Loading 后再输出正文和能力引导", async () => {
    const events: string[] = [];
    const spinner = {
      text: "",
      start: vi.fn(function (this: unknown) {
        events.push("start");
        return this;
      }),
      stop: vi.fn(() => {
        events.push("stop");
      }),
      fail: vi.fn(),
    };
    const ora = vi.fn(() => spinner);
    async function* fakeStream() {
      yield "回答";
    }
    const streamChat = vi.fn(() => fakeStream());
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    Object.defineProperty(process.stdout, "isTTY", {
      configurable: true,
      value: true,
    });
    Object.defineProperty(process.stderr, "isTTY", {
      configurable: true,
      value: true,
    });
    stdoutSpy.mockImplementation((chunk) => {
      events.push(`write:${String(chunk)}`);
      return true;
    });

    vi.doMock("ora", () => ({ default: ora }));
    vi.doMock("../src/api.js", () => ({ streamChat }));
    vi.doMock("../src/output.js", () => ({
      isJsonMode: () => false,
      output: vi.fn(),
    }));
    vi.doMock("../src/billing.js", () => ({
      InsufficientCreditsError: class extends Error {},
    }));
    vi.doMock("../src/errors.js", () => ({ printError: vi.fn() }));
    vi.doMock("../src/tracker.js", () => ({ track: vi.fn() }));
    vi.doMock("../src/core/natural-dispatch.js", () => ({ dispatchNaturalText: vi.fn() }));

    try {
      const { rawChatCommand } = await import("../src/commands/chat.js");
      await rawChatCommand("Google 怎么样", {
        history: [],
        conversation: {
          schemaVersion: 1,
          mode: "client-managed",
          sessionId: "session_12345678",
          activeSymbols: [],
          artifacts: [],
        },
      });

      expect(ora).toHaveBeenCalled();
      expect(spinner.start).toHaveBeenCalledTimes(1);
      expect(spinner.stop).toHaveBeenCalledTimes(1);
      expect(events.indexOf("stop")).toBeLessThan(events.indexOf("write:回答"));

      const printed = logSpy.mock.calls.map(call => String(call[0])).join("\n");
      expect(printed).toContain("普通对话完成");
      expect(printed).toContain("/quick <代码>");
      expect(printed).toContain("/full <代码>");
      expect(printed).toContain("/deep <代码>");
    } finally {
      delete (process.stdout as NodeJS.WriteStream & { isTTY?: boolean }).isTTY;
      delete (process.stderr as NodeJS.WriteStream & { isTTY?: boolean }).isTTY;
    }
  });
});
