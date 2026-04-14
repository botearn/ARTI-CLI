/**
 * search 命令 — 搜索股票代码
 * 用法：arti search 苹果
 *       arti search apple -l 5
 */
import chalk from "chalk";
import { searchEquity, type SearchResult } from "../openbb.js";
import { title, divider } from "../format.js";
import { track } from "../tracker.js";
import { handleCommandWithOutput } from "../core/handler.js";

export async function searchCommand(query: string, options?: { limit?: number }): Promise<void> {
  if (!query) {
    console.log(chalk.red("请提供搜索关键词，例如：arti search 苹果"));
    return;
  }

  const limit = options?.limit ?? 10;

  await handleCommandWithOutput(`搜索 "${query}"...`, async () => {
    const results = await searchEquity(query, limit);
    track("search", [query]);

    const data = { query, results };
    return {
      data,
      render: () => {
        console.log(title(`搜索: "${query}"`));

        if (!results.length) {
          console.log(chalk.yellow("  未找到匹配结果"));
          return;
        }

        console.log(chalk.gray("  代码".padEnd(14) + "公司名称"));
        console.log(chalk.gray("  " + "─".repeat(50)));

        for (const r of results) {
          const sym = chalk.bold((r.symbol || "").padEnd(12));
          const name = chalk.white(r.name || "");
          console.log(`  ${sym}${name}`);
        }

        console.log(divider());
        console.log(chalk.gray(`  共 ${results.length} 条结果\n`));
      },
    };
  });
}
