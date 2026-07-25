import { beforeEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";

const registerCommand = vi.fn();

vi.mock("../src/core/repl.js", () => ({ registerCommand }));

describe("统一命令注册表的 Slash 映射", () => {
  beforeEach(() => {
    registerCommand.mockClear();
  });

  it("把 slashName 传给 REPL，能力实现仍复用同一个 invoke", async () => {
    const invoke = vi.fn().mockResolvedValue(undefined);
    const { buildRepl } = await import("../src/core/registry.js");

    buildRepl([
      {
        name: "quick-scan",
        slashName: "quick",
        aliases: ["quick", "qs"],
        description: "快速研判",
        usage: "quick-scan <symbol>",
        args: [{ spec: "<symbol>", desc: "股票代码" }],
        options: [],
        examples: [],
        invoke,
      },
    ]);

    expect(registerCommand).toHaveBeenCalledWith(expect.objectContaining({
      name: "quick-scan",
      slashName: "quick",
    }));

    const registered = registerCommand.mock.calls[0][0];
    await registered.handler(["AAPL"]);

    expect(invoke).toHaveBeenCalledWith({
      positional: ["AAPL"],
      options: {},
    });
  });

  it("Commander 等待 invoke 完成并忽略只供 REPL 使用的返回值", async () => {
    const invoke = vi.fn().mockResolvedValue({
      json: { symbol: "AAPL" },
    });
    const { buildCli } = await import("../src/core/registry.js");
    const program = new Command();

    buildCli(program, [{
      name: "quick-scan",
      aliases: ["quick"],
      description: "快速研判",
      usage: "quick-scan <symbol>",
      args: [{ spec: "<symbol>", desc: "股票代码" }],
      options: [],
      examples: [],
      invoke,
    }]);

    await expect(program.parseAsync(["node", "arti", "quick-scan", "AAPL"])).resolves.toBe(program);
    expect(invoke).toHaveBeenCalledWith({
      positional: ["AAPL"],
      options: {},
    });
  });
});
