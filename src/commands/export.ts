/**
 * export 命令 — 导出历史数据到 CSV / JSON 文件
 * 用法：arti export AAPL --format csv --days 90
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import chalk from "chalk";
import { getHistorical, type HistoricalBar } from "../openbb.js";
import { handleCommand } from "../core/handler.js";
import { track } from "../tracker.js";

interface ExportOptions {
  format?: string;
  days?: number;
  output?: string;
}

function toCsv(data: HistoricalBar[]): string {
  const header = "date,open,high,low,close,volume";
  const rows = data.map(d =>
    `${d.date},${d.open},${d.high},${d.low},${d.close},${d.volume}`
  );
  return [header, ...rows].join("\n") + "\n";
}

export async function exportCommand(symbol: string, opts?: ExportOptions): Promise<void> {
  if (!symbol) {
    console.log(chalk.red("请提供股票代码，例如：arti export AAPL"));
    return;
  }

  const sym = symbol.toUpperCase();
  const format = (opts?.format || "csv").toLowerCase();
  const days = opts?.days ?? 60;

  if (format !== "csv" && format !== "json") {
    console.log(chalk.red(`不支持的格式: ${format}，可用: csv, json`));
    return;
  }

  const result = await handleCommand(`导出 ${sym} 历史数据...`, async () => {
    const data = await getHistorical(sym, days);
    return data;
  });

  if (!result || !result.length) {
    console.log(chalk.yellow("  未获取到历史数据"));
    return;
  }

  const defaultFile = `${sym}_${days}d.${format}`;
  const outPath = resolve(opts?.output || defaultFile);
  const content = format === "csv" ? toCsv(result) : JSON.stringify(result, null, 2) + "\n";

  writeFileSync(outPath, content, "utf-8");
  track("export", [sym]);

  console.log(chalk.green(`\n  已导出 ${result.length} 条记录 → ${outPath}`));
  console.log(chalk.gray(`  格式: ${format.toUpperCase()} | 周期: ${days} 天 | 股票: ${sym}\n`));
}
