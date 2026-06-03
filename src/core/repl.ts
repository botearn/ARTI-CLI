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
import * as clack from "@clack/prompts";
import { trackCommand } from "./session.js";
import { getAuthState, isLoggedIn } from "../auth.js";
import { VERSION } from "../version.js";

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

/** 命令分组定义 */
const CATEGORIES: { key: string; label: string; icon: string }[] = [
  { key: "research", label: "研报", icon: "📊" },
  { key: "market", label: "行情", icon: "📈" },
  { key: "data", label: "数据", icon: "🗂️" },
  { key: "tools", label: "工具", icon: "🔧" },
  { key: "account", label: "账户", icon: "👤" },
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

/** 交互式帮助菜单 */
async function printHelp(): Promise<void> {
  const category = await clack.select({
    message: "选择命令分类（↑↓ 移动，回车确认，Ctrl+C 取消）",
    options: CATEGORIES.map(c => {
      const group = commands.filter(cmd => getCategoryForCommand(cmd.name) === c.key);
      const names = group.map(cmd => cmd.name).join(", ");
      return { value: c.key, label: `${c.icon}  ${c.label}`, hint: names };
    }),
  });

  if (clack.isCancel(category)) return;

  const group = commands.filter(cmd => getCategoryForCommand(cmd.name) === category);

  const selected = await clack.select({
    message: "选择命令查看详情（回车执行，Ctrl+C 返回）",
    options: group.map(cmd => {
      const aliases = cmd.aliases.length ? ` (${cmd.aliases.join(", ")})` : "";
      return { value: cmd.name, label: cmd.name + aliases, hint: cmd.description };
    }),
  });

  if (clack.isCancel(selected)) return;

  const cmd = group.find(c => c.name === selected)!;
  console.log();
  console.log(chalk.bold(`  ${cmd.name}`) + (cmd.aliases.length ? chalk.gray(` — 别名: ${cmd.aliases.join(", ")}`) : ""));
  console.log(chalk.gray(`  ${cmd.description}`));
  console.log();
  console.log(`  ${chalk.cyan("用法:")} ${cmd.usage}`);
  console.log();

  const action = await clack.select({
    message: "下一步",
    options: [
      { value: "run", label: "立即运行", hint: "输入参数后执行" },
      { value: "back", label: "返回帮助菜单" },
      { value: "done", label: "关闭帮助" },
    ],
  });

  if (clack.isCancel(action) || action === "done") return;
  if (action === "back") {
    await printHelp();
    return;
  }

  const input = await clack.text({
    message: `输入参数（如: ${cmd.usage.replace(cmd.name + " ", "").replace(/[<\[\]>]/g, "")}）`,
    placeholder: "例如: AAPL",
  });

  if (clack.isCancel(input) || !input) return;

  const args = String(input).trim().split(/\s+/);
  try {
    await cmd.handler(args);
  } catch (err) {
    console.error(chalk.red(`  执行失败: ${err instanceof Error ? err.message : String(err)}`));
  }
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
    if (cmdName === "help" || cmdName === "?") {
      await printHelp();
      rl.prompt();
      return;
    }
    if (cmdName === "clear" || cmdName === "cls") {
      console.clear();
      rl.prompt();
      return;
    }

    // 查找注册命令
    const cmd = findCommand(cmdName);
    if (!cmd) {
      console.log(chalk.yellow(`  未知命令: ${cmdName}，输入 help 查看可用命令`));
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
