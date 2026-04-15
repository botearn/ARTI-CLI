/**
 * 统一命令注册表 — 消除 Commander / REPL 双重注册
 *
 * 每个命令只定义一次 CommandDef，同时驱动 CLI 和 REPL 模式。
 */
import type { Command } from "commander";
import chalk from "chalk";
import { registerCommand } from "./repl.js";

// ── 类型定义 ──

/** 选项定义 */
export interface OptionDef {
  short: string;          // 如 "-l"（无短名传空串）
  long: string;           // 如 "--limit"
  key: string;            // 映射到 options 对象的键名
  type: "string" | "boolean";
  defaultValue?: string;
  desc?: string;          // Commander 帮助描述
  hint?: string;          // 值占位符，如 "<n>"
}

/** Commander 参数定义 */
export interface ArgSpec {
  spec: string;           // Commander 格式: "<symbol>", "[sub]", "<symbols...>"
  desc: string;
}

/** 解析后的参数 */
export interface ParsedArgs {
  positional: string[];
  options: Record<string, string | boolean | undefined>;
}

/** 统一命令定义 — 一次定义，驱动 CLI + REPL */
export interface CommandDef {
  name: string;
  aliases: string[];
  description: string;
  usage: string;           // REPL 帮助行
  args: ArgSpec[];         // Commander 参数
  options: OptionDef[];
  examples: string[];      // 帮助文本示例行
  invoke: (parsed: ParsedArgs) => Promise<void>;
}

// ── REPL 参数解析 ──

/**
 * 通用 REPL 参数解析：从 args 数组中提取 option flags 和 positional args
 */
export function parseArgs(args: string[], defs: OptionDef[]): ParsedArgs {
  const options: Record<string, string | boolean | undefined> = {};
  const consumed = new Set<number>();

  for (const def of defs) {
    const idx = Math.max(args.indexOf(def.short), args.indexOf(def.long));
    if (idx === -1) {
      if (def.defaultValue !== undefined) options[def.key] = def.defaultValue;
      continue;
    }
    consumed.add(idx);
    if (def.type === "boolean") {
      options[def.key] = true;
    } else {
      const valIdx = idx + 1;
      if (valIdx < args.length) {
        options[def.key] = args[valIdx];
        consumed.add(valIdx);
      }
    }
  }

  const positional = args.filter((_, i) => !consumed.has(i));
  return { positional, options };
}

// ── 自动注册 ──

/** 将 CommandDef 数组注册到 Commander 程序 */
export function buildCli(program: Command, defs: CommandDef[]): void {
  for (const def of defs) {
    const cmd = program.command(def.name).description(def.description);
    for (const arg of def.args) cmd.argument(arg.spec, arg.desc);
    for (const opt of def.options) {
      const flag = [opt.short, `${opt.long}${opt.hint ? ` ${opt.hint}` : ""}`]
        .filter(Boolean)
        .join(", ");
      if (opt.type === "boolean") {
        cmd.option(flag, opt.desc ?? "");
      } else {
        cmd.option(flag, opt.desc ?? "", opt.defaultValue);
      }
    }
    if (def.examples.length) {
      cmd.addHelpText(
        "after",
        "\n示例:\n" + def.examples.map((e) => `  ${e}`).join("\n"),
      );
    }
    // 参数错误时自动显示完整帮助（含示例）
    cmd.showHelpAfterError(true);

    // Commander action → ParsedArgs → invoke
    cmd.action((...cliArgs: any[]) => {
      cliArgs.pop(); // Command instance
      const opts = cliArgs.pop(); // Commander options object
      const positional: string[] = cliArgs.flat().filter((v: any) => v != null);
      const options: Record<string, string | boolean | undefined> = {};
      for (const o of def.options) {
        options[o.key] = opts[o.key] ?? o.defaultValue;
      }
      return def.invoke({ positional, options });
    });
  }
}

/** 将 CommandDef 数组注册到 REPL */
export function buildRepl(defs: CommandDef[]): void {
  for (const def of defs) {
    registerCommand({
      name: def.name,
      aliases: def.aliases,
      description: def.description,
      usage: def.usage,
      handler: (args) => def.invoke(parseArgs(args, def.options)),
    });
  }
}
