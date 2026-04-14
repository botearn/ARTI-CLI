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
import { historyCommand } from "./commands/history.js";
import { cryptoCommand } from "./commands/crypto.js";
import { fundamentalCommand } from "./commands/fundamental.js";
import { optionsCommand } from "./commands/options.js";
import { economyCommand } from "./commands/economy.js";
import { searchCommand } from "./commands/search.js";
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

// ── history：历史价格 ──
program
  .command("history")
  .description("查看股票历史价格（OHLCV 表格）")
  .argument("<symbol>", "股票代码")
  .option("-d, --days <n>", "历史天数", "60")
  .addHelpText("after", `
示例:
  $ arti history AAPL              # 默认 60 天
  $ arti history NVDA -d 30        # 最近 30 天
  $ arti history TSLA --json       # JSON 输出`)
  .action((symbol, opts) => historyCommand(symbol, { days: parseInt(opts.days, 10) }));

// ── crypto：加密货币 ──
program
  .command("crypto")
  .description("查看加密货币历史价格")
  .argument("<symbol>", "加密货币代码，如 BTCUSD、ETHUSD")
  .option("-d, --days <n>", "历史天数", "30")
  .addHelpText("after", `
示例:
  $ arti crypto BTCUSD             # 比特币 30 天
  $ arti crypto ETHUSD -d 7        # 以太坊 7 天
  $ arti crypto BTCUSD --json      # JSON 输出`)
  .action((symbol, opts) => cryptoCommand(symbol, { days: parseInt(opts.days, 10) }));

// ── fundamental：基本面 ──
program
  .command("fundamental")
  .description("公司基本面数据（财报 / 估值 / 分红）")
  .argument("<symbol>", "股票代码")
  .option("--fields <list>", "数据类别: income,balance,metrics,dividends", "income,balance,metrics")
  .addHelpText("after", `
示例:
  $ arti fundamental AAPL                      # 利润表+资产负债+估值
  $ arti fundamental NVDA --fields metrics     # 仅估值指标
  $ arti fundamental TSLA --fields income,dividends --json`)
  .action((symbol, opts) => fundamentalCommand(symbol, { fields: opts.fields }));

// ── options：期权链 ──
program
  .command("options")
  .description("查看股票期权链（行权价 / IV / 持仓量）")
  .argument("<symbol>", "股票代码")
  .option("-l, --limit <n>", "返回条数", "20")
  .addHelpText("after", `
示例:
  $ arti options AAPL              # 默认 20 条
  $ arti options NVDA -l 10        # 前 10 条
  $ arti options TSLA --json       # JSON 输出`)
  .action((symbol, opts) => optionsCommand(symbol, { limit: parseInt(opts.limit, 10) }));

// ── economy：宏观经济 ──
program
  .command("economy")
  .description("宏观经济数据（国债利率 / FRED 数据系列）")
  .argument("[sub]", "子命令: treasury | fred <id> | search <keyword>")
  .argument("[args...]", "子命令参数")
  .option("-l, --limit <n>", "返回条数", "20")
  .addHelpText("after", `
示例:
  $ arti economy treasury          # 国债利率
  $ arti economy fred GDP          # GDP 数据
  $ arti economy fred UNRATE       # 失业率
  $ arti economy search CPI        # 搜索 CPI 相关系列
  $ arti economy treasury --json   # JSON 输出`)
  .action((sub, args, opts) => economyCommand(sub, args, { limit: parseInt(opts.limit, 10) }));

// ── search：搜索股票 ──
program
  .command("search")
  .description("搜索股票代码（支持公司名称、代码模糊搜索）")
  .argument("<query>", "搜索关键词，如 Apple、腾讯、MSFT")
  .option("-l, --limit <n>", "返回条数", "10")
  .addHelpText("after", `
示例:
  $ arti search apple              # 搜索 Apple 相关股票
  $ arti search 腾讯               # 中文搜索
  $ arti search bank -l 20         # 返回 20 条
  $ arti search tesla --json       # JSON 输出`)
  .action((query, opts) => searchCommand(query, { limit: parseInt(opts.limit, 10) }));

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

