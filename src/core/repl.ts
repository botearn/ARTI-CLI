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
import { printBanner, renderStatusContent, type PrintedBanner } from "./banner.js";
import { getActiveBillingState } from "../billing.js";
import { checkForUpdate, formatUpdateNotice } from "../update-check.js";
import {
  chatCommand,
  rawChatCommand,
  type ChatCommandOptions,
  type ChatMessage,
} from "../commands/chat.js";
import {
  dispatchNaturalText,
  type NaturalDispatchOptions,
  type NaturalDispatchResult,
} from "./natural-dispatch.js";
import { shutdownBackendMcp } from "../data/mcp-client.js";

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

/** 加载历史记录（文件为旧→新顺序，readline 期望 history[0] 为最新，故 reverse） */
function loadHistory(): string[] {
  if (!existsSync(HISTORY_FILE)) return [];
  try {
    return readFileSync(HISTORY_FILE, "utf-8").trim().split("\n").filter(Boolean).reverse();
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

/** 本地读取登录身份（email 或 userId）；未登录/读取失败返回 null，不发起网络请求 */
function readLocalWho(): string | null {
  try {
    const auth = getAuthState();
    if (!isLoggedIn(auth)) return null;
    return auth.email || auth.userId || "已登录账户";
  } catch {
    return null;
  }
}

/** 在 prompt 上方插入一行（保留当前输入），用于异步更新提示 */
function insertLineAbovePrompt(rl: readline.Interface, text: string): void {
  readline.cursorTo(process.stdout, 0);
  readline.clearLine(process.stdout, 0);
  process.stdout.write(text + "\n");
  rl.prompt(true);
}

/** 就地重写 banner 中的状态行（余额回填）。仅在 banner 之后尚无新输出时调用 */
function rewriteBannerStatus(rl: readline.Interface, banner: PrintedBanner, content: string): void {
  if (banner.statusLineIndex < 0) return;
  const up = banner.totalLines - banner.statusLineIndex;
  readline.moveCursor(process.stdout, 0, -up);
  readline.cursorTo(process.stdout, 0);
  readline.clearLine(process.stdout, 0);
  process.stdout.write(content);
  readline.moveCursor(process.stdout, 0, up);
  readline.cursorTo(process.stdout, 0);
  readline.clearLine(process.stdout, 0);
  rl.prompt(true);
}

/** banner 异步信息：更新提示（网络检查）+ 余额回填。canUpdate 不满足时静默丢弃 */
function wireBannerAsyncInfo(
  rl: readline.Interface,
  banner: PrintedBanner,
  who: string | null,
  canUpdate: () => boolean,
): void {
  void checkForUpdate(VERSION, (latest) => {
    if (canUpdate()) insertLineAbovePrompt(rl, formatUpdateNotice(VERSION, latest));
  });
  if (who) {
    void getActiveBillingState()
      .then((state) => {
        if (canUpdate()) rewriteBannerStatus(rl, banner, renderStatusContent(who, state));
      })
      .catch(() => {
        if (canUpdate()) rewriteBannerStatus(rl, banner, renderStatusContent(who, "error"));
      });
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

    // 非 TTY（管道/重定向）下 setRawMode 不存在，退化为纯文本列表，不进入键盘交互
    if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== "function") {
      for (const it of items) {
        if (it.isSep) continue;
        console.log(`  ${it.label}${it.hint ? chalk.dim(`  ${it.hint}`) : ""}`);
      }
      resolve(null);
      return;
    }

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

const MAX_CHAT_MESSAGES = 12;

type NaturalDispatcher = (
  text: string,
  options: NaturalDispatchOptions,
) => Promise<NaturalDispatchResult | undefined>;
type RawChatRunner = (
  message: string,
  options?: Pick<ChatCommandOptions, "history">,
) => Promise<string | undefined>;
type ChatRunner = (
  message: string,
  options?: ChatCommandOptions,
) => Promise<string | undefined>;

export function appendChatTurn(
  history: ChatMessage[],
  userText: string,
  assistantText: string,
): void {
  history.push(
    { role: "user", content: userText },
    { role: "assistant", content: assistantText },
  );
  if (history.length > MAX_CHAT_MESSAGES) {
    history.splice(0, history.length - MAX_CHAT_MESSAGES);
  }
}

export function clearChatHistory(history: ChatMessage[]): void {
  history.splice(0, history.length);
}

export async function dispatchReplChat(
  args: string[],
  history: ChatMessage[],
  runChat: ChatRunner = chatCommand,
): Promise<void> {
  const raw = args.includes("--raw");
  const text = args.filter(arg => arg !== "--raw").join(" ").trim();
  const assistantText = await runChat(text, { raw, history: [...history] });
  if (assistantText) appendChatTurn(history, text, assistantText);
}

/** 自由文本 → 复用产品意图识别 → 派发到对应能力 */
export async function dispatchReplFreeText(
  text: string,
  history: ChatMessage[],
  dispatch: NaturalDispatcher = dispatchNaturalText,
  runRawChat: RawChatRunner = rawChatCommand,
): Promise<void> {
  if (!text) return;
  appendHistory(text);
  trackCommand(text);
  try {
    await dispatch(text, {
      onGeneralChat: async (chatText) => {
        const assistantText = await runRawChat(chatText, { history: [...history] });
        if (assistantText) appendChatTurn(history, chatText, assistantText);
      },
    });
  } catch (err) {
    console.error(chalk.red(`  处理失败: ${err instanceof Error ? err.message : String(err)}`));
  }
}

/** 启动 REPL */
export async function startRepl(): Promise<void> {
  // 仅交互终端打印 banner；管道输入/输出时保持安静
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  const who = interactive ? readLocalWho() : null;
  const banner = interactive ? printBanner({ who }) : null;

  const history = loadHistory();
  const chatHistory: ChatMessage[] = [];

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

  // 仅当 banner 之后尚无新输出、且用户未在输入时，允许异步回填（余额/更新提示）
  let bannerFresh = banner !== null;
  if (banner) {
    wireBannerAsyncInfo(rl, banner, who, () => bannerFresh && rl.line.length === 0);
  }

  // M-C9：退出前 graceful 关闭 backend MCP 连接。幂等 + 防重入。
  let exiting = false;
  const gracefulExit = async (code: number): Promise<void> => {
    if (exiting) return;
    exiting = true;
    try {
      await shutdownBackendMcp();
    } catch {
      // 关闭失败不阻塞退出
    }
    process.exit(code);
  };

  rl.prompt();

  // 处理单行输入。返回 true 表示已触发退出（调用方不应再 prompt）。
  const processLine = async (line: string): Promise<boolean> => {
    bannerFresh = false;
    const parsed = parseLine(line);
    if (!parsed) return false;

    const { cmdName, args } = parsed;
    const wholeLine = args.length === 0; // L11：无参内置命令仅在整行匹配时触发

    // 内置命令（仅整行匹配，避免 "exit 仓位" / "help 分析茅台" 误触发）
    if (wholeLine && (cmdName === "exit" || cmdName === "quit")) {
      console.log(chalk.gray("  再见 👋"));
      rl.close();
      await gracefulExit(0);
      return true;
    }
    if (wholeLine && (cmdName === "help" || cmdName === "?" || cmdName === "/")) {
      await printHelp();
      return false;
    }
    if (wholeLine && ["clear", "cls", "/clear", "reset"].includes(cmdName)) {
      clearChatHistory(chatHistory);
      console.clear();
      return false;
    }

    if (["chat", "c", "ask"].includes(cmdName)) {
      appendHistory(line.trim());
      trackCommand(line.trim());
      await dispatchReplChat(args, chatHistory);
      console.log();
      return false;
    }

    // 查找注册命令；非命令则当作自由文本走意图识别
    const cmd = findCommand(cmdName);
    if (!cmd) {
      await dispatchReplFreeText(line.trim(), chatHistory);
      console.log();
      return false;
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
    return false;
  };

  // M-C4：命令执行期间继续到达的输入行进入队列，串行处理，避免并发竞态与输出交错
  const pending: string[] = [];
  let processing = false;
  const drain = async (): Promise<void> => {
    if (processing) return;
    processing = true;
    try {
      while (pending.length) {
        const next = pending.shift() as string;
        const exited = await processLine(next);
        if (exited) return; // 已退出，停止处理
      }
    } finally {
      processing = false;
    }
    rl.prompt();
  };

  rl.on("line", (line: string) => {
    pending.push(line);
    void drain();
  });

  rl.on("close", () => {
    void gracefulExit(0);
  });
}
