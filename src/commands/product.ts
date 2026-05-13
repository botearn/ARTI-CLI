/**
 * 主产品三档能力入口
 *
 * quick-scan -> Quick Scan
 * full       -> Full 全景研报
 * deep       -> Deep 深度研报
 */
import chalk from "chalk";
import { predictCommand } from "./predict.js";
import { researchCommand } from "./research.js";

export async function quickScanCommand(symbol: string): Promise<void> {
  if (!symbol) {
    console.log(chalk.red("请提供股票代码，例如：arti quick-scan AAPL"));
    return;
  }

  return predictCommand(symbol);
}

export async function fullReportCommand(
  symbol: string,
  options?: { full?: boolean },
): Promise<void> {
  if (!symbol) {
    console.log(chalk.red("请提供股票代码，例如：arti full AAPL"));
    return;
  }

  return researchCommand(symbol, {
    mode: "layer1-only",  // 修复：全景报告对应后端的 layer1-only
    full: options?.full,
  });
}

export async function deepReportCommand(
  symbol: string,
  options?: { full?: boolean },
): Promise<void> {
  if (!symbol) {
    console.log(chalk.red("请提供股票代码，例如：arti deep AAPL"));
    return;
  }

  return researchCommand(symbol, {
    mode: "full",  // 修复：深度报告对应后端的 full（包含 Layer 1+2+3）
    full: options?.full,
  });
}
