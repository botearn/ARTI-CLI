/**
 * 命令参数验证测试
 * 覆盖：空 symbol 时各命令的提示行为
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("参数验证 — 空 symbol 提示", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it("scanCommand 无参数时提示用法", async () => {
    const { scanCommand } = await import("../src/commands/scan.js");
    await scanCommand("");
    expect(logSpy).toHaveBeenCalled();
    const msg = logSpy.mock.calls[0][0] as string;
    expect(msg).toContain("请提供股票代码");
  });

  it("predictCommand 无参数时提示用法", async () => {
    const { predictCommand } = await import("../src/commands/predict.js");
    await predictCommand("");
    expect(logSpy).toHaveBeenCalled();
    const msg = logSpy.mock.calls[0][0] as string;
    expect(msg).toContain("请提供股票代码");
  });

  it("quoteCommand 空数组时提示用法", async () => {
    const { quoteCommand } = await import("../src/commands/quote.js");
    await quoteCommand([]);
    expect(logSpy).toHaveBeenCalled();
    const msg = logSpy.mock.calls[0][0] as string;
    expect(msg).toContain("请提供股票代码");
  });

  it("researchCommand 无参数时提示用法", async () => {
    const { researchCommand } = await import("../src/commands/research.js");
    await researchCommand("", {});
    expect(logSpy).toHaveBeenCalled();
    const msg = logSpy.mock.calls[0][0] as string;
    expect(msg).toContain("请提供股票代码");
  });

  it("quickScanCommand 无参数时提示用法", async () => {
    const { quickScanCommand } = await import("../src/commands/product.js");
    await quickScanCommand("");
    expect(logSpy).toHaveBeenCalled();
    const msg = logSpy.mock.calls[0][0] as string;
    expect(msg).toContain("请提供股票代码");
    expect(msg).toContain("quick-scan");
  });

  it("fullReportCommand 无参数时提示用法", async () => {
    const { fullReportCommand } = await import("../src/commands/product.js");
    await fullReportCommand("");
    expect(logSpy).toHaveBeenCalled();
    const msg = logSpy.mock.calls[0][0] as string;
    expect(msg).toContain("请提供股票代码");
    expect(msg).toContain("arti full");
  });

  it("deepReportCommand 无参数时提示用法", async () => {
    const { deepReportCommand } = await import("../src/commands/product.js");
    await deepReportCommand("");
    expect(logSpy).toHaveBeenCalled();
    const msg = logSpy.mock.calls[0][0] as string;
    expect(msg).toContain("请提供股票代码");
    expect(msg).toContain("arti deep");
  });
});
