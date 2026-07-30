import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("chat natural routing", () => {
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

  it("默认先做自然语言分发，命中 quick-scan 时不走 streamChat", async () => {
    const classifyIntent = vi.fn().mockResolvedValue({
      intent: "quick-scan",
      symbol: "02513.HK",
      needs_symbol: false,
    });
    const streamChat = vi.fn();
    const quickScanCommand = vi.fn().mockResolvedValue(undefined);

    vi.doMock("../src/api.js", () => ({
      classifyIntent,
      streamChat,
    }));
    vi.doMock("../src/commands/product.js", () => ({
      quickScanCommand,
      fullReportCommand: vi.fn(),
      deepReportCommand: vi.fn(),
    }));
    vi.doMock("../src/billing.js", () => ({
      InsufficientCreditsError: class extends Error {},
    }));
    vi.doMock("../src/errors.js", () => ({
      printError: vi.fn(),
    }));
    vi.doMock("../src/tracker.js", () => ({
      track: vi.fn(),
    }));

    const { chatCommand } = await import("../src/commands/chat.js");

    await chatCommand("今天的智谱");

    expect(classifyIntent).toHaveBeenCalledWith("今天的智谱");
    expect(quickScanCommand).toHaveBeenCalledWith("02513.HK");
    expect(streamChat).not.toHaveBeenCalled();
  });

  it("chat --raw 跳过自然语言分发，直接走纯 chat", async () => {
    const classifyIntent = vi.fn();
    const streamChat = vi.fn(async function* () {
      yield "智谱 AI 未上市，暂无行情";
    });

    vi.doMock("../src/api.js", () => ({
      classifyIntent,
      streamChat,
    }));
    vi.doMock("../src/commands/product.js", () => ({
      quickScanCommand: vi.fn(),
      fullReportCommand: vi.fn(),
      deepReportCommand: vi.fn(),
    }));
    vi.doMock("../src/billing.js", () => ({
      InsufficientCreditsError: class extends Error {},
    }));
    vi.doMock("../src/errors.js", () => ({
      printError: vi.fn(),
    }));
    vi.doMock("../src/tracker.js", () => ({
      track: vi.fn(),
    }));

    const { chatCommand } = await import("../src/commands/chat.js");

    await chatCommand("今天的智谱", { raw: true });

    // --raw 直接走纯 chat：不做意图分发，直接把单条 message 发给 streamChat
    expect(classifyIntent).not.toHaveBeenCalled();
    expect(streamChat).toHaveBeenCalledWith(
      [{ role: "user", content: "今天的智谱" }],
      {
        clientCapabilities: { usageEvents: true },
        onUsage: expect.any(Function),
      },
    );
  });

  it("研报意图只返回显式命令，不直接创建可能扣费的任务", async () => {
    const classifyIntent = vi.fn().mockResolvedValue({
      intent: "deep",
      symbol: "NVDA",
      needs_symbol: false,
    });
    const streamChat = vi.fn();
    const fullReportCommand = vi.fn();
    const deepReportCommand = vi.fn();
    const outputSpy = vi.fn();

    vi.doMock("../src/api.js", () => ({
      classifyIntent,
      streamChat,
    }));
    vi.doMock("../src/commands/product.js", () => ({
      quickScanCommand: vi.fn(),
      fullReportCommand,
      deepReportCommand,
    }));
    vi.doMock("../src/output.js", () => ({
      isJsonMode: () => true,
      output: outputSpy,
    }));
    vi.doMock("../src/billing.js", () => ({
      InsufficientCreditsError: class extends Error {},
    }));
    vi.doMock("../src/errors.js", () => ({
      printError: vi.fn(),
    }));
    vi.doMock("../src/tracker.js", () => ({
      track: vi.fn(),
    }));

    const { chatCommand } = await import("../src/commands/chat.js");
    await chatCommand("深度分析 NVDA");

    expect(fullReportCommand).not.toHaveBeenCalled();
    expect(deepReportCommand).not.toHaveBeenCalled();
    expect(streamChat).not.toHaveBeenCalled();
    expect(outputSpy).toHaveBeenCalledWith({
      status: "confirmation_required",
      capability: "deep",
      symbol: "NVDA",
      command: "arti deep NVDA",
    }, expect.any(Function));
  });
});
