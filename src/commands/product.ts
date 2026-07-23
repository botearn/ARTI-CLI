/**
 * 主产品三档能力入口
 *
 * quick-scan -> Quick Scan（产品 scan-stock 函数）
 * full       -> Full 全景研报（orchestrator layer1-only）
 * deep       -> Deep 深度研报（orchestrator full）
 */
import chalk from "chalk";
import { scanStockBackend, type BackendStockData } from "../api.js";
import { researchCommand } from "./research.js";
import { title, kvLine, colorChange, sentimentBadge, sparkline } from "../format.js";
import { output } from "../output.js";
import { track } from "../tracker.js";
import { handleCommand } from "../core/handler.js";
import { withBilling, printDeductResult, InsufficientCreditsError } from "../billing.js";
import { printError } from "../errors.js";

export async function quickScanCommand(symbol: string): Promise<void> {
  if (!symbol) {
    console.log(chalk.red("请提供股票代码，例如：arti quick-scan AAPL"));
    return;
  }

  symbol = symbol.toUpperCase();

  let billed;
  try {
    billed = await withBilling("quickScan", () => handleCommand(`快速扫描 ${symbol}...`, async () => {
      const res = await scanStockBackend(symbol);
      track("quick-scan", [symbol]);
      return res.scan;
    }));
  } catch (err) {
    process.exitCode = 1;
    if (err instanceof InsufficientCreditsError) {
      console.log(chalk.red(`\n  ✗ ${err.message}\n`));
      return;
    }
    printError(err);
    return;
  }

  if (!billed) return;

  const { result: scan, deduct } = billed;
  if (!scan) return;

  output({ symbol, scan }, () => {
    renderQuickScan(symbol, scan);
    printDeductResult(deduct);
  });
}

/** 市值（绝对金额）换算为「亿」并附币种；流通/总由调用方标注 */
function formatMarketCap(value: number, symbol: string): string {
  const currency = /\.HK$/i.test(symbol) ? "亿港元"
    : /\.(SS|SZ)$/i.test(symbol) ? "亿元"
      : "亿美元";
  const yi = value / 1e8;
  const num = yi >= 100 ? Math.round(yi).toLocaleString() : yi.toFixed(2);
  return `${num} ${currency}`;
}

