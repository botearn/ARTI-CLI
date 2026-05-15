/**
 * predict 命令 — 综合预测分析（OpenBB 数据源）
 * 整合行情报价 + 技术指标 → 生成综合研判
 * 用法：arti predict AAPL
 */
import chalk from "chalk";
import { getQuote, getCompanyNews, classifySignal, type QuoteData, type TechnicalData } from "../openbb.js";
import { title, divider, sentimentBadge, colorChange, kvLine, confidenceBar } from "../format.js";
import { output } from "../output.js";
import { track } from "../tracker.js";
import { handleCommand } from "../core/handler.js";
import { withBilling, printDeductResult, InsufficientCreditsError } from "../billing.js";
import { printError } from "../errors.js";
import { getHybridTechnical } from "../data/index.js";

/** 根据技术指标生成综合预测 */
function generatePrediction(quote: QuoteData | null, tech: TechnicalData) {
  const signals = tech.signals;
  const bullSignals = signals.filter(s => classifySignal(s) === "bull");
  const bearSignals = signals.filter(s => classifySignal(s) === "bear");

  const bullScore = bullSignals.length;
  const bearScore = bearSignals.length;
  const total = Math.max(signals.length, 1);

  let direction: string;
  let confidence: number;

  if (bullScore > bearScore) {
    direction = "看多";
    confidence = Math.min(0.5 + (bullScore - bearScore) / total * 0.4, 0.95);
  } else if (bearScore > bullScore) {
    direction = "看空";
    confidence = Math.min(0.5 + (bearScore - bullScore) / total * 0.4, 0.95);
  } else {
    direction = "中性";
    confidence = 0.4;
  }

  // 支撑位/压力位估算
  const support = tech.bbands?.lower ?? (tech.ma.MA20 ? tech.ma.MA20 * 0.98 : null);
  const resistance = tech.bbands?.upper ?? (tech.ma.MA20 ? tech.ma.MA20 * 1.02 : null);

  // 建议
  const reasons: string[] = [];
  if (tech.rsi !== null) {
    if (tech.rsi > 70) reasons.push(`RSI=${tech.rsi.toFixed(1)}，处于超买区间，短期有回调压力`);
    else if (tech.rsi < 30) reasons.push(`RSI=${tech.rsi.toFixed(1)}，处于超卖区间，存在反弹机会`);
    else reasons.push(`RSI=${tech.rsi.toFixed(1)}，处于中性区间`);
  }
  if (tech.macd) {
    if (tech.macd.histogram > 0) reasons.push("MACD柱状为正，多头动能延续");
    else reasons.push("MACD柱状为负，空头动能主导");
  }
  if (tech.adx !== null) {
    if (tech.adx > 25) reasons.push(`ADX=${tech.adx.toFixed(1)}，趋势明确`);
    else reasons.push(`ADX=${tech.adx.toFixed(1)}，趋势不明朗，可能震荡`);
  }
  if (tech.ma.MA5 && tech.ma.MA20) {
    if (tech.ma.MA5 > tech.ma.MA20) reasons.push("短期均线在长期均线上方，多头排列");
    else reasons.push("短期均线在长期均线下方，空头排列");
  }

  return { direction, confidence, support, resistance, reasons, bullSignals, bearSignals };
}

