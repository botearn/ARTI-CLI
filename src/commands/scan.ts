/**
 * scan 命令 — 技术指标扫描（OpenBB 数据源）
 * 用法：arti scan AAPL
 */
import chalk from "chalk";
import { classifySignal } from "../openbb.js";
import { title, kvLine, divider, colorChange } from "../format.js";
import { output } from "../output.js";
import { track } from "../tracker.js";
import { handleCommand } from "../core/handler.js";
import { withBilling, printDeductResult, InsufficientCreditsError } from "../billing.js";
import { printError } from "../errors.js";
import { getHybridTechnical } from "../data/index.js";

export async function scanCommand(symbol: string): Promise<void> {
  if (!symbol) {
    console.log(chalk.red("请提供股票代码，例如：arti scan AAPL"));
    return;
  }

  symbol = symbol.toUpperCase();

  let billed;
  try {
    billed = await withBilling("quickScan", () => handleCommand(`扫描 ${symbol} 技术指标...`, async () => {
      const result = await getHybridTechnical(symbol, 220);
      track("scan", [symbol]);
      return result;
    }));
  } catch (err) {
    if (err instanceof InsufficientCreditsError) {
      console.log(chalk.red(`\n  ✗ ${err.message}\n`));
      return;
    }
    printError(err);
    return;
  }

  if (!billed) return;

  const { result, deduct } = billed;
  const { technical: data, source } = result;
  if (data.error) {
    console.log(chalk.red(`  ${data.error}`));
    return;
  }

  output({ ...data, source }, () => {
    console.log(title(`${symbol} 技术扫描`));

    // 基础信息
    console.log(kvLine("  当前价格", chalk.bold(`$${data.price.toFixed(2)}`)));
    console.log(kvLine("  涨跌", colorChange(data.change)));
    console.log(kvLine("  涨跌幅", colorChange(data.change_percent, "%")));

    // 均线系统
    if (Object.keys(data.ma).length) {
      console.log(chalk.gray("\n  均线系统:"));
      for (const [label, val] of Object.entries(data.ma)) {
        const aboveBelow = data.price > val
          ? chalk.red("▲ 在上方")
          : chalk.green("▼ 在下方");
        console.log(`    ${chalk.white(label.padEnd(8))} ${chalk.bold(val.toFixed(2).padStart(10))} ${aboveBelow}`);
      }
    }

    // RSI
    if (data.rsi !== null) {
      let rsiColor = chalk.white;
      let rsiLabel = "中性";
      if (data.rsi > 70) { rsiColor = chalk.red; rsiLabel = "超买"; }
      else if (data.rsi < 30) { rsiColor = chalk.green; rsiLabel = "超卖"; }
      console.log(`\n  ${chalk.gray("RSI(14):")}     ${rsiColor(`${data.rsi.toFixed(1)} ${rsiLabel}`)}`);
    }

    // MACD
    if (data.macd) {
      console.log(chalk.gray("\n  MACD(12,26,9):"));
      console.log(`    DIF:      ${chalk.bold(data.macd.MACD.toFixed(4))}`);
      console.log(`    DEA:      ${chalk.bold(data.macd.signal.toFixed(4))}`);
      console.log(`    柱状:     ${colorChange(data.macd.histogram)}`);
    }

    // 布林带
    if (data.bbands) {
      console.log(chalk.gray("\n  布林带(20,2):"));
      console.log(`    上轨:     ${chalk.red(data.bbands.upper.toFixed(2))}`);
      console.log(`    中轨:     ${chalk.white(data.bbands.middle.toFixed(2))}`);
      console.log(`    下轨:     ${chalk.green(data.bbands.lower.toFixed(2))}`);
    }

    // ATR
    if (data.atr !== null) {
      console.log(`\n  ${chalk.gray("ATR(14):")}     ${chalk.yellow(data.atr.toFixed(2))}`);
    }

    // ADX
    if (data.adx !== null) {
      const adxLabel = data.adx > 25 ? "趋势较强" : "趋势较弱";
      console.log(`  ${chalk.gray("ADX(14):")}     ${chalk.yellow(`${data.adx.toFixed(1)} ${adxLabel}`)}`);
    }

    // Stochastic
    if (data.stochastic) {
      console.log(chalk.gray("\n  Stochastic(14,3,3):"));
      console.log(`    %K:       ${chalk.bold(data.stochastic.K.toFixed(1))}`);
      console.log(`    %D:       ${chalk.bold(data.stochastic.D.toFixed(1))}`);
    }

    // OBV
    if (data.obv !== null) {
      console.log(`\n  ${chalk.gray("OBV:")}         ${chalk.yellow(data.obv.toLocaleString())}`);
    }

    // 综合信号
    if (data.signals.length) {
      console.log(chalk.gray("\n  技术信号:"));
      for (const sig of data.signals) {
        const cls = classifySignal(sig);
        const color = cls === "bull" ? chalk.red : cls === "bear" ? chalk.green : chalk.yellow;
        console.log(`    ${color("•")} ${sig}`);
      }
    }

    // 综合判断
    const signalColor =
      data.overall_signal === "偏多" ? chalk.red :
      data.overall_signal === "偏空" ? chalk.green :
      chalk.yellow;
    console.log(`\n  ${chalk.bold("综合研判:")} ${signalColor(data.overall_signal)}`);

    console.log(divider());
    printDeductResult(deduct);
  });
}
