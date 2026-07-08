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

  it("general-chat 回落到调用方提供的纯聊天处理器", async () => {
    const classifyIntent = vi.fn().mockResolvedValue({
      intent: "general-chat",
      symbol: null,
      needs_symbol: false,
    });
    const onGeneralChat = vi.fn().mockResolvedValue(undefined);

    vi.doMock("../src/api.js", () => ({
      classifyIntent,
    }));
    vi.doMock("../src/commands/product.js", () => ({
      quickScanCommand: vi.fn(),
      fullReportCommand: vi.fn(),
      deepReportCommand: vi.fn(),
    }));

    const { dispatchNaturalText } = await import("../src/core/natural-dispatch.js");

    await expect(dispatchNaturalText("今天大盘怎么看", { onGeneralChat })).resolves.toBe("general-chat");
    expect(onGeneralChat).toHaveBeenCalledWith("今天大盘怎么看");
  });
});
