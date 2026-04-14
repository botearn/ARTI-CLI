/**
 * market 命令 — 全球市场概览（OpenBB 数据源）
 * 用法：arti market
 *       arti market gainers
 *       arti market losers
 *       arti market active
 */
import chalk from "chalk";
import ora from "ora";
import { getMarketOverview, getGainers, getLosers, getActive } from "../openbb.js";
import { title, divider, colorChange, kvLine } from "../format.js";
import { printError } from "../errors.js";
import { output } from "../output.js";
import { track } from "../tracker.js";

export async function marketCommand(sub?: string): Promise<void> {
  if (sub === "gainers") return showDiscovery("gainers");
  if (sub === "losers") return showDiscovery("losers");
  if (sub === "active") return showDiscovery("active");

  const spinner = ora("获取全球市场数据...").start();

  try {
    const data = await getMarketOverview();
    spinner.stop();
    track("market", []);

    output(data, () => {
      console.log(title("全球市场概览"));

      // 按区域分组
      const us = data.indices.filter(i => ["^GSPC", "^DJI", "^IXIC", "^RUT", "^VIX"].includes(i.symbol));
      const asia = data.indices.filter(i => ["^HSI", "000001.SS", "^N225"].includes(i.symbol));
      const europe = data.indices.filter(i => ["^FTSE", "^GDAXI"].includes(i.symbol));

      const printGroup = (label: string, items: typeof data.indices) => {
        console.log(chalk.bold.white(`\n  ${label}`));
        for (const idx of items) {
          if (idx.error) {
            console.log(`    ${chalk.gray((idx.name_zh || idx.symbol).padEnd(12))} ${chalk.red("获取失败")}`);
            continue;
          }
          const name = (idx.name_zh || idx.symbol).padEnd(12);
          const close = idx.close.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          console.log(
            `    ${chalk.white(name)} ` +
            `${chalk.bold(close.padStart(12))} ` +
            `${colorChange(idx.change).padStart(12)} ` +
            `${colorChange(idx.change_percent, "%")}` +
            `${idx.date ? chalk.gray(`  [${idx.date}]`) : ""}`
          );
        }
      };

      printGroup("美股", us);
      printGroup("亚太", asia);
      printGroup("欧洲", europe);

      console.log(chalk.gray("\n  提示: arti market gainers | losers | active 查看涨跌榜"));
      console.log(divider());
    });
  } catch (err) {
    spinner.fail("获取市场数据失败");
    printError(err);
  }
}

async function showDiscovery(type: "gainers" | "losers" | "active"): Promise<void> {
  const labels = { gainers: "涨幅榜", losers: "跌幅榜", active: "活跃榜" };
  const fetchers = { gainers: getGainers, losers: getLosers, active: getActive };

  const spinner = ora(`获取${labels[type]}...`).start();

  try {
    const data = await fetchers[type](15);
    spinner.stop();

    output(data, () => {
      console.log(title(labels[type]));
      console.log(
        `    ${chalk.gray("#".padEnd(4))}` +
        `${chalk.gray("代码".padEnd(10))}` +
        `${chalk.gray("名称".padEnd(25))}` +
        `${chalk.gray("价格".padStart(12))}` +
        `${chalk.gray("涨跌幅".padStart(10))}` +
        `${chalk.gray("成交量".padStart(15))}`
      );
      console.log(divider("─", 80));

      for (let i = 0; i < data.length; i++) {
        const item = data[i];
        const sym = String(item.symbol || "").padEnd(10);
        const name = String(item.name || "").slice(0, 22).padEnd(25);
        const price = item.price != null ? item.price.toFixed(2).padStart(12) : "N/A".padStart(12);
        const pctVal = typeof item.change_percent === "number" ? item.change_percent : null;
        const chgPct = pctVal != null ? colorChange(pctVal, "%").padStart(10) : "N/A".padStart(10);
        const vol = item.volume != null ? item.volume.toLocaleString().padStart(15) : "N/A".padStart(15);

        console.log(`    ${String(i + 1).padEnd(4)}${chalk.white(sym)}${chalk.gray(name)}${chalk.bold(price)}${chgPct}${chalk.yellow(vol)}`);
      }

      console.log(divider("─", 80));
    });
  } catch (err) {
    spinner.fail(`获取${labels[type]}失败`);
    printError(err);
  }
}
