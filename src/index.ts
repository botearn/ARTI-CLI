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
import { configSetCommand, configGetCommand, configListCommand, configResetCommand } from "./commands/config.js";
import { setJsonMode } from "./output.js";

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
  .action(quoteCommand);

// ── market：市场概览 ──
program
  .command("market")
  .description("全球市场概览（指数 / 涨跌榜 / 活跃榜）")
  .argument("[sub]", "子命令: gainers | losers | active")
  .action(marketCommand);

// ── scan：技术扫描 ──
program
  .command("scan")
  .description("技术指标扫描（MA/RSI/MACD/布林带/ATR/ADX + 综合研判）")
  .argument("<symbol>", "股票代码")
  .action(scanCommand);

// ── predict：综合预测 ──
program
  .command("predict")
  .description("综合预测分析（行情 + 技术面 + 新闻 → 多空研判）")
  .argument("<symbol>", "股票代码")
  .action(predictCommand);

// ── news：财经新闻 ──
program
  .command("news")
  .description("财经新闻（指定股票代码查公司新闻，不指定查全球新闻）")
  .argument("[symbol]", "股票代码（可选）")
  .action(newsCommand);

// ── research：多维研报（保留，仍走 Edge Function） ──
program
  .command("research")
  .description("生成多维度 AI 研报（7 位分析师并行，需要后端服务）")
  .argument("<symbol>", "股票代码")
  .option("-a, --agent <type>", "指定单个分析师: natasha|steve|tony|thor|clint|sam|vision")
  .option("-f, --full", "显示完整报告（默认仅摘要）")
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

program.parse();
