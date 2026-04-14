#!/usr/bin/env node
/**
 * ARTI CLI — 智能投研命令行工具
 * 数据源：OpenBB (本地 Python 桥接)
 */
import { Command } from "commander";
import { quoteCommand } from "./commands/quote.js";
import { researchCommand } from "./commands/research.js";
import { scanCommand } from "./commands/scan.js";
import { predictCommand } from "./commands/predict.js";
import { marketCommand } from "./commands/market.js";
import { newsCommand } from "./commands/news.js";
import { watchlistCommand } from "./commands/watchlist.js";
import { configSetCommand, configGetCommand, configListCommand, configResetCommand } from "./commands/config.js";
import { insightsCommand } from "./commands/insights.js";
import { watchCommand } from "./commands/watch.js";
import { exportCommand } from "./commands/export.js";
import { completionCommand } from "./commands/completion.js";
import { setJsonMode } from "./output.js";
import { checkForUpdate } from "./update-check.js";
import { registerCommand, startRepl } from "./core/repl.js";

const program = new Command();

program
  .name("arti")
  .description("ARTI 智能投研 CLI — OpenBB 驱动的股票分析工具")
  .version("0.2.0")
  .option("--json", "以 JSON 格式输出（适合脚本和管道）")
  .hook("preAction", (thisCommand) => {
    const opts = thisCommand.opts();
    if (opts.json) setJsonMode(true);
  });

// ── quote：实时行情 ──
program
  .command("quote")
  .description("查询实时行情（支持股票代码和中文名称搜索）")
  .argument("<symbols...>", "股票代码或名称，如 AAPL NVDA 0700.HK")
  .addHelpText("after", `
示例:
  $ arti quote AAPL              # 单只股票
  $ arti quote AAPL NVDA TSLA    # 多只股票
  $ arti quote 0700.HK           # 港股
  $ arti quote 腾讯              # 中文名搜索
  $ arti quote AAPL --json       # JSON 输出`)
  .action(quoteCommand);

// ── market：市场概览 ──
program
  .command("market")
  .description("全球市场概览（指数 / 涨跌榜 / 活跃榜）")
  .argument("[sub]", "子命令: gainers | losers | active")
  .option("-l, --limit <n>", "涨跌/活跃榜返回条数", "15")
  .addHelpText("after", `
示例:
  $ arti market                  # 全球主要指数
  $ arti market gainers          # 今日涨幅榜
  $ arti market losers           # 今日跌幅榜
  $ arti market active           # 今日活跃榜
  $ arti market gainers -l 5     # 只看前 5 名`)
  .action((sub, opts) => marketCommand(sub, { limit: parseInt(opts.limit, 10) }));

// ── scan：技术扫描 ──
program
  .command("scan")
  .description("技术指标扫描（MA/RSI/MACD/布林带/ATR/ADX + 综合研判）")
  .argument("<symbol>", "股票代码")
  .addHelpText("after", `
示例:
  $ arti scan AAPL               # 扫描苹果技术面
  $ arti scan NVDA --json        # JSON 输出，适合脚本`)
  .action(scanCommand);

// ── predict：综合预测 ──
program
  .command("predict")
  .description("综合预测分析（行情 + 技术面 + 新闻 → 多空研判）")
  .argument("<symbol>", "股票代码")
  .addHelpText("after", `
示例:
  $ arti predict AAPL            # 综合分析苹果
  $ arti predict TSLA --json     # JSON 输出`)
  .action(predictCommand);

// ── news：财经新闻 ──
program
  .command("news")
  .description("财经新闻（指定股票代码查公司新闻，不指定查全球新闻）")
  .argument("[symbol]", "股票代码（可选）")
  .option("-l, --limit <n>", "返回新闻条数", "15")
  .addHelpText("after", `
示例:
  $ arti news                    # 全球财经新闻
  $ arti news AAPL               # 苹果公司新闻
  $ arti news AAPL -l 5          # 只看 5 条
  $ arti news TSLA --json        # JSON 输出`)
  .action((symbol, opts) => newsCommand(symbol, { limit: parseInt(opts.limit, 10) }));

