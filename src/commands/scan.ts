/**
 * scan 命令 — 技术指标扫描
 * 用法：arti scan AAPL
 */
import chalk from "chalk";
import ora from "ora";
import { scanStock } from "../api.js";
import { title, kvLine, divider, colorChange } from "../format.js";

export async function scanCommand(symbol: string): Promise<void> {
  if (!symbol) {
    console.log(chalk.red("请提供股票代码，例如：arti scan AAPL"));
    return;
  }

  symbol = symbol.toUpperCase();
  const spinner = ora(`扫描 ${symbol} 技术指标...`).start();

  try {
    const data = await scanStock(symbol);
    spinner.stop();

    console.log(title(`${symbol} 技术扫描`));

    // 基础信息
    if (data.price !== undefined) {
      console.log(kvLine("  当前价格", chalk.bold(`$${data.price}`)));
    }
    if (data.change_percent !== undefined) {
      console.log(kvLine("  涨跌幅", colorChange(data.change_percent as number, "%")));
    }

    // 均线
    const maKeys = ["ma5", "ma10", "ma20", "ma60", "ma200"];
    const maValues = maKeys.filter(k => data[k] !== undefined && data[k] !== null);
    if (maValues.length) {
      console.log(chalk.gray("\n  均线系统:"));
      for (const k of maValues) {
        const val = data[k] as number;
        const label = k.toUpperCase();
        const aboveBelow = data.price
          ? (data.price as number) > val
            ? chalk.red("▲ 在上方")
            : chalk.green("▼ 在下方")
          : "";
        console.log(`    ${chalk.white(label.padEnd(8))} ${chalk.bold(val.toFixed(2).padStart(10))} ${aboveBelow}`);
      }
    }

    // RSI
    if (data.rsi !== undefined && data.rsi !== null) {
      const rsi = data.rsi as number;
      let rsiColor = chalk.white;
      let rsiLabel = "中性";
      if (rsi > 70) { rsiColor = chalk.red; rsiLabel = "超买"; }
      else if (rsi < 30) { rsiColor = chalk.green; rsiLabel = "超卖"; }
      console.log(`\n  ${chalk.gray("RSI(14):")}     ${rsiColor(`${rsi.toFixed(1)} ${rsiLabel}`)}`);
    }

    // MACD
    if (data.macd !== undefined) {
      const macd = data.macd as Record<string, number>;
      if (macd.macd !== undefined) {
        console.log(chalk.gray("\n  MACD:"));
        console.log(`    DIF:      ${chalk.bold(macd.macd?.toFixed(4) ?? "N/A")}`);
        console.log(`    DEA:      ${chalk.bold(macd.signal?.toFixed(4) ?? "N/A")}`);
        console.log(`    柱状:     ${colorChange(macd.histogram ?? 0)}`);
      }
    }

    // AI 解读
    if (data.ai_summary) {
      console.log(chalk.gray("\n  AI 解读:"));
      const summary = String(data.ai_summary);
      console.log(summary.split("\n").map(l => `    ${l}`).join("\n"));
    }

    // 交易信号
    if (data.signal) {
      const signal = String(data.signal);
      const signalColor = signal.includes("买") ? chalk.red : signal.includes("卖") ? chalk.green : chalk.yellow;
      console.log(`\n  ${chalk.bold("信号:")} ${signalColor(signal)}`);
    }

    console.log(divider());
  } catch (err) {
    spinner.fail("技术扫描失败");
    console.error(chalk.red(err instanceof Error ? err.message : String(err)));
  }
}
