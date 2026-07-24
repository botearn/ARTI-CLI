/**
 * REPL 交互模式 — 无参数运行 arti 时进入金融终端
 * 参考 CLI-Anything 的 ReplSkin 设计
 * 支持命令补全、历史记录、连续查询
 */
import * as readline from "node:readline";
import { existsSync, readFileSync, appendFileSync, writeFileSync, renameSync, mkdirSync } from "node:fs";
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
  rawChatCommand,
} from "../commands/chat.js";
import { shutdownBackendMcp } from "../data/mcp-client.js";
import { loadConfig } from "../config.js";
import { ConversationSessionStore } from "./conversation-session.js";
import { ConversationRuntime } from "./conversation-runtime.js";
import {
  formatSessionList,
  formatSessionStatus,
  formatSessionUsage,
} from "./conversation-display.js";
import {
  completeSlashCommands,
  parseReplInput,
  suggestSlashCommands,
} from "./slash.js";
import { requestConversationSummary } from "./conversation-compact.js";
import type { CapabilityExecutionResult } from "./conversation-types.js";

const CONFIG_DIR = join(homedir(), ".config", "arti");
const HISTORY_FILE = join(CONFIG_DIR, "repl_history");
const MAX_HISTORY = 500;

/** 已注册的 REPL 命令 */
interface ReplCommand {
  name: string;
  slashName?: string;
  aliases: string[];
  description: string;
  usage: string;
  category?: string;
  handler: (args: string[]) => Promise<CapabilityExecutionResult | void>;
}

const commands: ReplCommand[] = [];

