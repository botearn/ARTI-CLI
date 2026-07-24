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

  it("JSON 模式下不流式写 stdout，改为结构化输出 answer", async () => {
    async function* fakeStream() {
      yield "美股";
      yield "今天上涨";
    }
    const streamChat = vi.fn(() => fakeStream());
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

    // 结构化输出包含完整 answer
    expect(outputSpy).toHaveBeenCalledTimes(1);
    const payload = outputSpy.mock.calls[0][0] as { answer: string };
    expect(payload.answer).toBe("美股今天上涨");
    expect(result).toBe("美股今天上涨");
    expect(ora).not.toHaveBeenCalled();
  });
});
