#!/usr/bin/env node
/**
 * ARTI CLI — 智能投研命令行工具
 * 数据源：生产后端产品函数（Supabase Edge Functions + orchestrator）
 *
 * 每个命令只定义一次 CommandDef，自动驱动 CLI (Commander) + REPL 两个入口。
 */
import { Command } from "commander";
import { quickScanCommand, fullReportCommand, deepReportCommand } from "./commands/product.js";
import { chatCommand } from "./commands/chat.js";
import { configSetCommand, configGetCommand, configListCommand, configResetCommand } from "./commands/config.js";
import { completionCommand, installCompletion } from "./commands/completion.js";
import { creditsCommand } from "./commands/credits.js";
import { loginCommand, logoutCommand, whoamiCommand, tokenCommand } from "./commands/auth.js";
import { doctorCommand } from "./commands/doctor.js";
import { polyCommand } from "./poly/commands.js";
import { shutdownBackendMcp } from "./data/mcp-client.js";
import chalk from "chalk";
import { setJsonMode } from "./output.js";
import { checkForUpdate, formatUpdateNotice } from "./update-check.js";
import { VERSION } from "./version.js";
import { startRepl } from "./core/repl.js";
import { buildCli, buildRepl, type CommandDef, type OptionDef } from "./core/registry.js";

// ── 程序根命令 ──
const program = new Command();
program
  .name("arti")
  .description("ARTI 智能投研 CLI — 聊天 / 快速扫描 / 全景 / 深度研报")
  .version(VERSION)
  .option("--json", "以 JSON 格式输出（适合脚本和管道）")
  .option("--install-completion", "一键安装 Shell 自动补全脚本")
  .configureOutput({
    outputError: (str, write) => write(chalk.red(`\n  ✗ ${str.trim()}\n`)),
  })
  .hook("preAction", (thisCommand) => {
    if (thisCommand.opts().json) setJsonMode(true);
  });

// ── 共用选项模板 ──
const OPT_REFRESH: OptionDef = { short: "", long: "--refresh", key: "refresh", type: "boolean", desc: "跳过 MCP 缓存，强制刷新" };

