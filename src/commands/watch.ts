/**
 * watch 命令 — 实时行情轮询 Dashboard
 * 用法：arti watch AAPL NVDA TSLA
 *       arti watch AAPL -i 10      (10秒间隔)
 */
import chalk from "chalk";
import { getQuote, type QuoteData } from "../openbb.js";
import { colorChange, sparkline } from "../format.js";
import { track } from "../tracker.js";

interface WatchOptions {
  interval?: number;
}

export async function watchCommand(symbols: string[], opts?: WatchOptions): Promise<void> {
  if (!symbols.length) {
    console.log(chalk.red("请提供股票代码，例如：arti watch AAPL NVDA"));
    return;
  }

  const resolved = symbols.map(s => s.toUpperCase());
  const intervalSec = opts?.interval ?? 15;
  const priceHistory: Map<string, number[]> = new Map();

  track("watch", resolved);
  console.log(chalk.cyan(`\n  实时行情 Dashboard — 每 ${intervalSec}s 刷新 (Ctrl+C 退出)\n`));

  async function refresh(): Promise<void> {
    const rows: { quote: QuoteData; trend: number[] }[] = [];

    for (const sym of resolved) {
      try {
        const q = await getQuote(sym);
        const history = priceHistory.get(sym) || [];
        history.push(q.last_price || q.prev_close || 0);
        if (history.length > 20) history.shift();
        priceHistory.set(sym, history);
        rows.push({ quote: q, trend: history });
      } catch {
        // 跳过获取失败的 symbol
      }
    }

    // 清屏并重绘
    process.stdout.write("\x1B[2J\x1B[H");
    const now = new Date().toLocaleTimeString("zh-CN", { hour12: false });
    console.log(chalk.cyan.bold(`\n  ARTI Watch Dashboard`) + chalk.gray(`  ${now}  (${intervalSec}s 刷新, Ctrl+C 退出)\n`));
    console.log(
      chalk.gray("  ") +
      chalk.white("代码".padEnd(10)) +
      chalk.white("价格".padStart(12)) +
      chalk.white("涨跌".padStart(12)) +
      chalk.white("涨跌幅".padStart(10)) +
      chalk.white("成交量".padStart(14)) +
      chalk.white("  走势")
    );
    console.log(chalk.gray("  " + "─".repeat(70)));

    for (const { quote: q, trend } of rows) {
      const price = q.last_price || q.prev_close || 0;
      const change = q.change ?? 0;
      const changePct = q.change_percent ?? 0;
      const vol = q.volume ? (q.volume >= 1_000_000 ? `${(q.volume / 1_000_000).toFixed(1)}M` : `${(q.volume / 1_000).toFixed(0)}K`) : "N/A";

      console.log(
        chalk.gray("  ") +
        chalk.bold.white(q.symbol.padEnd(10)) +
        chalk.white(`$${price.toFixed(2)}`.padStart(12)) +
        colorChange(change).padStart(22) +
        colorChange(changePct, "%").padStart(20) +
        chalk.yellow(vol.padStart(14)) +
        chalk.cyan("  " + sparkline(trend))
      );
    }

    if (!rows.length) {
      console.log(chalk.yellow("  获取行情数据失败，等待下次刷新..."));
    }

    console.log(chalk.gray("\n  " + "─".repeat(70)));
  }

  // 用 setTimeout 递归代替 setInterval，确保上一轮完成后再排下一轮
  // 避免慢网络下 refresh 未完成就触发下一次
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  async function loop(): Promise<void> {
    await refresh();
    if (!stopped) {
      timer = setTimeout(loop, intervalSec * 1000);
    }
  }

  // 首次刷新 + 启动循环
  await loop();

  // 优雅退出：用 once 避免 REPL 多次调用时累积 listener
  await new Promise<void>((resolve) => {
    process.once("SIGINT", () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      console.log(chalk.gray("\n\n  已停止监控\n"));
      resolve();
    });
  });
}
