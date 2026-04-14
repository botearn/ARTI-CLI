/**
 * quote 命令 — 实时行情查询（OpenBB 数据源）
 * 用法：arti quote AAPL NVDA BTCUSD
 */
import chalk from "chalk";
import { getQuote, getHistorical, searchEquity, type QuoteData } from "../openbb.js";
import { colorChange, kvLine, divider, title, sparkline } from "../format.js";
import { output } from "../output.js";
import { track } from "../tracker.js";
import { handleCommand } from "../core/handler.js";

export async function quoteCommand(symbols: string[]): Promise<void> {
  if (!symbols.length) {
    console.log(chalk.red("请提供股票代码，例如：arti quote AAPL NVDA"));
    return;
  }

  const result = await handleCommand("获取行情数据...", async ({ spinner }) => {
    // 解析 symbols：标准代码直接用，中文名先搜索
    const resolved: string[] = [];
    for (const s of symbols) {
      if (/^[A-Z0-9.^=]+$/i.test(s)) {
        resolved.push(s.toUpperCase());
      } else {
        spinner.text = `搜索 "${s}"...`;
        try {
          const results = await searchEquity(s, 1);
          if (results.length && results[0].symbol) {
            resolved.push(results[0].symbol);
            spinner.text = `"${s}" → ${results[0].symbol}`;
          } else {
            spinner.warn(`无法识别 "${s}"，已跳过`);
            spinner.start();
          }
        } catch {
          spinner.warn(`搜索 "${s}" 失败，已跳过`);
          spinner.start();
        }
      }
    }

    if (!resolved.length) {
      spinner.fail("没有可查询的股票代码");
      return undefined;
    }

    // 逐个 symbol 串行获取（每个 symbol 内 quote+historical 并行）
    // 避免同时启动过多 Python/OpenBB 子进程导致资源竞争被杀
    spinner.text = `获取 ${resolved.join(", ")} 实时行情...`;
    const quotes: { quote: QuoteData; prices: number[] }[] = [];

    for (let idx = 0; idx < resolved.length; idx++) {
      const sym = resolved[idx];
      spinner.text = resolved.length > 1
        ? `获取 ${sym} 行情... (${idx + 1}/${resolved.length})`
        : `获取 ${sym} 行情...`;
      const [quoteResult, histResult] = await Promise.allSettled([
        getQuote(sym),
        getHistorical(sym, 20),
      ]);
      if (quoteResult.status === "rejected") continue;
      const quote = quoteResult.value;
      const prices = histResult.status === "fulfilled"
        ? histResult.value.map(h => h.close)
        : [];
      quotes.push({ quote, prices });
    }

    track("quote", resolved);

    return { quotes: quotes.map(q => ({ ...q.quote, sparkline: q.prices })), _quotes: quotes };
  });

  if (!result) return;

  const { _quotes: quotes } = result;

  output({ quotes: result.quotes }, () => {
    if (!quotes.length) {
      console.log(chalk.yellow("  未获取到行情数据"));
      return;
    }

    console.log(title("实时行情"));

    for (const { quote: q, prices } of quotes) {
      const price = q.last_price || q.prev_close || 0;
      const change = q.change ?? (q.prev_close ? price - q.prev_close : 0);
      const changePct = q.change_percent ?? (q.prev_close ? (change / q.prev_close) * 100 : 0);

      console.log(
        `  ${chalk.bold.white(q.symbol.padEnd(10))} ${chalk.gray(q.name || "")}`
      );
      console.log(kvLine("    价格", chalk.bold(`$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)));
      console.log(kvLine("    涨跌", colorChange(change)));
      console.log(kvLine("    涨跌幅", colorChange(changePct, "%")));
      console.log(kvLine("    成交量", chalk.yellow(q.volume?.toLocaleString() || "N/A")));

      if (q.year_high && q.year_low) {
        console.log(kvLine("    52周范围", `${chalk.green(q.year_low.toFixed(2))} — ${chalk.red(q.year_high.toFixed(2))}`));
      }
      if (q.ma_50d) {
        console.log(kvLine("    50日均线", chalk.white(q.ma_50d.toFixed(2))));
      }

      if (prices.length) {
        console.log(kvLine("    走势", chalk.cyan(sparkline(prices))));
      }

      console.log(divider());
    }
  });
}