// ── 统一命令定义（一次定义，CLI + REPL 共享） ──
const defs: CommandDef[] = [
  {
    name: "chat", aliases: ["c", "ask"],
    description: "AI 投研对话（默认智能路由，--raw 纯聊天）",
    usage: "chat [--raw] <message...>",
    args: [{ spec: "<message...>", desc: "你的问题" }],
    options: [
      { short: "", long: "--raw", key: "raw", type: "boolean", desc: "跳过意图识别，直接走纯聊天" },
    ],
    examples: [
      "$ arti chat 今天的智谱        # 自动路由到快速扫描/研报/聊天",
      "$ arti chat --raw 美股今天怎么样",
      "$ arti chat 帮我看看英伟达",
    ],
    invoke: async ({ positional, options }) => {
      await chatCommand(positional.join(" "), {
        raw: options.raw as boolean | undefined,
      });
    },
  },
  {
    name: "quick-scan", aliases: ["quick", "qs"],
    description: "快速研判",
    usage: "quick-scan <symbol>",
    args: [{ spec: "<symbol>", desc: "股票代码" }],
    options: [],
    examples: [
      "$ arti quick-scan AAPL         # 主产品 Quick Scan",
      "$ arti quick NVDA              # 短别名",
      "$ arti quick-scan TSLA --json  # JSON 输出",
    ],
    invoke: ({ positional }) => quickScanCommand(positional[0]),
  },
  {
    name: "full", aliases: ["panorama", "fr"],
    description: "全景研报",
    usage: "full <symbol> [--full]",
    args: [{ spec: "<symbol>", desc: "股票代码" }],
    options: [
      { short: "-f", long: "--full", key: "full", type: "boolean", desc: "显示完整报告（默认仅摘要）" },
    ],
    examples: [
      "$ arti full AAPL               # 主产品 Full 全景研报",
      "$ arti panorama NVDA           # 同义别名",
      "$ arti full TSLA -f            # 展示完整分析内容",
    ],
    invoke: ({ positional, options }) =>
      fullReportCommand(positional[0], {
        full: options.full as boolean | undefined,
      }),
  },
  {
    name: "deep", aliases: ["dr"],
    description: "深度研报",
    usage: "deep <symbol> [--full]",
    args: [{ spec: "<symbol>", desc: "股票代码" }],
    options: [
      { short: "-f", long: "--full", key: "full", type: "boolean", desc: "显示完整报告（默认仅摘要）" },
    ],
    examples: [
      "$ arti deep AAPL               # 主产品 Deep 深度研报",
      "$ arti deep NVDA -f            # 展示完整分析内容",
    ],
    invoke: ({ positional, options }) =>
      deepReportCommand(positional[0], {
        full: options.full as boolean | undefined,
      }),
  },
  {
    name: "login", aliases: [],
    description: "登录",
    usage: "login | login --email <email> --password <password> | login --token <token> [--refresh-token <token>]",
    args: [],
    options: [
      { short: "", long: "--token", key: "token", type: "string", desc: "ARTI access token", hint: "<token>" },
      { short: "", long: "--refresh-token", key: "refreshToken", type: "string", desc: "ARTI refresh token", hint: "<token>" },
      { short: "", long: "--email", key: "email", type: "string", desc: "用户邮箱（可选）", hint: "<email>" },
      { short: "", long: "--password", key: "password", type: "string", desc: "用户密码（可选）", hint: "<password>" },
      { short: "", long: "--user-id", key: "userId", type: "string", desc: "用户 ID（可选）", hint: "<id>" },
      { short: "", long: "--supabase-url", key: "supabaseUrl", type: "string", desc: "Supabase URL（可选）", hint: "<url>" },
      { short: "", long: "--publishable-key", key: "publishableKey", type: "string", desc: "Supabase publishable key（可选）", hint: "<key>" },
      { short: "", long: "--web-auth-url", key: "webAuthUrl", type: "string", desc: "网页登录地址（调试用）", hint: "<url>" },
      { short: "", long: "--start", key: "start", type: "boolean", desc: "device flow：取授权链接后退出（agent 用）" },
      { short: "", long: "--poll", key: "poll", type: "boolean", desc: "device flow：轮询等待授权完成（agent 用）" },
      { short: "", long: "--session", key: "session", type: "string", desc: "配合 --poll：指定会话 ID", hint: "<id>" },
      { short: "", long: "--poll-token", key: "pollToken", type: "string", desc: "配合 --poll：指定 poll token", hint: "<token>" },
    ],
    examples: [
      "$ arti login",
      "$ arti login --email you@example.com --password '***'",
      "$ arti login --token <token> --refresh-token <token>",
      "$ arti login --start --json    # agent：取授权链接",
      "$ arti login --poll --json     # agent：等待授权完成",
    ],
    invoke: ({ options }) => Promise.resolve(loginCommand({
      token: options.token as string | undefined,
      refreshToken: options.refreshToken as string | undefined,
      email: options.email as string | undefined,
      password: options.password as string | undefined,
      userId: options.userId as string | undefined,
      supabaseUrl: options.supabaseUrl as string | undefined,
      publishableKey: options.publishableKey as string | undefined,
      webAuthUrl: options.webAuthUrl as string | undefined,
      start: options.start as boolean | undefined,
      poll: options.poll as boolean | undefined,
      session: options.session as string | undefined,
      pollToken: options.pollToken as string | undefined,
    })),
  },
  {
    name: "logout", aliases: [],
    description: "登出",
    usage: "logout",
    args: [],
    options: [],
    examples: [
      "$ arti logout",
    ],
    invoke: () => Promise.resolve(logoutCommand()),
  },
  {
    name: "whoami", aliases: [],
    description: "当前账户",
    usage: "whoami",
    args: [],
    options: [],
    examples: [
      "$ arti whoami",
      "$ arti whoami --json",
    ],
    invoke: () => Promise.resolve(whoamiCommand()),
  },
  {
    name: "token", aliases: [],
    description: "打印登录 token（供 agent 非交互鉴权）",
    usage: "token",
    args: [],
    options: [],
    examples: [
      "$ arti token              # 打印可粘贴的 export 行",
      "$ arti token --json       # 结构化输出",
      "$ eval \"$(arti token)\"     # 直接注入当前 shell",
    ],
    invoke: () => Promise.resolve(tokenCommand()),
  },
  {
    name: "doctor", aliases: ["diag"],
    description: "连接诊断",
    usage: "doctor mcp [--symbol AAPL] [--local|--prod|--url <url>] [--refresh]",
    args: [{ spec: "[target]", desc: "诊断对象，目前支持 mcp" }],
    options: [
      { short: "", long: "--symbol", key: "symbol", type: "string", desc: "MCP 探测股票代码", hint: "<symbol>", defaultValue: "AAPL" },
      { short: "", long: "--url", key: "url", type: "string", desc: "临时使用指定 MCP URL", hint: "<url>" },
      { short: "", long: "--local", key: "local", type: "boolean", desc: "临时使用本地 MCP: http://localhost:8001/mcp" },
      { short: "", long: "--prod", key: "prod", type: "boolean", desc: "临时使用线上 MCP" },
      OPT_REFRESH,
    ],
    examples: [
      "$ arti doctor mcp",
      "$ arti doctor mcp --prod --symbol 600519.SS",
      "$ arti doctor mcp --local --symbol 600519.SS",
      "$ arti doctor mcp --symbol 600519.SS --refresh",
      "$ arti doctor mcp --json",
    ],
    invoke: ({ positional, options }) =>
      doctorCommand(positional[0], {
        symbol: options.symbol as string | undefined,
        refresh: options.refresh as boolean | undefined,
        url: options.url as string | undefined,
        local: options.local as boolean | undefined,
        prod: options.prod as boolean | undefined,
      }),
  },
  {
    name: "credits", aliases: ["cred"],
    description: "余额套餐",
    usage: "credits",
    args: [],
    options: [{ short: "", long: "--set-plan", key: "setPlan", type: "string", desc: "兼容旧参数，现已废弃", hint: "<plan>" }],
    examples: [
      "$ arti credits            # 查看余额和套餐",
      "$ arti credits --json     # JSON 格式输出",
    ],
    invoke: ({ options }) => creditsCommand({ setPlan: options.setPlan as string | undefined }),
  },
  {
    name: "poly", aliases: [],
    description: "预测市场数据（ARTi Poly）",
    usage: "poly events|event|summary|compare|search [...args]",
    args: [{ spec: "[args...]", desc: "子命令和参数" }],
    options: [
      { short: "-l", long: "--limit", key: "limit", type: "string", desc: "返回数量", hint: "<n>" },
      { short: "", long: "--source", key: "source", type: "string", desc: "数据源: polymarket | kalshi", hint: "<source>" },
      { short: "", long: "--category", key: "category", type: "string", desc: "事件分类过滤", hint: "<category>" },
    ],
    examples: [
      "$ arti poly events --limit 5",
      "$ arti poly event will-trump-win-2026 --source polymarket",
      "$ arti poly summary --limit 10",
      "$ arti poly compare",
      "$ arti poly search fed",
    ],
    invoke: ({ positional, options }) => polyCommand(positional, options),
  },
  {
    name: "completion", aliases: [],
    description: "Shell 补全",
    usage: "completion [bash|zsh]",
    args: [{ spec: "[shell]", desc: "Shell 类型: bash | zsh" }],
    options: [],
    examples: [
      "$ arti completion bash >> ~/.bashrc",
      "$ arti completion zsh >> ~/.zshrc",
    ],
    invoke: async ({ positional }) => { completionCommand(positional[0]); },
  },
];

