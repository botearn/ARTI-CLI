/**
 * 启动横幅 — 渐变 logo、登录/余额状态区、每日提示
 * renderBanner 为纯函数（便于测试）；printBanner 负责终端探测与输出
 */
import chalk from "chalk";
import { formatCredits, type BillingState } from "../billing.js";
import { VERSION } from "../version.js";

const LOGO_LINES = [
  "   █████╗ ██████╗ ████████╗██╗",
  "  ██╔══██╗██╔══██╗╚══██╔══╝██║",
  "  ███████║██████╔╝   ██║   ██║",
  "  ██╔══██║██╔══██╗   ██║   ██║",
  "  ██║  ██║██║  ██║   ██║   ██║",
  "  ╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝   ╚═╝",
] as const;

/** 金 → 橙 逐行渐变 */
const GRADIENT = ["#FFE873", "#FFD700", "#FFC400", "#FFAD33", "#FF9624", "#FF8000"] as const;

/** 终端宽度低于该值时改用单行小字标 */
const MIN_LOGO_COLUMNS = 50;
const DIVIDER_WIDTH = 38;

const TIPS = [
  "用 /quick AAPL 快速扫描；普通文本直接对话",
  "输入 /help 可交互浏览全部快捷命令",
  "直接问：帮我看看英伟达",
  "用 /deep <代码> 生成深度研报（约 1–2 分钟）",
  "外层 arti <command> --json 适合脚本与 agent",
  "用 /credits 查看余额与套餐用量",
] as const;

/** 终端是否支持 Unicode 方块/框线字符（老 Windows cmd 等环境回退纯文本） */
export function supportsUnicode(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env.TERM === "dumb") return false;
  if (platform !== "win32") return true;
  return Boolean(env.WT_SESSION || env.TERM_PROGRAM);
}

/** 每日提示 — 按年内天数轮换，同一天内固定 */
export function tipOfTheDay(now: Date = new Date()): string {
  const start = new Date(now.getFullYear(), 0, 0);
  const day = Math.floor((now.getTime() - start.getTime()) / 86400000);
  return TIPS[day % TIPS.length];
}

export interface BannerInput {
  version?: string;
  /** 登录身份（email 或 userId）；null/缺省 = 未登录 */
  who?: string | null;
  columns?: number;
  unicode?: boolean;
  now?: Date;
}

export interface RenderedBanner {
  lines: string[];
  /** 状态行在 lines 中的下标；未登录时为 -1（无需异步回填） */
  statusLineIndex: number;
}

/** 状态行填充内容：pending = 等待余额回填；error = 拉取失败只保留身份 */
export type StatusFill = BillingState | "pending" | "error";

export function renderStatusContent(who: string, fill: StatusFill): string {
  const dot = chalk.green("●");
  if (fill === "error") return `  ${dot} ${who}`;
  if (fill === "pending") return `  ${dot} ${who} ${chalk.dim("· 余额查询中…")}`;
  return (
    `  ${dot} ${who} ${chalk.dim("·")} ${chalk.cyan(fill.tierLabel)} ${chalk.dim("·")} ` +
    chalk.hex("#FFD700")(formatCredits(fill.balance))
  );
}

export function renderLoginHint(): string {
  return `  ${chalk.yellow("○")} ${chalk.dim("未登录 — 输入")} ${chalk.cyan("/login")} ${chalk.dim("开始（浏览器登录）")}`;
}

export function renderBanner(input: BannerInput = {}): RenderedBanner {
  const version = input.version ?? VERSION;
  const columns = input.columns ?? 80;
  const unicode = input.unicode ?? true;
  const who = input.who ?? null;

  const lines: string[] = [""];
  if (unicode && columns >= MIN_LOGO_COLUMNS) {
    for (let i = 0; i < LOGO_LINES.length; i++) {
      lines.push(chalk.hex(GRADIENT[i]).bold(LOGO_LINES[i]));
    }
    lines.push(`  ${chalk.dim("智能投研终端")} ${chalk.hex("#FFD700")("v" + version)}`);
  } else {
    lines.push(`  ${chalk.hex("#FFD700").bold("ARTI")} ${chalk.dim(`智能投研终端 v${version}`)}`);
  }

  const rule = unicode ? "─".repeat(DIVIDER_WIDTH) : "-".repeat(DIVIDER_WIDTH);
  lines.push(chalk.dim("  " + rule));

  let statusLineIndex = -1;
  if (who) {
    statusLineIndex = lines.length;
    lines.push(renderStatusContent(who, "pending"));
  } else {
    lines.push(renderLoginHint());
  }

  lines.push(chalk.dim("  " + rule));
  lines.push(chalk.dim("  输入 / 浏览快捷命令 · 普通文本直接对话"));
  lines.push(chalk.dim(`  提示：${tipOfTheDay(input.now)}`));
  lines.push("");

  return { lines, statusLineIndex };
}

export interface PrintedBanner {
  totalLines: number;
  statusLineIndex: number;
}

export function printBanner(input: BannerInput = {}): PrintedBanner {
  const { lines, statusLineIndex } = renderBanner({
    ...input,
    columns: input.columns ?? (process.stdout.columns || 80),
    unicode: input.unicode ?? supportsUnicode(),
  });
  process.stdout.write(lines.join("\n") + "\n");
  return { totalLines: lines.length, statusLineIndex };
}
