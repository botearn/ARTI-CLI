/**
 * crypto 命令 — 查看加密货币历史价格
 * 用法：arti crypto BTCUSD -d 30
 */
import chalk from "chalk";
import { getCryptoHistory, type HistoricalBar } from "../openbb.js";
import { title, divider } from "../format.js";
import { track } from "../tracker.js";
import { handleCommandWithOutput } from "../core/handler.js";

export async function cryptoCommand(symbol: string, options?: { days?: number }): Promise<void> {
  if (!symbol) {
    console.log(chalk.red("请提供加密货币代码，例如：arti crypto BTCUSD"));
    return;
  }

  const sym = symbol.toUpperCase();
  const days = options?.days ?? 30;

  await handleCommandWithOutput(`获取 ${sym} 加密货币数据...`, async () => {
    const bars = await getCryptoHistory(sym, days);
    track("crypto", [sym]);

    const data = { symbol: sym, days, bars };
    return {
      data,
      render: () => {
        console.log(title(`${sym} 加密货币历史（${days} 天）`));

        if (!bars.length) {
          console.log(chalk.yellow("  暂无数据"));
          return;
        }

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
