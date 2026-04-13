/**
 * research 命令 — 7 分析师多维研报
 * 用法：arti research AAPL [--agent tony]
 */
import chalk from "chalk";
import ora from "ora";
import {
  fetchResearch,
  fetchQuotes,
  AGENT_TYPES,
  AGENT_LABELS,
  type ResearchReport,
} from "../api.js";
import { title, divider, sentimentBadge, confidenceBar } from "../format.js";
import { printError } from "../errors.js";
import { output } from "../output.js";

export async function researchCommand(
  symbol: string,
  options: { agent?: string; full?: boolean },
): Promise<void> {
  if (!symbol) {
    console.log(chalk.red("请提供股票代码，例如：arti research AAPL"));
    return;
  }

  symbol = symbol.toUpperCase();
  const agents = options.agent
    ? [options.agent]
    : [...AGENT_TYPES];

  // 先获取行情数据作为 context
  const spinner = ora(`获取 ${symbol} 行情数据...`).start();
  let stockData = "";
  try {
    const { quotes } = await fetchQuotes(symbol);
    if (quotes.length) {
      const q = quotes[0];
      stockData = `当前价格: $${q.price}, 涨跌: ${q.change} (${q.changePercent}%), 成交量: ${q.volume}`;
    }
  } catch {
    // 行情获取失败不阻断研报
  }

  spinner.text = `正在生成 ${symbol} 研报（${agents.length} 位分析师并行分析）...`;

  try {
    // 并行调用所有分析师
    const results = await Promise.allSettled(
      agents.map(async (agentType) => {
        const report = await fetchResearch(symbol, agentType, stockData);
        return { agentType, report };
      }),
    );

    spinner.stop();

    // 构建 JSON 数据
    const completed = results.filter(
      (r): r is PromiseFulfilledResult<{ agentType: string; report: ResearchReport }> =>
        r.status === "fulfilled",
    );
    const jsonData = {
      symbol,
      reports: completed.map(r => ({
        agent: r.value.agentType,
        label: AGENT_LABELS[r.value.agentType] || r.value.agentType,
        ...r.value.report,
      })),
      summary: {
        bullish: completed.filter(r => r.value.report.sentiment === "看多").length,
        bearish: completed.filter(r => r.value.report.sentiment === "看空").length,
        neutral: completed.filter(r => r.value.report.sentiment === "中性").length,
      },
    };

    output(jsonData, () => {
      console.log(title(`${symbol} 多维度研报`));

      for (const result of results) {
        if (result.status === "rejected") {
          console.log(chalk.red(`  分析师调用失败: ${result.reason}`));
          console.log(divider());
          continue;
        }

        const { agentType, report } = result.value;
        const label = AGENT_LABELS[agentType] || agentType;

        console.log(
          `\n  ${chalk.bold.magenta(`【${label}】`)} ${sentimentBadge(report.sentiment)}`
        );
        console.log(`  ${chalk.bold(report.title)}`);
        console.log(`  ${chalk.gray(report.summary)}`);
        console.log(`  置信度: ${confidenceBar(report.confidence)}`);

        if (report.keyPoints.length) {
          console.log(chalk.gray("  要点:"));
          for (const point of report.keyPoints) {
            console.log(`    ${chalk.yellow("•")} ${point}`);
          }
        }

        if (options.full) {
          console.log(chalk.gray("\n  ── 完整报告 ──"));
          console.log(report.fullReport.split("\n").map(l => `  ${l}`).join("\n"));
        }

        console.log(divider());
      }

      console.log(
        `\n  ${chalk.bold("综合意见:")} ` +
        `${chalk.red(`看多 ${jsonData.summary.bullish}`)} | ` +
        `${chalk.green(`看空 ${jsonData.summary.bearish}`)} | ` +
        `${chalk.yellow(`中性 ${jsonData.summary.neutral}`)}`
      );
      console.log();
    });
  } catch (err) {
    spinner.fail("研报生成失败");
    printError(err);
  }
}
