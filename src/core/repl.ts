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

const CONFIG_DIR = join(homedir(), ".config", "arti");
const HISTORY_FILE = join(CONFIG_DIR, "repl_history");
const MAX_HISTORY = 500;

/** 已注册的 REPL 命令 */
interface ReplCommand {
  name: string;
  aliases: string[];
  description: string;
  usage: string;
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
  console.log(chalk.gray("  智能投研终端 v0.2.0 — 输入 help 查看命令\n"));
}

/** 打印帮助 */
function printHelp(): void {
  console.log(chalk.cyan("\n  可用命令:\n"));
  const maxName = Math.max(...commands.map(c => c.usage.length));
  for (const cmd of commands) {
    const aliases = cmd.aliases.length ? chalk.cyan(` [${cmd.aliases.join(", ")}]`) : "";
    console.log(`    ${chalk.white(cmd.usage.padEnd(maxName + 2))} ${chalk.gray(cmd.description)}${aliases}`);
  }
  console.log(`    ${chalk.white("help".padEnd(maxName + 2))} ${chalk.gray("显示此帮助")} ${chalk.cyan("[?]")}`);
  console.log(`    ${chalk.white("clear".padEnd(maxName + 2))} ${chalk.gray("清屏")} ${chalk.cyan("[cls]")}`);
  console.log(`    ${chalk.white("exit".padEnd(maxName + 2))} ${chalk.gray("退出")} ${chalk.cyan("[quit]")}`);
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
      printHelp();
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
