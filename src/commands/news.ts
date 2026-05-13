/**
 * news 命令 — 财经新闻（OpenBB 数据源）
 * 用法：arti news AAPL        — 公司新闻
 *       arti news              — 全球财经新闻
 */
import chalk from "chalk";
import { getCompanyNews, getWorldNews, type NewsItem } from "../openbb.js";
import { title, divider } from "../format.js";
import { output } from "../output.js";
import { track } from "../tracker.js";
import { handleCommand } from "../core/handler.js";
import { withBilling, printDeductResult, InsufficientCreditsError } from "../billing.js";
import { printError } from "../errors.js";

export async function newsCommand(symbol?: string, options?: { limit?: number }): Promise<void> {
  const limit = options?.limit || 15;
  const isCompany = !!symbol;
  const label = isCompany ? `${symbol!.toUpperCase()} 公司新闻` : "全球财经新闻";

  let billed;
  try {
    billed = await withBilling("chat", () => handleCommand(`获取${label}...`, async () => {
      const news: NewsItem[] = isCompany
        ? await getCompanyNews(symbol!.toUpperCase(), limit)
        : await getWorldNews(limit);

      track("news", isCompany ? [symbol!.toUpperCase()] : []);
      return { symbol: symbol?.toUpperCase() || null, news };
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

  const { result: data, deduct } = billed;
  output(data, () => {
    console.log(title(label));

    if (!data.news.length) {
      console.log(chalk.yellow("  暂无新闻"));
      if (isCompany) {
        console.log(chalk.gray("  提示: 部分非美股代码可能无新闻覆盖，试试 arti news 查看全球新闻"));
      }
      printDeductResult(deduct);
      return;
    }

    for (let i = 0; i < data.news.length; i++) {
      const n = data.news[i];
      const num = chalk.gray(`${String(i + 1).padStart(2)}.`);
      const date = n.date ? chalk.gray(`[${n.date.slice(0, 10)}]`) : "";

      console.log(`  ${num} ${date} ${chalk.white(n.title)}`);
      if (n.url) {
        console.log(`      ${chalk.gray.underline(n.url)}`);
      }
      console.log();
    }

    console.log(divider());
    printDeductResult(deduct);
  });
}