export async function predictCommand(symbol: string): Promise<void> {
  if (!symbol) {
    console.log(chalk.red("请提供股票代码，例如：arti predict AAPL"));
    return;
  }

  symbol = symbol.toUpperCase();

  let billed;
  try {
    billed = await withBilling("quickScan", () => handleCommand(`获取 ${symbol} 数据进行综合预测...`, async () => {
      // 串行获取：避免并发子进程争抢 yfinance 资源
      let quote = null;
      try { quote = await getQuote(symbol); } catch { /* ignore */ }
      let tech = null;
      let technicalSource: "arti-data" | "openbb" = "openbb";
      try {
        const hybrid = await getHybridTechnical(symbol, 220);
        tech = hybrid.technical;
        technicalSource = hybrid.source;
      } catch { /* ignore */ }
      let news: Awaited<ReturnType<typeof getCompanyNews>> = [];
      try { news = await getCompanyNews(symbol, 5); } catch { /* ignore */ }
      track("predict", [symbol]);

      return { quote, tech, news, technicalSource };
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

  const { result, deduct } = billed;
  const { quote, tech, news, technicalSource } = result;

  if (!tech || tech.error) {
    console.log(chalk.red(`  无法获取 ${symbol} 技术数据: ${tech?.error || "未知错误"}`));
    return;
  }

  const prediction = generatePrediction(quote, tech);
  const jsonData = { symbol, quote, technical: tech, technicalSource, news, prediction };

  output(jsonData, () => {
    console.log(title(`${symbol} 综合预测分析`));

    // 行情摘要
    if (quote) {
      const price = quote.last_price || quote.prev_close || 0;
      const change = quote.change ?? 0;
      const changePct = quote.change_percent ?? 0;
      console.log(kvLine("  当前价格", chalk.bold(`$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)));
      console.log(kvLine("  涨跌幅", colorChange(changePct, "%")));
      console.log(kvLine("  成交量", chalk.yellow(quote.volume?.toLocaleString() || "N/A")));
      console.log();
    }

    // 综合预测
    console.log(chalk.bold.magenta("  【综合预测】"));
    console.log(`  方向: ${sentimentBadge(prediction.direction)}`);
    console.log(`  置信度: ${confidenceBar(prediction.confidence)}`);
    if (prediction.support !== null) {
      console.log(kvLine("  支撑位", chalk.green(`$${prediction.support.toFixed(2)}`)));
    }
    if (prediction.resistance !== null) {
      console.log(kvLine("  压力位", chalk.red(`$${prediction.resistance.toFixed(2)}`)));
    }
    console.log();

    // 多空信号
    if (prediction.bullSignals.length) {
      console.log(chalk.red("  多头信号:"));
      for (const s of prediction.bullSignals) {
        console.log(`    ${chalk.red("▲")} ${s}`);
      }
    }
    if (prediction.bearSignals.length) {
      console.log(chalk.green("  空头信号:"));
      for (const s of prediction.bearSignals) {
        console.log(`    ${chalk.green("▼")} ${s}`);
      }
    }
    console.log();

    // 分析逻辑
    console.log(chalk.bold.cyan("  【分析依据】"));
    for (const reason of prediction.reasons) {
      console.log(`    ${chalk.yellow("•")} ${reason}`);
    }
    console.log();

    // 技术指标快照
    console.log(chalk.bold.cyan("  【技术指标】"));
    if (tech.rsi !== null) console.log(kvLine("    RSI(14)", String(tech.rsi.toFixed(1))));
    if (tech.macd) console.log(kvLine("    MACD", `${tech.macd.MACD.toFixed(4)} / ${tech.macd.signal.toFixed(4)}`));
    if (tech.adx !== null) console.log(kvLine("    ADX(14)", String(tech.adx.toFixed(1))));
    if (tech.atr !== null) console.log(kvLine("    ATR(14)", String(tech.atr.toFixed(2))));
    if (tech.stochastic) console.log(kvLine("    Stochastic", `K=${tech.stochastic.K.toFixed(1)} D=${tech.stochastic.D.toFixed(1)}`));
    console.log();

    // 相关新闻
    if (news.length) {
      console.log(chalk.bold.cyan("  【相关新闻】"));
      for (const n of news) {
        const date = n.date ? chalk.gray(`[${n.date.slice(0, 10)}]`) : "";
        console.log(`    ${date} ${n.title}`);
      }
    }

    console.log(divider());
    console.log(chalk.gray("  * 以上分析基于 ARTI-CLI 技术指标与行情数据自动生成，仅供参考，不构成投资建议"));
    console.log();
    printDeductResult(deduct);
  });
}
