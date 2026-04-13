/**
 * predict 命令 — AI 预测（需要 mention_id 和 user_id）
 * 因为 predict-stock 需要数据库记录，CLI 中改为直接调用 scan-stock 的 AI 解读
 * 用法：arti predict AAPL
 */
import chalk from "chalk";
import ora from "ora";
import { callEdge, fetchQuotes } from "../api.js";
import { title, divider, sentimentBadge, colorChange, kvLine } from "../format.js";

interface PredictionItem {
  direction: "看多" | "看空" | "中性";
  confidence: number;
  target_price: number | null;
  reasoning: string;
}

interface ScanResult {
  price?: number;
  change_percent?: number;
  ai_summary?: string;
  signal?: string;
  quick_master?: {
    signal: string;
    entry: string;
    stop_loss: string;
    targets: string[];
    reasoning: string;
  };
  [key: string]: unknown;
}

export async function predictCommand(symbol: string): Promise<void> {
  if (!symbol) {
    console.log(chalk.red("请提供股票代码，例如：arti predict AAPL"));
    return;
  }

  symbol = symbol.toUpperCase();
  const spinner = ora(`获取 ${symbol} AI 预测...`).start();

  try {
    // 并行获取行情和扫描数据
    const [quoteResult, scanResult] = await Promise.allSettled([
      fetchQuotes(symbol),
      callEdge<ScanResult>("scan-stock", { symbol }),
    ]);

    spinner.stop();
    console.log(title(`${symbol} AI 预测分析`));

    // 行情摘要
    if (quoteResult.status === "fulfilled" && quoteResult.value.quotes.length) {
      const q = quoteResult.value.quotes[0];
      console.log(kvLine("  当前价格", chalk.bold(`$${q.price.toFixed(2)}`)));
      console.log(kvLine("  涨跌幅", colorChange(q.changePercent, "%")));
      console.log(kvLine("  成交量", chalk.yellow(q.volume)));
      console.log();
    }

    // 扫描分析结果
    if (scanResult.status === "fulfilled") {
      const scan = scanResult.value;

      // 交易信号
      if (scan.signal) {
        const signal = String(scan.signal);
        const signalColor = signal.includes("买") ? chalk.red : signal.includes("卖") ? chalk.green : chalk.yellow;
        console.log(`  ${chalk.bold("交易信号:")} ${signalColor(signal)}`);
        console.log();
      }

      // 大师快评
      if (scan.quick_master) {
        const qm = scan.quick_master;
        console.log(chalk.bold.magenta("  【大师快评】"));
        console.log(kvLine("    信号", qm.signal));
        console.log(kvLine("    进场位", qm.entry));
        console.log(kvLine("    止损位", chalk.red(qm.stop_loss)));
        if (qm.targets.length) {
          console.log(kvLine("    目标位", qm.targets.join(" → ")));
        }
        console.log(chalk.gray("\n    分析:"));
        console.log(qm.reasoning.split("\n").map(l => `      ${l}`).join("\n"));
        console.log();
      }

      // AI 综合解读
      if (scan.ai_summary) {
        console.log(chalk.bold.cyan("  【AI 综合解读】"));
        const summary = String(scan.ai_summary);
        console.log(summary.split("\n").map(l => `    ${l}`).join("\n"));
      }
    } else {
      console.log(chalk.yellow("  扫描数据获取失败，无法生成预测"));
    }

    console.log(divider());
  } catch (err) {
    spinner.fail("预测分析失败");
    console.error(chalk.red(err instanceof Error ? err.message : String(err)));
  }
}