/** 渲染产品 Quick Scan 结果（scan-stock 字段，口径与 web 一致） */
function renderQuickScan(symbol: string, d: BackendStockData): void {
  const t = d.tech ?? {
    trend: d.trend_signal ?? d.overall_signal ?? "中性",
    ma5: d.ma5 ?? null, ma10: d.ma10 ?? null, ma20: d.ma20 ?? null, ma60: d.ma60 ?? null,
    rsi: d.rsi ?? null, macd: d.macd ?? null,
    bb_pos: d.bb_pos ?? null, bb_up: d.bb_up ?? null, bb_dn: d.bb_dn ?? null,
    atr: d.atr ?? null, atr_stop: d.atr_stop ?? null, atr_pct: d.atr_pct ?? null,
    support: d.support ?? null, resist: d.resist ?? null,
  };
  console.log(title(`${symbol} 快速扫描${d.name ? ` · ${d.name}` : ""}`));

  // 行情与综合研判
  console.log(kvLine("  当前价格", chalk.bold(d.price != null ? `$${d.price.toFixed(2)}` : "—")));
  console.log(kvLine("  涨跌幅", d.pct != null ? colorChange(d.pct, "%") : "—"));
  if (d.overall_signal) console.log(kvLine("  综合研判", sentimentBadge(d.overall_signal)));
  if (d.trend_signal && d.trend_signal !== d.overall_signal) {
    console.log(kvLine("  趋势", sentimentBadge(d.trend_signal)));
  }
  const support = t.support ?? d.support;
  const resist = t.resist ?? d.resist;
  if (support != null) console.log(kvLine("  支撑位", chalk.green(`$${support.toFixed(2)}`)));
  if (resist != null) console.log(kvLine("  压力位", chalk.red(`$${resist.toFixed(2)}`)));
  console.log();

  // 均线系统
  const mas: Array<[string, number | null]> = [["MA5", t.ma5], ["MA10", t.ma10], ["MA20", t.ma20], ["MA60", t.ma60]];
  const maRows = mas.filter(([, v]) => v != null) as Array<[string, number]>;
  if (maRows.length) {
    console.log(chalk.bold.cyan("  【均线系统】"));
    for (const [label, val] of maRows) {
      const pos = d.price == null ? "" : d.price > val ? chalk.red("▲ 上方") : chalk.green("▼ 下方");
      console.log(`    ${chalk.white(label.padEnd(6))} ${chalk.bold(val.toFixed(2).padStart(10))} ${pos}`);
    }
    console.log();
  }

  // 技术指标
  console.log(chalk.bold.cyan("  【技术指标】"));
  if (t.rsi != null) {
    let rsiLabel = "中性", c = chalk.white;
    if (t.rsi > 70) { rsiLabel = "超买"; c = chalk.red; }
    else if (t.rsi < 30) { rsiLabel = "超卖"; c = chalk.green; }
    console.log(kvLine("    RSI(14)", c(`${t.rsi.toFixed(1)} ${rsiLabel}`)));
  }
  if (t.macd != null) console.log(kvLine("    MACD", t.macd.toFixed(4)));
  if (t.bb_up != null && t.bb_dn != null) {
    console.log(kvLine("    布林带", `${chalk.green(t.bb_dn.toFixed(2))} ~ ${chalk.red(t.bb_up.toFixed(2))}`));
  }
  if (t.atr != null) console.log(kvLine("    ATR(14)", t.atr.toFixed(2)));
  console.log(kvLine("    量比", String(d.vol_ratio)));
  console.log();

  // 近 5 日走势
  if (d.recent_5d?.length) {
    const closes = d.recent_5d.map(r => r.close);
    console.log(kvLine("  近 5 日", `${sparkline(closes)}  ${colorChange(d.recent_5d[d.recent_5d.length - 1].pct, "%")}`));
  }

  // 基本面快照
  if (d.fundamentals && Object.keys(d.fundamentals).length) {
    const f = d.fundamentals;
    console.log(chalk.bold.cyan("\n  【基本面】"));

    // 市值：换算成「亿」并标明 流通/总
    if (typeof f.market_cap === "number") {
      const capLabel = f.market_cap_basis === "circulating" ? "流通市值" : "市值";
      console.log(kvLine(`    ${capLabel}`, formatMarketCap(f.market_cap, symbol), 18));
    }

    // 其余标量字段：跳过市值元字段，以及嵌套对象/数组（如 quarterly_financials，避免 [object Object]）
    const skip = new Set(["market_cap", "market_cap_basis"]);
    const entries = Object.entries(f).filter(([k, v]) =>
      v != null && !skip.has(k) &&
      (typeof v === "number" || typeof v === "string" || typeof v === "boolean"),
    );
    if (entries.length) {
      const width = Math.max(18, ...entries.map(([k]) => k.length + 6));
      for (const [k, v] of entries) {
        const val = typeof v === "number" ? v.toLocaleString() : String(v);
        console.log(kvLine(`    ${k}`, val, width));
      }
    }
  }

  if (d.data_as_of) console.log(chalk.gray(`\n  数据截至 ${d.data_as_of}${d.market_status ? ` · ${d.market_status}` : ""}`));
  console.log();
}

export async function fullReportCommand(
  symbol: string,
  options?: { full?: boolean },
): Promise<void> {
  if (!symbol) {
    console.log(chalk.red("请提供股票代码，例如：arti full AAPL"));
    return;
  }

  return researchCommand(symbol, {
    mode: "layer1-only",  // 全景报告对应后端的 layer1-only
    full: options?.full,
  });
}

export async function deepReportCommand(
  symbol: string,
  options?: { full?: boolean },
): Promise<void> {
  if (!symbol) {
    console.log(chalk.red("请提供股票代码，例如：arti deep AAPL"));
    return;
  }

  return researchCommand(symbol, {
    mode: "full",  // 深度报告对应后端的 full（包含 Layer 1+2+3）
    full: options?.full,
  });
}
