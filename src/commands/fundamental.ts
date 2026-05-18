/**
 * fundamental 命令 — 公司基本面数据
 * 用法：arti fundamental AAPL
 *       arti fundamental AAPL --fields income,metrics
 */
import chalk from "chalk";
import { getFundamental, type FundamentalData } from "../openbb.js";
import { title, kvLine, divider } from "../format.js";
import { track } from "../tracker.js";
import { handleCommandWithOutput } from "../core/handler.js";
import {
  canUseBackendMcp,
  fetchCompanyProfileFromBackendMcp,
  fetchDividendHistoryFromBackendMcp,
  fetchFinancialReportFromBackendMcp,
  fetchStockInfoFromBackendMcp,
} from "../data/mcp-client.js";

const VALID_FIELDS = ["income", "balance", "metrics", "dividends"] as const;
type FundamentalField = typeof VALID_FIELDS[number];

export async function fundamentalCommand(
  symbol: string,
  options?: { fields?: string },
): Promise<void> {
  if (!symbol) {
    console.log(chalk.red("请提供股票代码，例如：arti fundamental AAPL"));
    return;
  }

  const sym = symbol.toUpperCase();
  const fields: FundamentalField[] = options?.fields
    ? options.fields.split(",").filter((f): f is FundamentalField => VALID_FIELDS.includes(f as FundamentalField))
    : ["income", "balance", "metrics"];

  if (!fields.length) {
    console.log(chalk.red(`无效的 fields，可用: ${VALID_FIELDS.join(", ")}`));
    return;
  }

  await handleCommandWithOutput(`获取 ${sym} 基本面数据...`, async () => {
    const { result, source } = await getHybridFundamental(sym, fields);
    track("fundamental", [sym]);

    const data = { symbol: sym, fields, source, ...result };
    return {
      data,
      render: () => {
        console.log(title(`${sym} 基本面数据`));

        // 估值指标
        if (result.metrics && !result.metrics_error) {
          console.log(chalk.bold.white("\n  估值指标"));
          const m = result.metrics;
          for (const [key, val] of Object.entries(m)) {
            const display = typeof val === "number" ? val.toLocaleString(undefined, { maximumFractionDigits: 2 }) : String(val ?? "N/A");
            console.log(kvLine(`    ${key}`, chalk.white(display), 30));
          }
        } else if (result.metrics_error) {
          console.log(chalk.yellow(`\n  估值指标: ${result.metrics_error}`));
        }

        // 利润表
        if (result.income?.length && !result.income_error) {
          console.log(chalk.bold.white("\n  利润表（最近季度）"));
          const latest = result.income[0];
          for (const [key, val] of Object.entries(latest)) {
            const display = typeof val === "number"
              ? (Math.abs(val) >= 1e9 ? `${(val / 1e9).toFixed(2)}B` : Math.abs(val) >= 1e6 ? `${(val / 1e6).toFixed(2)}M` : val.toLocaleString())
              : String(val ?? "N/A");
            console.log(kvLine(`    ${key}`, chalk.white(display), 30));
          }
        } else if (result.income_error) {
          console.log(chalk.yellow(`\n  利润表: ${result.income_error}`));
        }

        // 资产负债表
        if (result.balance?.length && !result.balance_error) {
          console.log(chalk.bold.white("\n  资产负债表（最近季度）"));
          const latest = result.balance[0];
          for (const [key, val] of Object.entries(latest)) {
            const display = typeof val === "number"
              ? (Math.abs(val) >= 1e9 ? `${(val / 1e9).toFixed(2)}B` : Math.abs(val) >= 1e6 ? `${(val / 1e6).toFixed(2)}M` : val.toLocaleString())
              : String(val ?? "N/A");
            console.log(kvLine(`    ${key}`, chalk.white(display), 30));
          }
        } else if (result.balance_error) {
          console.log(chalk.yellow(`\n  资产负债表: ${result.balance_error}`));
        }

        // 分红记录
        if (result.dividends?.length && !result.dividends_error) {
          console.log(chalk.bold.white("\n  分红记录"));
          for (const d of result.dividends.slice(0, 5)) {
            const entries = Object.entries(d);
            const line = entries.map(([k, v]) => `${k}: ${v}`).join("  ");
            console.log(`    ${chalk.gray(line)}`);
          }
        } else if (result.dividends_error) {
          console.log(chalk.yellow(`\n  分红记录: ${result.dividends_error}`));
        }

        console.log(divider());
      },
    };
  });
}

async function getHybridFundamental(
  symbol: string,
  fields: FundamentalField[],
): Promise<{ result: FundamentalData; source: "backend_mcp" | "openbb" }> {
  if (canUseBackendMcp(symbol)) {
    try {
      const result: FundamentalData = {};
      const calls: Promise<void>[] = [];

      if (fields.includes("metrics")) {
        calls.push((async () => {
          const [info, profile] = await Promise.all([
            fetchStockInfoFromBackendMcp(symbol),
            fetchCompanyProfileFromBackendMcp(symbol),
          ]);
          result.metrics = { ...info, profile };
        })());
      }

      if (fields.includes("income")) {
        calls.push((async () => {
          const payload = await fetchFinancialReportFromBackendMcp(symbol, "income");
          result.income = normalizeReports(payload);
        })());
      }

      if (fields.includes("balance")) {
        calls.push((async () => {
          const payload = await fetchFinancialReportFromBackendMcp(symbol, "balance");
          result.balance = normalizeReports(payload);
        })());
      }

      if (fields.includes("dividends")) {
        calls.push((async () => {
          const payload = await fetchDividendHistoryFromBackendMcp(symbol);
          result.dividends = normalizeRows(payload, ["dividends", "items", "data"]);
        })());
      }

      await Promise.all(calls);
      return { result, source: "backend_mcp" };
    } catch {
      // fallback below
    }
  }

  return { result: await getFundamental(symbol, fields), source: "openbb" };
}

function normalizeReports(payload: Record<string, unknown>): Record<string, unknown>[] {
  const rows = normalizeRows(payload, ["reports", "items", "data"]);
  return rows.map((row) => {
    const data = row.data;
    return data && typeof data === "object"
      ? { ...row, ...(data as Record<string, unknown>) }
      : row;
  });
}

function normalizeRows(payload: Record<string, unknown>, keys: string[]): Record<string, unknown>[] {
  for (const key of keys) {
    const value = payload[key];
    if (Array.isArray(value)) {
      return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object");
    }
  }
  return [];
}
