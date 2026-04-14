/**
 * options 命令 — 期权链数据
 * 用法：arti options AAPL -l 10
 */
import chalk from "chalk";
import { getOptionsChain, type OptionsItem } from "../openbb.js";
import { title, divider, colorChange } from "../format.js";
import { track } from "../tracker.js";
import { handleCommandWithOutput } from "../core/handler.js";

export async function optionsCommand(symbol: string, options?: { limit?: number }): Promise<void> {
  if (!symbol) {
    console.log(chalk.red("请提供股票代码，例如：arti options AAPL"));
    return;
  }

  const sym = symbol.toUpperCase();
  const limit = options?.limit ?? 20;

  await handleCommandWithOutput(`获取 ${sym} 期权链...`, async () => {
    const chain = await getOptionsChain(sym, limit);
    track("options", [sym]);

    const data = { symbol: sym, limit, chain };
    return {
      data,
      render: () => {
        console.log(title(`${sym} 期权链`));

        if (!chain.length) {
          console.log(chalk.yellow("  暂无期权数据"));
          return;
        }

        // 从数据中推断可用列
        const first = chain[0];
        const hasType = "optionType" in first || "option_type" in first;
        const hasStrike = "strike" in first;
        const hasExpiry = "expiration" in first || "expiry" in first;
        const hasIV = "impliedVolatility" in first || "implied_volatility" in first || "iv" in first;
        const hasLast = "lastPrice" in first || "last_price" in first;
        const hasVolume = "volume" in first;
        const hasOI = "openInterest" in first || "open_interest" in first;

        // 表头
        const headers: string[] = [];
        if (hasType) headers.push("类型".padEnd(6));
        if (hasExpiry) headers.push("到期日".padEnd(12));
        if (hasStrike) headers.push("行权价".padStart(10));
        if (hasLast) headers.push("最新价".padStart(10));
        if (hasIV) headers.push("隐含波动率".padStart(12));
        if (hasVolume) headers.push("成交量".padStart(10));
        if (hasOI) headers.push("持仓量".padStart(10));

        if (headers.length) {
          console.log(chalk.gray(`  ${headers.join("  ")}`));
          console.log(chalk.gray("  " + "─".repeat(70)));
        }

        for (const item of chain) {
          const cols: string[] = [];

          const type = String(item.optionType || item.option_type || "");
          if (hasType) {
            const label = type.toLowerCase() === "call" ? chalk.red("CALL".padEnd(6)) : chalk.green("PUT".padEnd(6));
            cols.push(label);
          }
          if (hasExpiry) {
            const exp = String(item.expiration || item.expiry || "").slice(0, 10);
            cols.push(chalk.white(exp.padEnd(12)));
          }
          if (hasStrike) {
            cols.push(chalk.bold(Number(item.strike).toFixed(2).padStart(10)));
          }
          if (hasLast) {
            const last = Number(item.lastPrice ?? item.last_price ?? 0);
            cols.push(chalk.white(last.toFixed(2).padStart(10)));
          }
          if (hasIV) {
            const iv = Number(item.impliedVolatility ?? item.implied_volatility ?? item.iv ?? 0);
            cols.push(chalk.yellow((iv * 100).toFixed(1).padStart(11) + "%"));
          }
          if (hasVolume) {
            cols.push(chalk.gray(Number(item.volume ?? 0).toLocaleString().padStart(10)));
          }
          if (hasOI) {
            const oi = Number(item.openInterest ?? item.open_interest ?? 0);
            cols.push(chalk.gray(oi.toLocaleString().padStart(10)));
          }

          console.log(`  ${cols.join("  ")}`);
        }

        console.log(divider());
        console.log(chalk.gray(`  共 ${chain.length} 条期权\n`));
      },
    };
  });
}
