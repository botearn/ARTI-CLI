import { afterEach, describe, expect, it, vi } from "vitest";
import { handleCommand } from "../src/core/handler.js";

describe("command exit code", () => {
  const originalExitCode = process.exitCode;

  afterEach(() => {
    process.exitCode = originalExitCode;
    vi.restoreAllMocks();
  });

  it("命令失败时设置 process.exitCode = 1", async () => {
    process.exitCode = undefined;
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await handleCommand("测试...", async () => {
      throw new Error("boom");
    });

    expect(result).toBeUndefined();
    expect(process.exitCode).toBe(1);
  });

  it("命令成功时不改动 process.exitCode", async () => {
    process.exitCode = undefined;

    const result = await handleCommand("测试...", async () => 42);

    expect(result).toBe(42);
    expect(process.exitCode).toBeUndefined();
  });
});