// ── research：多维研报（保留，仍走 Edge Function） ──
program
  .command("research")
  .description("生成多维度 AI 研报（7 位分析师并行，需要后端服务）")
  .argument("<symbol>", "股票代码")
  .option("-a, --agent <type>", "指定单个分析师: natasha|steve|tony|thor|clint|sam|vision")
  .option("-f, --full", "显示完整报告（默认仅摘要）")
  .addHelpText("after", `
示例:
  $ arti research AAPL           # 7 位分析师并行研报
  $ arti research NVDA -a tony   # 仅 Tony（技术面）分析
  $ arti research TSLA -f        # 显示完整报告

分析师:
  natasha — 风险评估    steve — 价值投资    tony — 技术分析
  thor    — 宏观视角    clint — 事件驱动    sam  — 动量策略
  vision  — 量化模型`)
  .action(researchCommand);

// ── config：配置管理 ──
const configCmd = program
  .command("config")
  .description("管理 CLI 配置（~/.config/arti/config.json）");

configCmd
  .command("set")
  .description("设置配置项")
  .argument("<key>", "配置键，如 api.timeout")
  .argument("<value>", "配置值")
  .action(configSetCommand);

configCmd
  .command("get")
  .description("查看配置项")
  .argument("<key>", "配置键")
  .action(configGetCommand);

configCmd
  .command("list")
  .description("列出所有配置")
  .action(configListCommand);

configCmd
  .command("reset")
  .description("重置为默认配置")
  .action(configResetCommand);

// ── insights：个人投研洞察 ──
program
  .command("insights")
  .description("生成个人投研洞察报告（HTML 可分享）")
  .action(insightsCommand);

// ── watchlist：自选股 ──
const wlCmd = program
  .command("watchlist")
  .description("自选股管理（查看行情 / 添加 / 移除）")
  .argument("[sub]", "子命令: add | remove | list")
  .argument("[symbols...]", "股票代码")
  .addHelpText("after", `
示例:
  $ arti watchlist               # 查看自选股行情
  $ arti watchlist add AAPL NVDA # 添加到自选
  $ arti watchlist remove TSLA   # 从自选移除
  $ arti watchlist list          # 列出自选股代码`)
  .action(watchlistCommand);

// ── watch：实时行情 Dashboard ──
program
  .command("watch")
  .description("实时行情 Dashboard（轮询刷新）")
  .argument("<symbols...>", "股票代码，如 AAPL NVDA TSLA")
  .option("-i, --interval <seconds>", "刷新间隔（秒），默认 15", "15")
  .addHelpText("after", `
示例:
  $ arti watch AAPL NVDA TSLA    # 监控三只股票
  $ arti watch AAPL -i 10        # 10秒刷新
  按 Ctrl+C 退出`)
  .action((symbols, opts) => watchCommand(symbols, { interval: parseInt(opts.interval, 10) }));

// ── export：导出历史数据 ──
program
  .command("export")
  .description("导出股票历史数据到文件（CSV / JSON）")
  .argument("<symbol>", "股票代码")
  .option("-f, --format <type>", "输出格式: csv | json", "csv")
  .option("-d, --days <n>", "历史天数", "60")
  .option("-o, --output <path>", "输出文件路径")
  .addHelpText("after", `
示例:
  $ arti export AAPL                    # 导出 60 天 CSV
  $ arti export NVDA -f json -d 90      # 导出 90 天 JSON
  $ arti export TSLA -o ~/data/tsla.csv # 指定输出路径`)
  .action((symbol, opts) => exportCommand(symbol, {
    format: opts.format,
    days: parseInt(opts.days, 10),
    output: opts.output,
  }));

