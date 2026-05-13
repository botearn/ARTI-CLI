#!/usr/bin/env node
/**
 * ARTI CLI — 智能投研命令行工具
 * 数据源：OpenBB (本地 Python 桥接)
 *
 * 每个命令只定义一次 CommandDef，自动驱动 CLI (Commander) + REPL 两个入口。
 */
import { Command } from "commander";
import { quoteCommand } from "./commands/quote.js";
import { researchCommand } from "./commands/research.js";
import { scanCommand } from "./commands/scan.js";
import { predictCommand } from "./commands/predict.js";
import { quickScanCommand, fullReportCommand, deepReportCommand } from "./commands/product.js";
import { marketCommand } from "./commands/market.js";
import { newsCommand } from "./commands/news.js";
import { watchlistCommand } from "./commands/watchlist.js";
import { configSetCommand, configGetCommand, configListCommand, configResetCommand } from "./commands/config.js";
import { insightsCommand } from "./commands/insights.js";
import { watchCommand } from "./commands/watch.js";
import { exportCommand } from "./commands/export.js";
import { completionCommand, installCompletion } from "./commands/completion.js";
import { historyCommand } from "./commands/history.js";
import { cryptoCommand } from "./commands/crypto.js";
import { fundamentalCommand } from "./commands/fundamental.js";
import { optionsCommand } from "./commands/options.js";
import { economyCommand } from "./commands/economy.js";
import { searchCommand } from "./commands/search.js";
import { creditsCommand } from "./commands/credits.js";
import { loginCommand, logoutCommand, whoamiCommand } from "./commands/auth.js";
import { shutdownDaemon } from "./openbb.js";
import chalk from "chalk";
import { setJsonMode } from "./output.js";
import { checkForUpdate } from "./update-check.js";
import { startRepl } from "./core/repl.js";
import { buildCli, buildRepl, type CommandDef, type OptionDef } from "./core/registry.js";

// ── 程序根命令 ──
const program = new Command();
program
  .name("arti")
  .description("ARTI 智能投研 CLI — OpenBB 驱动的股票分析工具")
  .version("0.2.0")
  .option("--json", "以 JSON 格式输出（适合脚本和管道）")
  .option("--install-completion", "一键安装 Shell 自动补全脚本")
  .configureOutput({
    outputError: (str, write) => write(chalk.red(`\n  ✗ ${str.trim()}\n`)),
  })
  .hook("preAction", (thisCommand) => {
    if (thisCommand.opts().json) setJsonMode(true);
  });

// ── 共用选项模板 ──
const OPT_LIMIT: OptionDef = { short: "-l", long: "--limit", key: "limit", type: "string", desc: "返回条数", hint: "<n>" };
const OPT_DAYS: OptionDef  = { short: "-d", long: "--days",  key: "days",  type: "string", desc: "历史天数", hint: "<n>" };

/** 选项值 → 整数（有 defaultValue 保证不为 undefined） */
const int = (v: string | boolean | undefined, fallback = 0): number =>
  typeof v === "string" ? parseInt(v, 10) : fallback;