// ── research：三层级 AI 研报（Orchestrator SSE） ──
program
  .command("research")
  .description("三层级 AI 研报（分析师 → 大师辩论 → 圆桌裁定）")
  .argument("<symbol>", "股票代码")
  .option("-a, --agent <type>", "仅调单个分析师: natasha|steve|tony|thor|clint|sam|vision|wanda")
  .option("-f, --full", "显示完整报告（默认仅摘要）")
  .option("-m, --mode <mode>", "研报模式: full | layer1-only", "full")
  .addHelpText("after", `
示例:
  $ arti research AAPL             # 完整三层级研报
  $ arti research NVDA -a tony     # 仅 Tony（技术面）快速分析
  $ arti research TSLA -f          # 显示完整报告
  $ arti research AAPL -m layer1-only  # 仅 Layer 1 分析师，跳过大师辩论

三层结构:
  Layer 1 — 8 位分析师并行分析
    natasha(情报·宏观) steve(板块轮动) tony(技术面) thor(风控)
    clint(基本面) sam(收益分析) vision(量化验证) wanda(组合策略)
  Layer 2 — 投资大师圆桌辩论（动态路由）
    巴菲特 林奇 马克斯 索罗斯 达里奥 德鲁肯米勒 段永平
  Layer 3 — 综合裁定（多空联盟 + 分歧点 + 失败信号）`)
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
  description: "三层级 AI 研报", usage: "research <symbol> [--agent <type>] [--mode full|layer1-only]",
  handler: (args) => {
    const symbol = args[0];
    const agentIdx = Math.max(args.indexOf("-a"), args.indexOf("--agent"));
    const agent = agentIdx !== -1 ? args[agentIdx + 1] : undefined;
    const modeIdx = Math.max(args.indexOf("-m"), args.indexOf("--mode"));
    const mode = modeIdx !== -1 ? args[modeIdx + 1] : undefined;
    const full = args.includes("--full") || args.includes("-f");
    return researchCommand(symbol, { agent, mode, full });
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

registerCommand({
  name: "history", aliases: ["hist"],
  description: "历史价格", usage: "history <symbol> [-d N]",
  handler: (args) => {
    const daysIdx = args.indexOf("-d");
    const days = daysIdx !== -1 ? parseInt(args[daysIdx + 1], 10) : undefined;
    const symbol = args.find((a, i) => i !== daysIdx && (daysIdx === -1 || i !== daysIdx + 1));
    return historyCommand(symbol!, days ? { days } : undefined);
  },
});
registerCommand({
  name: "crypto", aliases: ["cr"],
  description: "加密货币历史", usage: "crypto <symbol> [-d N]",
  handler: (args) => {
    const daysIdx = args.indexOf("-d");
    const days = daysIdx !== -1 ? parseInt(args[daysIdx + 1], 10) : undefined;
    const symbol = args.find((a, i) => i !== daysIdx && (daysIdx === -1 || i !== daysIdx + 1));
    return cryptoCommand(symbol!, days ? { days } : undefined);
  },
});
registerCommand({
  name: "fundamental", aliases: ["fund"],
  description: "基本面数据", usage: "fundamental <symbol> [--fields income,metrics]",
  handler: (args) => {
    const symbol = args[0];
    const fieldsIdx = args.indexOf("--fields");
    const fields = fieldsIdx !== -1 ? args[fieldsIdx + 1] : undefined;
    return fundamentalCommand(symbol, fields ? { fields } : undefined);
  },
});
registerCommand({
  name: "options", aliases: ["opt"],
  description: "期权链", usage: "options <symbol> [-l N]",
  handler: (args) => {
    const limitIdx = args.indexOf("-l");
    const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : undefined;
    const symbol = args.find((a, i) => i !== limitIdx && (limitIdx === -1 || i !== limitIdx + 1));
    return optionsCommand(symbol!, limit ? { limit } : undefined);
  },
});
registerCommand({
  name: "economy", aliases: ["eco"],
  description: "宏观经济数据", usage: "economy treasury | fred <id> | search <keyword> [-l N]",
  handler: (args) => {
    const limitIdx = args.indexOf("-l");
    const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : undefined;
    const sub = args[0];
    const rest = args.slice(1).filter((a, i) => {
      const absIdx = i + 1;
      return absIdx !== limitIdx && (limitIdx === -1 || absIdx !== limitIdx + 1);
    });
    return economyCommand(sub, rest, limit ? { limit } : undefined);
  },
});
registerCommand({
  name: "search", aliases: ["find"],
  description: "搜索股票代码", usage: "search <keyword> [-l N]",
  handler: (args) => {
    const limitIdx = args.indexOf("-l");
    const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : undefined;
    const query = args.filter((a, i) => i !== limitIdx && (limitIdx === -1 || i !== limitIdx + 1)).join(" ");
    return searchCommand(query, limit ? { limit } : undefined);
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
