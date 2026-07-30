import { stripVTControlCharacters } from "node:util";
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

  it("会话调用附加 conversation、usage capability 和回调", async () => {
    async function* fakeStream() {
      yield "### 原始回答\n";
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
    const answer = await rawChatCommand("继续", {
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
    expect(answer).toBe("### 原始回答\n");
    expect(stdoutSpy.mock.calls.map(call => String(call[0])).join("")).toContain(
      "### 原始回答\n",
    );
  });

  it("终端宽度为零时关闭动态 Loading，但继续请求并输出回答", async () => {
    async function* fakeStream() {
      yield "回答正常返回";
    }
    const streamChat = vi.fn(() => fakeStream());
    const ora = vi.fn();

    Object.defineProperty(process.stdout, "isTTY", {
      configurable: true,
      value: true,
    });
    Object.defineProperty(process.stderr, "isTTY", {
      configurable: true,
      value: true,
    });
    Object.defineProperty(process.stdout, "columns", {
      configurable: true,
      value: 0,
    });
    Object.defineProperty(process.stderr, "columns", {
      configurable: true,
      value: 0,
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
      await expect(rawChatCommand("继续")).resolves.toBe("回答正常返回");

      expect(ora).not.toHaveBeenCalled();
      expect(streamChat).toHaveBeenCalledWith(
        [{ role: "user", content: "继续" }],
        {
          clientCapabilities: { usageEvents: true },
          onUsage: expect.any(Function),
        },
      );
      expect(
        stdoutSpy.mock.calls.map(call => String(call[0])).join(""),
      ).toContain("回答正常返回");
    } finally {
      delete (process.stdout as NodeJS.WriteStream & {
        columns?: number;
        isTTY?: boolean;
      }).columns;
      delete (process.stderr as NodeJS.WriteStream & {
        columns?: number;
        isTTY?: boolean;
      }).columns;
      delete (process.stdout as NodeJS.WriteStream & { isTTY?: boolean }).isTTY;
      delete (process.stderr as NodeJS.WriteStream & { isTTY?: boolean }).isTTY;
    }
  });

  it("TTY 下首个 Token 前显示状态，且 Loading 不接管 REPL stdin", async () => {
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
      yield "### 结";
      yield "论\n**回答** [2]";
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
      const answer = await rawChatCommand("Google 怎么样", {
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
      expect(ora).toHaveBeenCalledWith(expect.objectContaining({
        discardStdin: false,
        text: expect.stringContaining("正在准备会话请求"),
      }));
      expect(spinner.start).toHaveBeenCalledTimes(1);
      expect(spinner.stop).toHaveBeenCalledTimes(1);
      const rendered = stripVTControlCharacters(
        events
          .filter(event => event.startsWith("write:"))
          .map(event => event.slice("write:".length))
          .join(""),
      );
      expect(events.indexOf("stop")).toBeLessThan(
        events.findIndex(event => event.startsWith("write:")),
      );
      expect(rendered).toContain("结论");
      expect(rendered).toContain("回答");
      expect(rendered).toContain("来源 2");
      expect(rendered).not.toContain("###");
      expect(rendered).not.toContain("**");
      expect(answer).toBe("### 结论\n**回答** [2]");

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

  it("TTY 下首段没有换行时立即给出已收到回答的可见反馈", async () => {
    const spinner = {
      text: "",
      start: vi.fn(function (this: unknown) {
        return this;
      }),
      stop: vi.fn(),
      fail: vi.fn(),
    };
    let finishStream: (() => void) | undefined;
    const streamCanFinish = new Promise<void>((resolve) => {
      finishStream = resolve;
    });
    async function* fakeStream() {
      yield "这是首段但还没有换行";
      await streamCanFinish;
    }
    const streamChat = vi.fn(() => fakeStream());

    Object.defineProperty(process.stdout, "isTTY", {
      configurable: true,
      value: true,
    });
    Object.defineProperty(process.stderr, "isTTY", {
      configurable: true,
      value: true,
    });

    vi.doMock("ora", () => ({ default: vi.fn(() => spinner) }));
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
      const pendingAnswer = rawChatCommand("继续");

      await vi.waitFor(() => {
        const rendered = stripVTControlCharacters(
          stdoutSpy.mock.calls.map(call => String(call[0])).join(""),
        );
        expect(rendered).toContain("已收到首段回答");
      });
      finishStream?.();

      await expect(pendingAnswer).resolves.toBe("这是首段但还没有换行");
    } finally {
      delete (process.stdout as NodeJS.WriteStream & { isTTY?: boolean }).isTTY;
      delete (process.stderr as NodeJS.WriteStream & { isTTY?: boolean }).isTTY;
    }
  });

  it("取消当前回答时返回并标记已生成部分，且不把命令记为失败", async () => {
    async function* fakeStream(
      _messages: unknown,
      options?: { signal?: AbortSignal },
    ) {
      yield "已经生成的部分";
      await new Promise<void>((_resolve, reject) => {
        options?.signal?.addEventListener("abort", () => {
          reject(new DOMException("已取消", "AbortError"));
        }, { once: true });
      });
    }
    const streamChat = vi.fn(fakeStream);
    const controller = new AbortController();
    const previousExitCode = process.exitCode;

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
      const pendingAnswer = rawChatCommand("继续", { signal: controller.signal });
      await vi.waitFor(() => expect(stdoutSpy).toHaveBeenCalled());
      controller.abort();

      await expect(pendingAnswer).resolves.toBe("已经生成的部分\n\n[回答中断]");
      expect(process.exitCode).toBe(previousExitCode);
      expect(streamChat).toHaveBeenCalledWith(
        [{ role: "user", content: "继续" }],
        expect.objectContaining({ signal: controller.signal }),
      );
    } finally {
      process.exitCode = previousExitCode;
    }
  });

  it("TTY 请求失败时说明问题已保存但没有收到回答", async () => {
    const spinner = {
      text: "",
      start: vi.fn(function (this: unknown) {
        return this;
      }),
      stop: vi.fn(),
      fail: vi.fn(),
    };
    const ora = vi.fn(() => spinner);
    async function* fakeStream() {
      throw new Error("登录已过期");
    }
    const streamChat = vi.fn(() => fakeStream());
    const printError = vi.fn();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const previousExitCode = process.exitCode;

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
      isJsonMode: () => false,
      output: vi.fn(),
    }));
    vi.doMock("../src/billing.js", () => ({
      InsufficientCreditsError: class extends Error {},
    }));
    vi.doMock("../src/errors.js", () => ({ printError }));
    vi.doMock("../src/tracker.js", () => ({ track: vi.fn() }));
    vi.doMock("../src/core/natural-dispatch.js", () => ({ dispatchNaturalText: vi.fn() }));

    try {
      const { rawChatCommand } = await import("../src/commands/chat.js");
      await rawChatCommand("继续分析", {
        history: [],
        conversation: {
          schemaVersion: 1,
          mode: "client-managed",
          sessionId: "session_12345678",
          activeSymbols: [],
          artifacts: [],
        },
      });

      expect(spinner.fail).toHaveBeenCalledWith(
        expect.stringContaining("普通对话未完成"),
      );
      expect(printError).toHaveBeenCalledWith(expect.any(Error));
      expect(logSpy.mock.calls.map(call => String(call[0])).join("\n")).toContain(
        "本轮问题已保存在当前 Session，但没有收到回答",
      );
    } finally {
      process.exitCode = previousExitCode;
      delete (process.stdout as NodeJS.WriteStream & { isTTY?: boolean }).isTTY;
      delete (process.stderr as NodeJS.WriteStream & { isTTY?: boolean }).isTTY;
    }
  });
});