// ── 自动注册：一次定义，两处生效 ──
buildCli(program, defs);
buildRepl(defs);

// ── config 子命令（嵌套结构，单独注册） ──
const configCmd = program
  .command("config")
  .description("管理 CLI 配置（~/.config/arti/config.json）");

configCmd.command("set").description("设置配置项")
  .argument("<key>", "配置键，如 api.timeout")
  .argument("<value>", "配置值")
  .action(configSetCommand);

configCmd.command("get").description("查看配置项")
  .argument("<key>", "配置键")
  .action(configGetCommand);

configCmd.command("list").description("列出所有配置")
  .action(configListCommand);

configCmd.command("reset").description("重置为默认配置")
  .action(configResetCommand);

// ── 入口 ──
async function main(): Promise<void> {
  if (process.argv.includes("--install-completion")) {
    installCompletion();
    return;
  }

  if (process.argv.length <= 2) {
    startRepl();
    return;
  }

  // 版本更新检查（静默、不阻塞；--json 模式跳过以保持 stdout 纯净；提示走 stderr）
  if (!process.argv.includes("--json")) {
    void checkForUpdate(VERSION, (latest) => {
      process.stderr.write(formatUpdateNotice(VERSION, latest) + "\n");
    });
  }

  try {
    await program.parseAsync(process.argv);
  } finally {
    await shutdownBackendMcp().catch(() => undefined);
  }
}

void main();