/** 注册一个 REPL 命令 */
export function registerCommand(cmd: ReplCommand): void {
  commands.push(cmd);
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

// L1：含敏感参数的命令行不写入明文历史（如 login --token <jwt>、config set auth.token <jwt>）
function isSensitiveLine(line: string): boolean {
  const lower = line.toLowerCase();
  if (/(^|\s)--(token|refresh-token|password)(\s|=)/.test(lower)) return true;
  if (/\bconfig\s+set\s+(auth\.(token|refreshtoken)|data\.artidatainternalkey|poly\.apikey)\b/.test(lower)) return true;
  if (/(^|\s)(login|token)\b/.test(lower) && /\beyj[a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+/i.test(line)) return true;
  return false;
}

/** 追加历史记录 */
function appendHistory(line: string): void {
  if (isSensitiveLine(line)) return; // 敏感命令跳过历史，避免 JWT/密码落盘
  try {
    if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
    appendFileSync(HISTORY_FILE, line + "\n");
    trimHistoryIfNeeded();
  } catch {
    // 静默
  }
}

// L12：历史文件超过 2x 上限时截断到最近 MAX_HISTORY 行（原子写），避免无限增长
function trimHistoryIfNeeded(): void {
  try {
    const lines = readFileSync(HISTORY_FILE, "utf-8").split("\n").filter(Boolean);
    if (lines.length <= MAX_HISTORY * 2) return;
    const tmp = `${HISTORY_FILE}.${process.pid}.tmp`;
    writeFileSync(tmp, lines.slice(-MAX_HISTORY).join("\n") + "\n");
    renameSync(tmp, HISTORY_FILE);
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
const CATEGORY_ORDER = ["session", "research", "market", "data", "tools", "account"] as const;
const CATEGORY_LABELS: Record<string, string> = {
  session: "会话", research: "研报", market: "行情", data: "数据", tools: "工具", account: "账户",
};

interface SlashHelpCommand {
  name: string;
  description: string;
  usage: string;
  category: string;
}

const LOCAL_SLASH_COMMANDS: SlashHelpCommand[] = [
  { name: "help", description: "查看快捷命令", usage: "/help [command]", category: "session" },
  { name: "status", description: "查看当前会话和上下文状态", usage: "/status", category: "session" },
  { name: "usage", description: "查看当前轮和累计 Token usage", usage: "/usage", category: "session" },
  { name: "compact", description: "压缩活跃上下文并保留原始会话", usage: "/compact [focus...]", category: "session" },
  { name: "new", description: "新建会话", usage: "/new [title...]", category: "session" },
  { name: "resume", description: "列出或恢复历史会话", usage: "/resume [session]", category: "session" },
  { name: "clear", description: "保存当前会话并开始新会话", usage: "/clear", category: "session" },
  { name: "cls", description: "清空终端屏幕", usage: "/cls", category: "session" },
  { name: "exit", description: "保存并退出", usage: "/exit", category: "session" },
];

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

function getSlashHelpCommands(): SlashHelpCommand[] {
  const capabilityCommands = commands
    .filter(command => command.slashName)
    .map(command => ({
      name: command.slashName as string,
      description: command.description,
      usage: command.usage.replace(/^\S+/, `/${command.slashName}`),
      category: getCategoryForCommand(command.name),
    }));
  return [...LOCAL_SLASH_COMMANDS, ...capabilityCommands];
}

function getAllSlashNames(): string[] {
  return getSlashHelpCommands().map(command => command.name);
}

/** 内置选择器 — 不依赖外部库，不抢占 stdin */
interface SelectItem { name: string; label: string; hint: string; isSep?: boolean }

function buildHelpItems(): SelectItem[] {
  const items: SelectItem[] = [];
  const slashCommands = getSlashHelpCommands();
  for (const cat of CATEGORY_ORDER) {
    const group = slashCommands.filter(command => command.category === cat);
    if (!group.length) continue;
    items.push({ name: "", label: `── ${CATEGORY_LABELS[cat]} ──`, hint: "", isSep: true });
    for (const cmd of group) {
      items.push({ name: cmd.name, label: `/${cmd.name}`, hint: cmd.description });
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

function printSlashCommandHelp(command: SlashHelpCommand): void {
  console.log(`  ${chalk.bold(`/${command.name}`)}`);
  console.log(chalk.dim(`  ${command.description}`));
  console.log(`  ${chalk.dim("用法")}  ${command.usage}`);
  console.log();
}

function printUnknownSlash(name: string): void {
  const suggestions = suggestSlashCommands(name, getAllSlashNames());
  console.error(chalk.red(`  未知快捷命令: /${name}`));
  if (suggestions.length) {
    console.error(chalk.gray(`  你是否想输入: ${suggestions.map(command => `/${command}`).join("、")}`));
  } else {
    console.error(chalk.gray("  输入 / 查看可用快捷命令"));
  }
}

/** 交互式帮助 — ↑↓ 浏览所有 Slash Command，回车查看用法 */
async function printHelp(commandName?: string): Promise<void> {
  if (commandName) {
    const normalized = commandName.replace(/^\//, "").toLowerCase();
    const command = getSlashHelpCommands().find(item => item.name === normalized);
    if (!command) {
      printUnknownSlash(normalized);
      return;
    }
    printSlashCommandHelp(command);
    return;
  }

  const items = buildHelpItems();
  const selected = await interactiveSelect(items);
  if (!selected) return;

  const cmd = getSlashHelpCommands().find(command => command.name === selected);
  if (!cmd) return;

  printSlashCommandHelp(cmd);
}

/** 查找 Slash 对应的统一能力 */
function findSlashCommand(name: string): ReplCommand | undefined {
  return commands.find(command => command.slashName === name);
}

/** 启动 REPL */
export async function startRepl(): Promise<void> {
  // 仅交互终端打印 banner；管道输入/输出时保持安静
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  const who = interactive ? readLocalWho() : null;
  const banner = interactive ? printBanner({ who }) : null;

  const history = loadHistory();
  const config = loadConfig();
  const conversation = new ConversationRuntime(new ConversationSessionStore(
    undefined,
    {
      onWarning: message => console.error(chalk.yellow(`  ⚠ ${message}`)),
    },
  ));
  const cleanup = conversation.initialize(config.session.retentionDays);
  if (cleanup.removedSessionIds.length) {
    console.error(chalk.gray(
      `  已清理 ${cleanup.removedSessionIds.length} 个超过 ${config.session.retentionDays} 天的本地会话`,
    ));
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.cyan("arti> "),
    completer: (line: string) => {
      return [completeSlashCommands(line, getAllSlashNames()), line];
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
    const input = parseReplInput(line);
    if (!input) return false;

    appendHistory(line.trim());
    trackCommand(line.trim());

    if (input.type === "conversation") {
      try {
        await conversation.runTurn(input.text, (text, options) =>
          rawChatCommand(text, options)
        );
      } catch (err) {
        console.error(chalk.red(`  处理失败: ${err instanceof Error ? err.message : String(err)}`));
      }
      console.log();
      return false;
    }

    const { name, args } = input;

    if (!name) {
      await printHelp();
      return false;
    }

    if (name === "exit") {
      if (args.length) {
        console.error(chalk.red("  用法: /exit"));
        return false;
      }
      console.log(chalk.gray("  再见 👋"));
      rl.close();
      await gracefulExit(0);
      return true;
    }

    if (name === "help") {
      if (args.length > 1) {
        console.error(chalk.red("  用法: /help [command]"));
        return false;
      }
      await printHelp(args[0]);
      return false;
    }

    if (name === "status") {
      if (args.length) {
        console.error(chalk.red("  用法: /status"));
        return false;
      }
      for (const line of formatSessionStatus(conversation.snapshot())) {
        console.log(`  ${line}`);
      }
      return false;
    }

    if (name === "usage") {
      if (args.length) {
        console.error(chalk.red("  用法: /usage"));
        return false;
      }
      for (const line of formatSessionUsage(conversation.snapshot())) {
        console.log(`  ${line}`);
      }
      return false;
    }

    if (name === "new") {
      const session = conversation.newSession(args.join(" "));
      console.log(chalk.gray(`  已新建会话 ${session.id}`));
      return false;
    }

    if (name === "compact") {
      try {
        const result = await conversation.compact(
          args.length ? args.join(" ") : undefined,
          requestConversationSummary,
        );
        console.log(chalk.gray(
          `  已压缩 ${result.compactedMessages} 条活跃消息，原始 transcript 保持不变`,
        ));
      } catch (err) {
        console.error(chalk.red(
          `  压缩失败: ${err instanceof Error ? err.message : String(err)}`,
        ));
      }
      return false;
    }

    if (name === "resume") {
      if (args.length > 1) {
        console.error(chalk.red("  用法: /resume [session]"));
        return false;
      }
      if (!args.length) {
        for (const line of formatSessionList(
          conversation.listSessions(),
          conversation.activeSessionId,
        )) {
          console.log(`  ${line}`);
        }
        return false;
      }
      try {
        const session = conversation.resume(args[0]);
        console.log(chalk.gray(`  已恢复会话 ${session.id} · ${session.title}`));
      } catch (err) {
        console.error(chalk.red(`  恢复失败: ${err instanceof Error ? err.message : String(err)}`));
      }
      return false;
    }

    if (name === "clear") {
      if (args.length) {
        console.error(chalk.red("  用法: /clear"));
        return false;
      }
      const session = conversation.newSession();
      console.log(chalk.gray(`  已清空上下文并开始新会话 ${session.id}`));
      return false;
    }

    if (name === "cls") {
      if (args.length) {
        console.error(chalk.red("  用法: /cls"));
        return false;
      }
      console.clear();
      return false;
    }

    const cmd = findSlashCommand(name);
    if (!cmd) {
      printUnknownSlash(name);
      return false;
    }

    try {
      const writesArtifact = ["quick", "full", "deep", "poly"].includes(name);
      const callId = writesArtifact
        ? conversation.beginToolCall(name, { args })
        : undefined;
      const result = await cmd.handler(args);
      if (callId && result?.artifact) {
        conversation.completeToolCall(callId, result.artifact);
      }
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
