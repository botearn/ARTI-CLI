/**
 * history 命令 — 查看股票历史价格（OHLCV）
 * 用法：arti history AAPL -d 30
 */
import chalk from "chalk";
import { getHistorical, type HistoricalBar } from "../openbb.js";
import { title, divider, colorChange } from "../format.js";
import { track } from "../tracker.js";
import { handleCommandWithOutput } from "../core/handler.js";

export async function historyCommand(symbol: string, options?: { days?: number }): Promise<void> {
  if (!symbol) {
    console.log(chalk.red("请提供股票代码，例如：arti history AAPL"));
    return;
  }

  const sym = symbol.toUpperCase();
  const days = options?.days ?? 60;

  await handleCommandWithOutput(`获取 ${sym} 历史价格...`, async () => {
    const bars = await getHistorical(sym, days);
    track("history", [sym]);

    const data = { symbol: sym, days, bars };
    return {
      data,
      render: () => {
        console.log(title(`${sym} 历史价格（${days} 天）`));

        if (!bars.length) {
          console.log(chalk.yellow("  暂无历史数据"));
          return;
        }

        // 表头
        console.log(chalk.gray(
          "  日期           开盘       最高       最低       收盘         成交量"
        ));
        console.log(chalk.gray("  " + "─".repeat(70)));

        for (const b of bars) {
          const date = b.date.slice(0, 10);
          const chg = b.close - b.open;
          const chgColor = chg >= 0 ? chalk.red : chalk.green;
          console.log(
            `  ${chalk.white(date)}  ` +
            `${chgColor(b.open.toFixed(2).padStart(9))} ` +
            `${chgColor(b.high.toFixed(2).padStart(9))} ` +
            `${chgColor(b.low.toFixed(2).padStart(9))} ` +
            `${chgColor(b.close.toFixed(2).padStart(9))}  ` +
            `${chalk.gray(b.volume.toLocaleString().padStart(12))}`
          );
        }

        console.log(divider());
        console.log(chalk.gray(`  共 ${bars.length} 条记录\n`));
      },
    };
  });
}
