/**
 * quote 命令 — 实时行情查询
 * 用法：arti quote AAPL NVDA 0700.HK
 */
import chalk from "chalk";
import ora from "ora";
import { fetchQuotes, resolveStock } from "../api.js";
import { colorChange, kvLine, divider, title, sparkline } from "../format.js";

export async function quoteCommand(symbols: string[]): Promise<void> {
  if (!symbols.length) {
    console.log(chalk.red("请提供股票代码，例如：arti quote AAPL NVDA"));
    return;
  }

  const spinner = ora("获取行情数据...").start();

  try {
    // 尝试解析非标准输入（如"苹果"、"腾讯"）
    const resolved: string[] = [];
    for (const s of symbols) {
      if (/^[A-Z0-9.]+$/i.test(s)) {
        resolved.push(s.toUpperCase());
      } else {
        spinner.text = `解析 "${s}"...`;
        const sym = await resolveStock(s);
        if (sym) {
          resolved.push(sym);
        } else {
          spinner.warn(`无法识别 "${s}"，已跳过`);
          spinner.start();
        }
      }
    }

    if (!resolved.length) {
      spinner.fail("没有可查询的股票代码");
      return;
    }

    spinner.text = "获取实时行情...";
    const { quotes, indices } = await fetchQuotes(resolved.join(","));
    spinner.stop();

    // 显示大盘指数
    if (indices.length) {
      console.log(title("大盘指数"));
      for (const idx of indices) {
        console.log(
          `  ${chalk.white(idx.nameZh.padEnd(10))} ` +
          `${chalk.bold(idx.value.toLocaleString().padStart(10))} ` +
          `${colorChange(idx.change).padStart(10)} ` +
          `${colorChange(idx.changePercent, "%")}`
        );
      }
      console.log();
    }

    // 显示个股行情
    if (quotes.length) {
      console.log(title("个股行情"));
      for (const q of quotes) {
        const marketTag = chalk.gray(`[${q.market}]`);
        console.log(
          `  ${marketTag} ${chalk.bold.white(q.symbol.padEnd(8))} ${chalk.gray(q.nameZh)}`
        );
        console.log(kvLine("    价格", chalk.bold("$" + q.price.toFixed(2))));
        console.log(kvLine("    涨跌", colorChange(q.change)));
        console.log(kvLine("    涨跌幅", colorChange(q.changePercent, "%")));
        console.log(kvLine("    成交量", chalk.yellow(q.volume)));
        if (q.sparkline.length) {
          console.log(kvLine("    走势", chalk.cyan(sparkline(q.sparkline))));
        }
        console.log(divider());
      }
    } else {
      console.log(chalk.yellow("  未找到行情数据"));
    }
  } catch (err) {
    spinner.fail("获取行情失败");
    console.error(chalk.red(err instanceof Error ? err.message : String(err)));
  }
}