// ── 统一命令定义（一次定义，CLI + REPL 共享） ──
const defs: CommandDef[] = [
  {
    name: "quick-scan", aliases: ["quick", "qs"],
    description: "主产品 Quick Scan（行情 + 技术面 + 新闻的快速研判）",
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
    description: "主产品 Full 全景研报（多分析师 Layer 1）",
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
    description: "主产品 Deep 深度研报（三层级辩论 + 圆桌裁定）",
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
    description: "登录 ARTI 账户（当前支持 access token 登录）",
    usage: "login --token <token> [--email <email>] [--user-id <id>]",
    args: [],
    options: [
      { short: "", long: "--token", key: "token", type: "string", desc: "ARTI access token", hint: "<token>" },
      { short: "", long: "--email", key: "email", type: "string", desc: "用户邮箱（可选）", hint: "<email>" },
      { short: "", long: "--user-id", key: "userId", type: "string", desc: "用户 ID（可选）", hint: "<id>" },
    ],
    examples: [
      "$ arti login --token <token>",
      "$ arti login --token <token> --email you@example.com",
    ],
    invoke: ({ options }) => Promise.resolve(loginCommand({
      token: options.token as string | undefined,
      email: options.email as string | undefined,
      userId: options.userId as string | undefined,
    })),
  },
  {
    name: "logout", aliases: [],
    description: "退出当前 ARTI 账户",
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
    description: "查看当前登录状态",
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
    name: "quote", aliases: ["q"],
    description: "查询实时行情（支持股票代码和中文名称搜索）",
    usage: "quote <symbol...>",
    args: [{ spec: "<symbols...>", desc: "股票代码或名称，如 AAPL NVDA 0700.HK" }],
    options: [],
    examples: [
      "$ arti quote AAPL              # 单只股票",
      "$ arti quote AAPL NVDA TSLA    # 多只股票",
      "$ arti quote 0700.HK           # 港股",
      "$ arti quote 腾讯              # 中文名搜索",
      "$ arti quote AAPL --json       # JSON 输出",
    ],
    invoke: ({ positional }) => quoteCommand(positional),
  },
  {
    name: "market", aliases: ["m"],
    description: "全球市场概览（指数 / 涨跌榜 / 活跃榜）",
    usage: "market [gainers|losers|active] [-l N]",
    args: [{ spec: "[sub]", desc: "子命令: gainers | losers | active" }],
    options: [{ ...OPT_LIMIT, defaultValue: "15" }],
    examples: [
      "$ arti market                  # 全球主要指数",
      "$ arti market gainers          # 今日涨幅榜",
      "$ arti market losers           # 今日跌幅榜",
      "$ arti market active           # 今日活跃榜",
      "$ arti market gainers -l 5     # 只看前 5 名",
    ],
    invoke: ({ positional, options }) => {
      const sub = positional.find(a => ["gainers", "losers", "active"].includes(a));
      return marketCommand(sub, { limit: int(options.limit) });
    },
  },
  {
    name: "scan", aliases: ["s"],
    description: "技术指标扫描（MA/RSI/MACD/布林带/ATR/ADX + 综合研判）",
    usage: "scan <symbol>",
    args: [{ spec: "<symbol>", desc: "股票代码" }],
    options: [],
    examples: [
      "$ arti scan AAPL               # 扫描苹果技术面",
      "$ arti scan NVDA --json        # JSON 输出，适合脚本",
    ],
    invoke: ({ positional }) => scanCommand(positional[0]),
  },
  {
    name: "history", aliases: ["hist"],
    description: "查看股票历史价格（OHLCV 表格）",
    usage: "history <symbol> [-d N]",
    args: [{ spec: "<symbol>", desc: "股票代码" }],
    options: [{ ...OPT_DAYS, defaultValue: "60" }],
    examples: [
      "$ arti history AAPL              # 默认 60 天",
      "$ arti history NVDA -d 30        # 最近 30 天",
      "$ arti history TSLA --json       # JSON 输出",
    ],
    invoke: ({ positional, options }) =>
      historyCommand(positional[0], { days: int(options.days) }),
  },
  {
    name: "crypto", aliases: ["cr"],
    description: "查看加密货币历史价格",
    usage: "crypto <symbol> [-d N]",
    args: [{ spec: "<symbol>", desc: "加密货币代码，如 BTCUSD、ETHUSD" }],
    options: [{ ...OPT_DAYS, defaultValue: "30" }],
    examples: [
      "$ arti crypto BTCUSD             # 比特币 30 天",
      "$ arti crypto ETHUSD -d 7        # 以太坊 7 天",
      "$ arti crypto BTCUSD --json      # JSON 输出",
    ],
    invoke: ({ positional, options }) =>
      cryptoCommand(positional[0], { days: int(options.days) }),
  },
  {
    name: "fundamental", aliases: ["fund"],
    description: "公司基本面数据（财报 / 估值 / 分红）",
    usage: "fundamental <symbol> [--fields income,metrics]",
    args: [{ spec: "<symbol>", desc: "股票代码" }],
    options: [{ short: "", long: "--fields", key: "fields", type: "string", desc: "数据类别: income,balance,metrics,dividends", hint: "<list>", defaultValue: "income,balance,metrics" }],
    examples: [
      "$ arti fundamental AAPL                      # 利润表+资产负债+估值",
      "$ arti fundamental NVDA --fields metrics     # 仅估值指标",
      "$ arti fundamental TSLA --fields income,dividends --json",
    ],
    invoke: ({ positional, options }) =>
      fundamentalCommand(positional[0], { fields: options.fields as string }),
  },
  {
    name: "options", aliases: ["opt"],
    description: "查看股票期权链（行权价 / IV / 持仓量）",
    usage: "options <symbol> [-l N]",
    args: [{ spec: "<symbol>", desc: "股票代码" }],
    options: [{ ...OPT_LIMIT, defaultValue: "20" }],
    examples: [
      "$ arti options AAPL              # 默认 20 条",
      "$ arti options NVDA -l 10        # 前 10 条",
      "$ arti options TSLA --json       # JSON 输出",
    ],
    invoke: ({ positional, options }) =>
      optionsCommand(positional[0], { limit: int(options.limit) }),
  },
  {
    name: "economy", aliases: ["eco"],
    description: "宏观经济数据（国债利率 / FRED 数据系列）",
    usage: "economy treasury | fred <id> | search <keyword> [-l N]",
    args: [
      { spec: "[sub]", desc: "子命令: treasury | fred <id> | search <keyword>" },
      { spec: "[args...]", desc: "子命令参数" },
    ],
    options: [{ ...OPT_LIMIT, defaultValue: "20" }],
    examples: [
      "$ arti economy treasury          # 国债利率",
      "$ arti economy fred GDP          # GDP 数据",
      "$ arti economy fred UNRATE       # 失业率",
      "$ arti economy search CPI        # 搜索 CPI 相关系列",
      "$ arti economy treasury --json   # JSON 输出",
    ],
    invoke: ({ positional, options }) =>
      economyCommand(positional[0], positional.slice(1), { limit: int(options.limit) }),
  },
  {
    name: "search", aliases: ["find"],
    description: "搜索股票代码（支持公司名称、代码模糊搜索）",
    usage: "search <keyword> [-l N]",
    args: [{ spec: "<query>", desc: "搜索关键词，如 Apple、腾讯、MSFT" }],
    options: [{ ...OPT_LIMIT, defaultValue: "10" }],
    examples: [
      "$ arti search apple              # 搜索 Apple 相关股票",
      "$ arti search 腾讯               # 中文搜索",
      "$ arti search bank -l 20         # 返回 20 条",
      "$ arti search tesla --json       # JSON 输出",
    ],
    invoke: ({ positional, options }) =>
      searchCommand(positional.join(" "), { limit: int(options.limit) }),
  },
  {
    name: "predict", aliases: ["p"],
    description: "综合预测分析（行情 + 技术面 + 新闻 → 多空研判）",
    usage: "predict <symbol>",
    args: [{ spec: "<symbol>", desc: "股票代码" }],
    options: [],
    examples: [
      "$ arti predict AAPL            # 综合分析苹果",
      "$ arti predict TSLA --json     # JSON 输出",
    ],
    invoke: ({ positional }) => predictCommand(positional[0]),
  },
  {
    name: "news", aliases: ["n"],
    description: "财经新闻（指定股票代码查公司新闻，不指定查全球新闻）",
    usage: "news [symbol] [-l N]",
    args: [{ spec: "[symbol]", desc: "股票代码（可选）" }],
    options: [{ ...OPT_LIMIT, defaultValue: "15" }],
    examples: [
      "$ arti news                    # 全球财经新闻",
      "$ arti news AAPL               # 苹果公司新闻",
      "$ arti news AAPL -l 5          # 只看 5 条",
      "$ arti news TSLA --json        # JSON 输出",
    ],
    invoke: ({ positional, options }) =>
      newsCommand(positional[0], { limit: int(options.limit) }),
  },
  {
    name: "research", aliases: ["r"],
    description: "底层研报命令（兼容入口，建议优先使用 full / deep）",
    usage: "research <symbol> [--agent <type>] [--mode panorama|deep]",
    args: [{ spec: "<symbol>", desc: "股票代码" }],
    options: [
      { short: "-a", long: "--agent", key: "agent", type: "string", desc: "仅调单个分析师: natasha|steve|tony|thor|clint|sam|vision|wanda", hint: "<type>" },
      { short: "-f", long: "--full", key: "full", type: "boolean", desc: "显示完整报告（默认仅摘要）" },
      { short: "-m", long: "--mode", key: "mode", type: "string", desc: "研报模式: panorama | deep（兼容 layer1-only | full）", hint: "<mode>", defaultValue: "deep" },
    ],
    examples: [
      "$ arti research AAPL             # 默认等同于 deep",
      "$ arti research NVDA -a tony     # 仅 Tony（技术面）快速分析",
      "$ arti research TSLA -m panorama # 仅 Layer 1 分析师",
      "$ arti research AAPL -m deep -f  # 深度研报 + 完整输出",
    ],
    invoke: ({ positional, options }) =>
      researchCommand(positional[0], {
        agent: options.agent as string | undefined,
        mode: options.mode as string | undefined,
        full: options.full as boolean | undefined,
      }),
  },
  {
    name: "watchlist", aliases: ["wl"],
    description: "自选股管理（查看行情 / 添加 / 移除）",
    usage: "watchlist [add|remove|list] [symbols...]",
    args: [
      { spec: "[sub]", desc: "子命令: add | remove | list" },
      { spec: "[symbols...]", desc: "股票代码" },
    ],
    options: [],
    examples: [
      "$ arti watchlist               # 查看自选股行情",
      "$ arti watchlist add AAPL NVDA # 添加到自选",
      "$ arti watchlist remove TSLA   # 从自选移除",
      "$ arti watchlist list          # 列出自选股代码",
    ],
    invoke: ({ positional }) => watchlistCommand(positional[0], positional.slice(1)),
  },
  {
    name: "watch", aliases: ["w"],
    description: "实时行情 Dashboard（轮询刷新）",
    usage: "watch <symbol...> [-i N]",
    args: [{ spec: "<symbols...>", desc: "股票代码，如 AAPL NVDA TSLA" }],
    options: [{ short: "-i", long: "--interval", key: "interval", type: "string", desc: "刷新间隔（秒）", hint: "<seconds>", defaultValue: "15" }],
    examples: [
      "$ arti watch AAPL NVDA TSLA    # 监控三只股票",
      "$ arti watch AAPL -i 10        # 10秒刷新",
      "按 Ctrl+C 退出",
    ],
    invoke: ({ positional, options }) =>
      watchCommand(positional, { interval: int(options.interval) }),
  },
  {
    name: "export", aliases: ["exp"],
    description: "导出股票历史数据到文件（CSV / JSON）",
    usage: "export <symbol> [-f csv|json] [-d N]",
    args: [{ spec: "<symbol>", desc: "股票代码" }],
    options: [
      { short: "-f", long: "--format", key: "format", type: "string", desc: "输出格式: csv | json", hint: "<type>", defaultValue: "csv" },
      { ...OPT_DAYS, defaultValue: "60" },
      { short: "-o", long: "--output", key: "output", type: "string", desc: "输出文件路径", hint: "<path>" },
    ],
    examples: [
      "$ arti export AAPL                    # 导出 60 天 CSV",
      "$ arti export NVDA -f json -d 90      # 导出 90 天 JSON",
      "$ arti export TSLA -o ~/data/tsla.csv # 指定输出路径",
    ],
    invoke: ({ positional, options }) =>
      exportCommand(positional[0], {
        format: options.format as string | undefined,
        days: int(options.days),
        output: options.output as string | undefined,
      }),
  },
  {
    name: "insights", aliases: ["i"],
    description: "生成个人投研洞察报告（HTML 可分享）",
    usage: "insights",
    args: [],
    options: [],
    examples: [],
    invoke: () => insightsCommand(),
  },
  {
    name: "credits", aliases: ["cred"],
    description: "查看 Credit 余额与套餐详情",
    usage: "credits",
    args: [],
    options: [{ short: "", long: "--set-plan", key: "setPlan", type: "string", desc: "本地切换套餐: free|basic|pro|flagship", hint: "<plan>" }],
    examples: [
      "$ arti credits            # 查看余额和套餐",
      "$ arti credits --set-plan pro   # 本地切换到专业版",
      "$ arti credits --json     # JSON 格式输出",
    ],
    invoke: ({ options }) => creditsCommand({ setPlan: options.setPlan as string | undefined }),
  },
  {
    name: "completion", aliases: [],
    description: "生成 Shell 自动补全脚本",
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

// ── 版本更新检查（静默、不阻塞） ──
checkForUpdate("0.2.0");

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

  try {
    await program.parseAsync(process.argv);
  } finally {
    shutdownDaemon();
  }
}

void main();