// ── completion：Shell 自动补全 ──
program
  .command("completion")
  .description("生成 Shell 自动补全脚本")
  .argument("[shell]", "Shell 类型: bash | zsh")
  .addHelpText("after", `
示例:
  $ arti completion bash >> ~/.bashrc
  $ arti completion zsh >> ~/.zshrc`)
  .action(completionCommand);

// ── REPL 注册命令 ──
registerCommand({
  name: "quote", aliases: ["q"],
  description: "查询实时行情", usage: "quote <symbol...>",
  handler: (args) => quoteCommand(args),
});
registerCommand({
  name: "market", aliases: ["m"],
  description: "全球市场 / 涨跌榜", usage: "market [gainers|losers|active] [-l N]",
  handler: (args) => {
    const limitIdx = args.indexOf("-l");
    const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : undefined;
    const sub = args.find(a => ["gainers", "losers", "active"].includes(a));
    return marketCommand(sub, limit ? { limit } : undefined);
  },
});
registerCommand({
  name: "scan", aliases: ["s"],
  description: "技术指标扫描", usage: "scan <symbol>",
  handler: (args) => scanCommand(args[0]),
});
registerCommand({
  name: "predict", aliases: ["p"],
  description: "综合预测分析", usage: "predict <symbol>",
  handler: (args) => predictCommand(args[0]),
});
registerCommand({
  name: "news", aliases: ["n"],
  description: "财经新闻", usage: "news [symbol] [-l N]",
  handler: (args) => {
    const limitIdx = args.indexOf("-l");
    const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : undefined;
    const symbol = args.find(a => a !== "-l" && (limitIdx === -1 || a !== args[limitIdx + 1]));
    return newsCommand(symbol, limit ? { limit } : undefined);
  },
});
registerCommand({
  name: "insights", aliases: ["i"],
  description: "个人投研洞察", usage: "insights",
  handler: () => insightsCommand(),
});
registerCommand({
  name: "research", aliases: ["r"],
  description: "AI 多维研报", usage: "research <symbol> [--agent <type>]",
  handler: (args) => {
    const symbol = args[0];
    const agentIdx = args.indexOf("--agent");
    const agent = agentIdx !== -1 ? args[agentIdx + 1] : undefined;
    return researchCommand(symbol, { agent });
  },
});
registerCommand({
  name: "watchlist", aliases: ["wl"],
  description: "自选股", usage: "watchlist [add|remove|list] [symbols...]",
  handler: (args) => watchlistCommand(args[0], args.slice(1)),
});
registerCommand({
  name: "watch", aliases: ["w"],
  description: "实时行情 Dashboard", usage: "watch <symbol...> [-i N]",
  handler: (args) => {
    const intervalIdx = args.indexOf("-i");
    const interval = intervalIdx !== -1 ? parseInt(args[intervalIdx + 1], 10) : undefined;
    const symbols = args.filter((a, i) => i !== intervalIdx && (intervalIdx === -1 || i !== intervalIdx + 1));
    return watchCommand(symbols, interval ? { interval } : undefined);
  },
});
registerCommand({
  name: "export", aliases: ["exp"],
  description: "导出历史数据", usage: "export <symbol> [-f csv|json] [-d N]",
  handler: (args) => {
    const symbol = args[0];
    const fmtIdx = args.indexOf("-f");
    const format = fmtIdx !== -1 ? args[fmtIdx + 1] : undefined;
    const daysIdx = args.indexOf("-d");
    const days = daysIdx !== -1 ? parseInt(args[daysIdx + 1], 10) : undefined;
    return exportCommand(symbol, { format, days });
  },
});

// ── 版本更新检查（静默、不阻塞） ──
checkForUpdate("0.2.0");

// ── 入口：无参数进入 REPL，有参数走 commander ──
if (process.argv.length <= 2) {
  startRepl();
} else {
  program.parse();
}
