/**
 * watchlist 命令 — 自选股管理
 * 用法：arti watchlist              — 查看自选股行情
 *       arti watchlist add AAPL     — 添加自选
 *       arti watchlist remove AAPL  — 移除自选
 *       arti watchlist list         — 仅列出代码
 */
import chalk from "chalk";
import { getWatchlist, watchlistAdd, watchlistRemove } from "../core/session.js";
import { quoteCommand } from "./quote.js";
import { assertWatchlistCapacity, PlanAccessError } from "../billing.js";
import { printError } from "../errors.js";

export async function watchlistCommand(sub?: string, symbols?: string[]): Promise<void> {
  if (sub === "add") {
    if (!symbols?.length) {
      console.log(chalk.red("请提供股票代码，例如：arti watchlist add AAPL NVDA"));
      return;
    }
    try {
      const existing = new Set(getWatchlist());
      const uniqueAdds = symbols
        .map((symbol) => symbol.toUpperCase().trim())
        .filter((symbol, index, arr) => symbol && arr.indexOf(symbol) === index && !existing.has(symbol));
      assertWatchlistCapacity(existing.size + uniqueAdds.length);
    } catch (err) {
      if (err instanceof PlanAccessError) {
        console.log(chalk.red(`\n  ✗ ${err.message}\n`));
        return;
      }
      printError(err);
      return;
    }
    const added = watchlistAdd(...symbols);
    if (added.length) {
      console.log(chalk.green(`  已添加到自选: ${added.join(", ")}`));
    } else {
      console.log(chalk.yellow("  这些股票已在自选中"));
    }
    const wl = getWatchlist();
    console.log(chalk.gray(`  当前自选 (${wl.length}): ${wl.join(", ")}`));
    return;
  }

  if (sub === "remove" || sub === "rm") {
    if (!symbols?.length) {
      console.log(chalk.red("请提供要移除的股票代码"));
      return;
    }
    const removed = watchlistRemove(...symbols);
    if (removed.length) {
      console.log(chalk.green(`  已移除: ${removed.join(", ")}`));
    } else {
      console.log(chalk.yellow("  这些股票不在自选中"));
    }
    const wl = getWatchlist();
    console.log(chalk.gray(`  当前自选 (${wl.length}): ${wl.join(", ") || "空"}`));
    return;
  }

  if (sub === "list" || sub === "ls") {
    const wl = getWatchlist();
    if (!wl.length) {
      console.log(chalk.yellow("  自选列表为空，使用 arti watchlist add AAPL 添加"));
      return;
    }
    console.log(chalk.cyan(`\n  自选股 (${wl.length}):`));
    for (const sym of wl) {
      console.log(`    ${chalk.white(sym)}`);
    }
    console.log();
    return;
  }

  // 默认：显示自选股行情
  const wl = getWatchlist();
  if (!wl.length) {
    console.log(chalk.yellow("  自选列表为空，使用 arti watchlist add AAPL NVDA 添加"));
    return;
  }

  // 复用 quoteCommand 展示行情
  await quoteCommand(wl);
}
