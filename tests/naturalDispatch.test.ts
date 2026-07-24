import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("dispatchNaturalText", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it("复用 classify-intent 结果派发到 quick scan", async () => {
    const classifyIntent = vi.fn().mockResolvedValue({
      intent: "quick-scan",
      symbol: "02513.HK",
      needs_symbol: false,
    });
    const quickScanCommand = vi.fn().mockResolvedValue(undefined);
    const onGeneralChat = vi.fn();

    vi.doMock("../src/api.js", () => ({
      classifyIntent,
    }));
    vi.doMock("../src/commands/product.js", () => ({
      quickScanCommand,
      fullReportCommand: vi.fn(),
      deepReportCommand: vi.fn(),
    }));

    const { dispatchNaturalText } = await import("../src/core/natural-dispatch.js");

    await expect(dispatchNaturalText("今天的智谱", { onGeneralChat })).resolves.toBe("quick-scan");
    expect(quickScanCommand).toHaveBeenCalledWith("02513.HK");
    expect(onGeneralChat).not.toHaveBeenCalled();
  });

  // L10：识别到能力意图但缺 symbol 时应给出提示，而非完全沉默
  it("intent 命中但 symbol 为空时打印提示且不执行命令", async () => {
    const classifyIntent = vi.fn().mockResolvedValue({
      intent: "quick-scan",
      symbol: null,
      needs_symbol: false,
    });
    const quickScanCommand = vi.fn();
    const onGeneralChat = vi.fn();

    vi.doMock("../src/api.js", () => ({ classifyIntent }));
    vi.doMock("../src/commands/product.js", () => ({
      quickScanCommand,
      fullReportCommand: vi.fn(),
      deepReportCommand: vi.fn(),
    }));

    const { dispatchNaturalText } = await import("../src/core/natural-dispatch.js");

    await expect(dispatchNaturalText("帮我扫一下", { onGeneralChat })).resolves.toBe("quick-scan");
    expect(quickScanCommand).not.toHaveBeenCalled();
    expect(onGeneralChat).not.toHaveBeenCalled();
    // 有可见提示输出，而非沉默
    expect(logSpy).toHaveBeenCalled();
    const printed = logSpy.mock.calls.map(c => String(c[0])).join("\n");
    expect(printed).toMatch(/股票代码|代码或名称/);
  });

  it("general-chat 回落到调用方提供的纯聊天处理器", async () => {
    const classifyIntent = vi.fn().mockResolvedValue({
      intent: "general-chat",
      symbol: null,
      needs_symbol: false,
    });
    const onGeneralChat = vi.fn().mockResolvedValue(undefined);
    const onClassified = vi.fn();

    vi.doMock("../src/api.js", () => ({
      classifyIntent,
    }));
    vi.doMock("../src/commands/product.js", () => ({
      quickScanCommand: vi.fn(),
      fullReportCommand: vi.fn(),
      deepReportCommand: vi.fn(),
    }));

    const { dispatchNaturalText } = await import("../src/core/natural-dispatch.js");

    await expect(dispatchNaturalText("今天大盘怎么看", {
      onGeneralChat,
      onClassified,
    })).resolves.toBe("general-chat");
    expect(onClassified).toHaveBeenCalledWith({
      intent: "general-chat",
      symbol: null,
      needs_symbol: false,
    });
    expect(onGeneralChat).toHaveBeenCalledWith("今天大盘怎么看");
  });
});
