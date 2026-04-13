#!/usr/bin/env node
/**
 * ARTI CLI — 智能投研命令行工具
 * 复用 ARTI 平台的 Supabase Edge Functions 后端
 */
import { Command } from "commander";
import { quoteCommand } from "./commands/quote.js";
import { researchCommand } from "./commands/research.js";
import { scanCommand } from "./commands/scan.js";
import { predictCommand } from "./commands/predict.js";

const program = new Command();

program
  .name("arti")
  .description("ARTI 智能投研 CLI — AI 驱动的股票分析工具")
  .version("0.1.0");

// ── quote：实时行情 ──
program
  .command("quote")
  .description("查询实时行情（支持中文名称）")
  .argument("<symbols...>", "股票代码或名称，如 AAPL NVDA 腾讯 0700.HK")
  .action(quoteCommand);

// ── research：多维研报 ──
program
  .command("research")
  .description("生成多维度 AI 研报（7 位分析师并行）")
  .argument("<symbol>", "股票代码")
  .option("-a, --agent <type>", "指定单个分析师: natasha|steve|tony|thor|clint|sam|vision")
  .option("-f, --full", "显示完整报告（默认仅摘要）")
  .action(researchCommand);

// ── scan：技术扫描 ──
program
  .command("scan")
  .description("技术指标扫描（MA/RSI/MACD + AI 解读）")
  .argument("<symbol>", "股票代码")
  .action(scanCommand);

// ── predict：AI 预测 ──
program
  .command("predict")
  .description("AI 综合预测分析（行情 + 技术面 + 大师快评）")
  .argument("<symbol>", "股票代码")
  .action(predictCommand);

program.parse();
