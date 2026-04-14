/**
 * economy 命令 — 宏观经济数据（FRED / 国债利率）
 * 用法：arti economy treasury          — 国债利率
 *       arti economy fred GDP          — FRED 数据系列
 *       arti economy search CPI        — 搜索 FRED 系列
 */
import chalk from "chalk";
import { getFredSeries, getFredSearch, getTreasuryRates, type EconomyData } from "../openbb.js";
import { title, divider } from "../format.js";
import { track } from "../tracker.js";
import { handleCommandWithOutput } from "../core/handler.js";

const USAGE = `用法:
  arti economy treasury              国债利率
  arti economy fred <series_id>      FRED 数据（如 GDP, UNRATE, CPIAUCSL）
  arti economy search <keyword>      搜索 FRED 数据系列`;

export async function economyCommand(
  sub?: string,
  args?: string[],
  options?: { limit?: number },
): Promise<void> {
  if (!sub) {
    console.log(chalk.yellow(USAGE));
    return;
  }

  const cmd = sub.toLowerCase();
  const limit = options?.limit ?? 20;

  if (cmd === "treasury") {
    await handleCommandWithOutput("获取国债利率...", async () => {
      const result = await getTreasuryRates(limit);
      track("economy", ["treasury"]);
      return { data: { indicator: "treasury_rates", ...result }, render: () => renderTable("美国国债利率", result) };
    });
  } else if (cmd === "fred") {
    const seriesId = args?.[0];
    if (!seriesId) {
      console.log(chalk.red("请提供 FRED 系列 ID，例如：arti economy fred GDP"));
      return;
    }
    await handleCommandWithOutput(`获取 FRED ${seriesId.toUpperCase()} 数据...`, async () => {
      const result = await getFredSeries(seriesId.toUpperCase(), limit);
      track("economy", ["fred", seriesId.toUpperCase()]);
      return { data: { indicator: "fred_series", series_id: seriesId.toUpperCase(), ...result }, render: () => renderTable(`FRED: ${seriesId.toUpperCase()}`, result) };
    });
  } else if (cmd === "search") {
    const query = args?.join(" ");
    if (!query) {
      console.log(chalk.red("请提供搜索关键词，例如：arti economy search CPI"));
      return;
    }
    await handleCommandWithOutput(`搜索 FRED "${query}"...`, async () => {
      const result = await getFredSearch(query, limit);
      track("economy", ["search", query]);
      return { data: { indicator: "fred_search", query, ...result }, render: () => renderSearch(query, result) };
    });
  } else {
    console.log(chalk.red(`未知子命令: ${sub}`));
    console.log(chalk.yellow(USAGE));
  }
}

function renderTable(label: string, result: EconomyData): void {
  console.log(title(label));

  if (!result.data?.length) {
    console.log(chalk.yellow("  暂无数据"));
    return;
  }

  // 自动表头
  const keys = Object.keys(result.data[0]);
  const header = keys.map(k => k.padStart(14)).join("  ");
  console.log(chalk.gray(`  ${header}`));
  console.log(chalk.gray("  " + "─".repeat(Math.max(70, keys.length * 16))));

  for (const row of result.data) {
    const cols = keys.map(k => {
      const v = row[k];
      if (v == null) return "N/A".padStart(14);
      if (typeof v === "number") return v.toLocaleString(undefined, { maximumFractionDigits: 4 }).padStart(14);
      return String(v).slice(0, 14).padStart(14);
    });
    console.log(`  ${cols.join("  ")}`);
  }

  console.log(divider());
  console.log(chalk.gray(`  共 ${result.data.length} 条记录\n`));
}

function renderSearch(query: string, result: EconomyData): void {
  console.log(title(`FRED 搜索: "${query}"`));

  if (!result.data?.length) {
    console.log(chalk.yellow("  未找到匹配的数据系列"));
    return;
  }

  for (let i = 0; i < result.data.length; i++) {
    const item = result.data[i];
    const num = chalk.gray(`${String(i + 1).padStart(2)}.`);
    const id = chalk.bold(String(item.id || item.series_id || ""));
    const name = chalk.white(String(item.title || item.name || ""));
    console.log(`  ${num} ${id}  ${name}`);
    if (item.notes || item.description) {
      console.log(`      ${chalk.gray(String(item.notes || item.description).slice(0, 80))}`);
    }
    console.log();
  }

  console.log(divider());
}
