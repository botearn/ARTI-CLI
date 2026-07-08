/**
 * REPL 交互模式 — 无参数运行 arti 时进入金融终端
 * 参考 CLI-Anything 的 ReplSkin 设计
 * 支持命令补全、历史记录、连续查询
 */
import * as readline from "node:readline";
import { existsSync, readFileSync, appendFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import chalk from "chalk";
import { trackCommand } from "./session.js";
import { getAuthState, isLoggedIn } from "../auth.js";
import { VERSION } from "../version.js";
import { rawChatCommand } from "../commands/chat.js";
import { dispatchNaturalText } from "./natural-dispatch.js";

const CONFIG_DIR = join(homedir(), ".config", "arti");
const HISTORY_FILE = join(CONFIG_DIR, "repl_history");
const MAX_HISTORY = 500;

/** 已注册的 REPL 命令 */
interface ReplCommand {
  name: string;
  aliases: string[];
  description: string;
  usage: string;
  category?: string;
  handler: (args: string[]) => Promise<void>;
}

const commands: ReplCommand[] = [];

/** 注册一个 REPL 命令 */
export function registerCommand(cmd: ReplCommand): void {
  commands.push(cmd);
}

/** 获取所有命令名（含别名），用于补全 */
function getAllCommandNames(): string[] {
  const names: string[] = [];
  for (const cmd of commands) {
    names.push(cmd.name);
    names.push(...cmd.aliases);
  }
  return names;
}

/** 加载历史记录 */
function loadHistory(): string[] {
  if (!existsSync(HISTORY_FILE)) return [];
  try {
    return readFileSync(HISTORY_FILE, "utf-8").trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

/** 追加历史记录 */
function appendHistory(line: string): void {
  try {
    if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
    appendFileSync(HISTORY_FILE, line + "\n");
  } catch {
    // 静默
  }
}

/** 打印 banner */
function printBanner(): void {
  console.log(chalk.hex("#FFD700").bold(`
   █████╗ ██████╗ ████████╗██╗
  ██╔══██╗██╔══██╗╚══██╔══╝██║
  ███████║██████╔╝   ██║   ██║
  ██╔══██║██╔══██╗   ██║   ██║
  ██║  ██║██║  ██║   ██║   ██║
  ╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝   ╚═╝`));
  console.log(chalk.gray(`  智能投研终端 v${VERSION} — 输入 help 查看命令`));
  printAuthHint();
  console.log();
}

/** 登录态提示 — 仅本地读取 token，无网络请求；失败时静默退回 */
function printAuthHint(): void {
  try {
    const auth = getAuthState();
    if (isLoggedIn(auth)) {
      const who = auth.email || auth.userId || "已登录账户";
      console.log(chalk.gray("  已登录 ") + chalk.green(who));
    } else {
      console.log(
        chalk.gray("  未登录 — 输入 ") + chalk.cyan("login") + chalk.gray(" 开始（浏览器登录）"),
      );
    }
  } catch {
    // 读取登录态失败不应阻塞 REPL 启动
  }
}

/** 命令分组 */
const CATEGORY_ORDER = ["research", "market", "data", "tools", "account"] as const;
const CATEGORY_LABELS: Record<string, string> = {
  research: "研报", market: "行情", data: "数据", tools: "工具", account: "账户",
};

function getCategoryForCommand(name: string): string {
  const map: Record<string, string> = {
    "quick-scan": "research", full: "research", deep: "research",
    research: "research", predict: "research", scan: "research",
    quote: "market", market: "market", watch: "market", watchlist: "market",
    history: "data", crypto: "data", fundamental: "data",
    options: "data", economy: "data", news: "data", search: "data",
    export: "tools", doctor: "tools", credits: "tools",
    insights: "tools", completion: "tools",
    login: "account", logout: "account", whoami: "account",
  };
  return map[name] || "tools";
}

/** 内置选择器 — 不依赖外部库，不抢占 stdin */
interface SelectItem { name: string; label: string; hint: string; isSep?: boolean }

function buildHelpItems(): SelectItem[] {
  const items: SelectItem[] = [];
  for (const cat of CATEGORY_ORDER) {
    const group = commands.filter(cmd => getCategoryForCommand(cmd.name) === cat);
    if (!group.length) continue;
    items.push({ name: "", label: `── ${CATEGORY_LABELS[cat]} ──`, hint: "", isSep: true });
    for (const cmd of group) {
      const aliases = cmd.aliases.length ? `  ${cmd.aliases.join(", ")}` : "";
      items.push({ name: cmd.name, label: cmd.name + aliases, hint: cmd.description });
    }
  }
  return items;
}

function renderSelect(items: SelectItem[], cursor: number, maxVisible: number): string {
  const selectableIndices = items.map((it, i) => it.isSep ? -1 : i).filter(i => i >= 0);
  const cursorSelectIdx = selectableIndices.indexOf(cursor);
  const total = selectableIndices.length;

  let startIdx = 0;
  if (total > maxVisible) {
    startIdx = Math.max(0, Math.min(cursorSelectIdx - Math.floor(maxVisible / 2), total - maxVisible));
  }
  const visibleSelectables = selectableIndices.slice(startIdx, startIdx + maxVisible);

  const lines: string[] = [];
  lines.push(chalk.dim("  ↑↓ 浏览  回车选中  Esc 取消\n"));

  let lastCat = "";
  for (const idx of visibleSelectables) {
    const item = items[idx];
    const catIdx = items.slice(0, idx).findLastIndex(i => i.isSep);
    const catLabel = catIdx >= 0 ? items[catIdx].label : "";
    if (catLabel && catLabel !== lastCat) {
      lines.push(chalk.dim(`  ${catLabel}`));
      lastCat = catLabel;
    }

    if (idx === cursor) {
      lines.push(`  ${chalk.cyan(">")} ${chalk.bold(item.label)}  ${chalk.dim(item.hint)}`);
    } else {
      lines.push(`    ${chalk.dim(item.label)}  ${chalk.dim(item.hint)}`);
    }
  }

  if (total > maxVisible) {
    const pos = cursorSelectIdx + 1;
    lines.push(chalk.dim(`\n  ${pos}/${total}`));
  }

  return lines.join("\n");
}

function interactiveSelect(items: SelectItem[]): Promise<string | null> {
  return new Promise((resolve) => {
    const selectableIndices = items.map((it, i) => it.isSep ? -1 : i).filter(i => i >= 0);
    if (!selectableIndices.length) { resolve(null); return; }

    let cursor = selectableIndices[0];
    const maxVisible = Math.min(selectableIndices.length, (process.stdout.rows || 24) - 6);
    let rendered = "";

    const clear = () => {
      if (rendered) {
        const lineCount = rendered.split("\n").length;
        process.stdout.write(`\x1b[${lineCount}A\x1b[J`);
      }
    };

    const draw = () => {
      clear();
      rendered = renderSelect(items, cursor, maxVisible);
      process.stdout.write(rendered + "\n");
    };

    const cleanup = () => {
      clear();
      process.stdin.removeListener("keypress", onKey);
      if (wasRaw !== undefined) process.stdin.setRawMode(wasRaw);
    };

    const wasRaw = process.stdin.isRaw;
    process.stdin.setRawMode(true);
    readline.emitKeypressEvents(process.stdin);

    const onKey = (_: string, key: readline.Key) => {
      if (!key) return;
      if (key.name === "escape" || (key.ctrl && key.name === "c")) {
        cleanup();
        resolve(null);
        return;
      }
      if (key.name === "return") {
        cleanup();
        resolve(items[cursor].name);
        return;
      }
      if (key.name === "up" || (key.ctrl && key.name === "p")) {
        const idx = selectableIndices.indexOf(cursor);
        if (idx > 0) cursor = selectableIndices[idx - 1];
        draw();
      }
      if (key.name === "down" || (key.ctrl && key.name === "n")) {
        const idx = selectableIndices.indexOf(cursor);
        if (idx < selectableIndices.length - 1) cursor = selectableIndices[idx + 1];
        draw();
      }
    };

    process.stdin.on("keypress", onKey);
    draw();
  });
}

/** 交互式帮助 — ↑↓ 浏览所有命令，回车查看用法 */
async function printHelp(): Promise<void> {
  const items = buildHelpItems();
  const selected = await interactiveSelect(items);
  if (!selected) return;

  const cmd = commands.find(c => c.name === selected);
  if (!cmd) return;

  console.log(`  ${chalk.bold(cmd.name)}${cmd.aliases.length ? chalk.dim(`  (${cmd.aliases.join(", ")})`) : ""}`);
  console.log(chalk.dim(`  ${cmd.description}`));
  console.log(`  ${chalk.dim("用法")}  ${cmd.usage}`);
  console.log();
}

/** 解析输入行为命令和参数 */
function parseLine(line: string): { cmdName: string; args: string[] } | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(/\s+/);
  return { cmdName: parts[0].toLowerCase(), args: parts.slice(1) };
}

/** 查找命令 */
function findCommand(name: string): ReplCommand | undefined {
  return commands.find(c => c.name === name || c.aliases.includes(name));
}

/** 自由文本 → 复用产品意图识别 → 派发到对应能力 */
async function dispatchFreeText(text: string): Promise<void> {
  if (!text) return;
  appendHistory(text);
  trackCommand(text);
  try {
    await dispatchNaturalText(text, { onGeneralChat: rawChatCommand });
  } catch (err) {
    console.error(chalk.red(`  处理失败: ${err instanceof Error ? err.message : String(err)}`));
  }
}

/** 启动 REPL */
export async function startRepl(): Promise<void> {
  printBanner();

  const history = loadHistory();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.cyan("arti> "),
    completer: (line: string) => {
      const allNames = getAllCommandNames();
      const hits = allNames.filter(n => n.startsWith(line.toLowerCase()));
      return [hits.length ? hits : allNames, line];
    },
    history,
    historySize: MAX_HISTORY,
  });

  rl.prompt();

  rl.on("line", async (line: string) => {
    const parsed = parseLine(line);
    if (!parsed) {
      rl.prompt();
      return;
    }

    const { cmdName, args } = parsed;

    // 内置命令
    if (cmdName === "exit" || cmdName === "quit") {
      console.log(chalk.gray("  再见 👋"));
      rl.close();
      process.exit(0);
    }
    if (cmdName === "help" || cmdName === "?" || cmdName === "/") {
      await printHelp();
      rl.prompt();
      return;
    }
    if (cmdName === "clear" || cmdName === "cls") {
      console.clear();
      rl.prompt();
      return;
    }

    // 查找注册命令；非命令则当作自由文本走意图识别
    const cmd = findCommand(cmdName);
    if (!cmd) {
      await dispatchFreeText(line.trim());
      console.log();
      rl.prompt();
      return;
    }

    // 执行命令
    appendHistory(line.trim());
    trackCommand(line.trim());
    try {
      await cmd.handler(args);
    } catch (err) {
      console.error(chalk.red(`  命令执行失败: ${err instanceof Error ? err.message : String(err)}`));
    }

    console.log(); // 命令间空行
    rl.prompt();
  });

  rl.on("close", () => {
    process.exit(0);
  });
}
