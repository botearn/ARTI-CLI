/**
 * 统一命令注册表 — 消除 Commander / REPL 双重注册
 *
 * 每个命令只定义一次，同时驱动 CLI 和 REPL 模式。
 * REPL 参数解析通过 OptionDef 声明式描述，自动提取。
 */

/** 选项定义 */
export interface OptionDef {
  short: string;          // 如 "-l"
  long: string;           // 如 "--limit"
  key: string;            // 映射到 options 对象的键名
  type: "string" | "boolean";
  defaultValue?: string;
}

/** 解析后的 REPL 参数 */
export interface ParsedArgs {
  positional: string[];
  options: Record<string, string | boolean | undefined>;
}

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
