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
import { handleCommandWithOutput } from "../core/handler.js";

export async function newsCommand(symbol?: string): Promise<void> {
  const isCompany = !!symbol;
  const label = isCompany ? `${symbol!.toUpperCase()} 公司新闻` : "全球财经新闻";

  await handleCommandWithOutput(`获取${label}...`, async () => {
    const news: NewsItem[] = isCompany
      ? await getCompanyNews(symbol!.toUpperCase(), 15)
      : await getWorldNews(15);

    track("news", isCompany ? [symbol!.toUpperCase()] : []);

    const data = { symbol: symbol?.toUpperCase() || null, news };
    return {
      data,
      render: () => {
        console.log(title(label));

        if (!news.length) {
          console.log(chalk.yellow("  暂无新闻"));
          return;
        }

        for (let i = 0; i < news.length; i++) {
          const n = news[i];
          const num = chalk.gray(`${String(i + 1).padStart(2)}.`);
          const date = n.date ? chalk.gray(`[${n.date.slice(0, 10)}]`) : "";
          const source = n.source ? chalk.blue(`(${n.source})`) : "";

          console.log(`  ${num} ${date} ${chalk.white(n.title)} ${source}`);
          if (n.url) {
            console.log(`      ${chalk.gray.underline(n.url)}`);
          }
          console.log();
        }

        console.log(divider());
      },
    };
  });
}
