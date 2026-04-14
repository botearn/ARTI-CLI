/**
 * research 命令 — 三层级 AI 研报（Orchestrator SSE 对接）
 *
 * Layer 1: 7+1 分析师并行分析
 * Layer 2: 投资大师圆桌辩论（动态路由选择）
 * Layer 3: 综合裁定（Synthesis）
 *
 * 用法：arti research AAPL [--agent tony] [--mode full|layer1-only]
 */
import chalk from "chalk";
import ora, { type Ora } from "ora";
import {
  streamOrchestrator,
  fetchResearch,
  AGENT_TYPES,
  AGENT_LABELS,
  MASTER_LABELS,
  type ResearchReport,
  type MasterOpinion,
  type SynthesisResult,
  type OrchestratorSSEEvent,
} from "../api.js";
import { getQuote } from "../openbb.js";
import { title, divider, sentimentBadge, confidenceBar, colorChange } from "../format.js";
import { printError } from "../errors.js";
import { output } from "../output.js";
import { track } from "../tracker.js";

/** 渲染单个分析师报告（简洁模式） */
function renderAnalystBrief(agent: string, report: ResearchReport): void {
  const label = AGENT_LABELS[agent] || agent;
  console.log(
    `  ${chalk.bold.magenta(`【${label}】`)} ${sentimentBadge(report.sentiment)} ` +
    `${chalk.gray("置信度")} ${confidenceBar(report.confidence)}`
  );
  console.log(`  ${chalk.bold(report.title)}`);
  console.log(`  ${chalk.gray(report.summary)}`);
  if (report.keyPoints?.length) {
    for (const p of report.keyPoints.slice(0, 3)) {
      console.log(`    ${chalk.yellow("•")} ${p}`);
    }
  }
  console.log();
}

/** 渲染大师观点 */
function renderMasterOpinion(master: string, opinion: MasterOpinion): void {
  const label = MASTER_LABELS[master] || opinion.role || master;
  const stanceBadge = opinion.stance === "立论"
    ? chalk.bgCyan.black(` ${opinion.stance} `)
    : opinion.stance === "质疑" || opinion.stance === "反驳"
      ? chalk.bgYellow.black(` ${opinion.stance} `)
      : opinion.stance === "挑战"
        ? chalk.bgRed.white(` ${opinion.stance} `)
        : chalk.bgGray.white(` ${opinion.stance} `);

  console.log(`  ${chalk.bold.blue(`【${label}】`)} ${stanceBadge}`);
  // 截取核心段落（避免终端刷屏）
  const lines = opinion.content.split("\n").filter(l => l.trim());
  const preview = lines.slice(0, 8).join("\n  ");
  console.log(`  ${preview}`);
  if (lines.length > 8) console.log(chalk.gray(`  ... (共 ${lines.length} 行)`));
  console.log();
}

/** 渲染合成裁定 */
function renderSynthesis(synthesis: SynthesisResult | MasterOpinion): void {
  console.log(chalk.bold.cyan("\n  ═══ 圆桌裁定 ═══\n"));

  // MasterOpinion 格式（orchestrator 返回）
  if ("content" in synthesis && typeof synthesis.content === "string") {
    // 尝试解析 JSON
    try {
      const cleaned = synthesis.content.trim().replace(/^```json?\s*/, "").replace(/\s*```$/, "");
      const parsed = JSON.parse(cleaned) as SynthesisResult;
      renderSynthesisFields(parsed);
      return;
    } catch {
      // 非 JSON，直接显示文本
      console.log(`  ${synthesis.content}`);
      return;
    }
  }

  // SynthesisResult 格式
  renderSynthesisFields(synthesis as SynthesisResult);
}

function renderSynthesisFields(s: SynthesisResult): void {
  if (s.bull_coalition) {
    console.log(`  ${chalk.red("多头联盟:")} ${s.bull_coalition}`);
  }
  if (s.bear_challenge) {
    console.log(`  ${chalk.green("空头质疑:")} ${s.bear_challenge}`);
  }
  if (s.key_divergence) {
    console.log(`  ${chalk.yellow("核心分歧:")} ${s.key_divergence}`);
  }
  if (s.roundtable_verdict) {
    console.log(`\n  ${chalk.bold("综合评级:")}`);
    for (const line of s.roundtable_verdict.split("\n").filter(l => l.trim())) {
      console.log(`    ${line.trim()}`);
    }
  }
  if (s.failure_signals?.length) {
    console.log(`\n  ${chalk.bold("失败信号:")}`);
    for (const sig of s.failure_signals) {
      console.log(`    ${chalk.red("⚠")} ${sig}`);
    }
  }
  if (s.raw_synthesis) {
    console.log(`  ${s.raw_synthesis}`);
  }
}

export async function researchCommand(
  symbol: string,
  options: { agent?: string; full?: boolean; mode?: string },
): Promise<void> {
  if (!symbol) {
    console.log(chalk.red("请提供股票代码，例如：arti research AAPL"));
    return;
  }

  symbol = symbol.toUpperCase();
  track("research", [symbol]);

  // 单分析师模式：直接调 stock-research（不走 orchestrator）
  if (options.agent) {
    return runSingleAgent(symbol, options.agent, options.full);
  }

  // 完整三层级模式：调 orchestrator SSE
  return runOrchestrator(symbol, options);
}

/** 单分析师快速分析 */
async function runSingleAgent(symbol: string, agent: string, full?: boolean): Promise<void> {
  const spinner = ora(`${AGENT_LABELS[agent] || agent} 分析 ${symbol}...`).start();

  try {
    let stockData = "";
    try {
      const q = await getQuote(symbol);
      stockData = `当前价格: $${q.last_price}, 涨跌: ${q.change} (${q.change_percent}%), 成交量: ${q.volume}`;
    } catch { /* ignore */ }

    const report = await fetchResearch(symbol, agent, stockData);
    spinner.stop();

    output({ symbol, agent, label: AGENT_LABELS[agent], ...report }, () => {
      console.log(title(`${symbol} ${AGENT_LABELS[agent] || agent}分析`));
      renderAnalystBrief(agent, report);
      if (full) {
        console.log(chalk.gray("  ── 完整报告 ──\n"));
        console.log(report.fullReport.split("\n").map(l => `  ${l}`).join("\n"));
      }
      console.log(divider());
    });
  } catch (err) {
    spinner.fail("分析失败");
    printError(err);
  }
}

/** 完整三层级 orchestrator 研报 */
async function runOrchestrator(
  symbol: string,
  options: { full?: boolean; mode?: string },
): Promise<void> {
  let spinner = ora(`连接 ARTI 研报引擎...`).start();

  // 先获取 OpenBB 行情作为上下文
  let stockData = "";
  try {
    const q = await getQuote(symbol);
    stockData = `${symbol}: $${q.last_price} ${q.change >= 0 ? "+" : ""}${q.change_percent?.toFixed(2)}% 成交量:${q.volume?.toLocaleString()}`;
    if (q.ma_50d) stockData += ` MA50:${q.ma_50d}`;
    if (q.year_high && q.year_low) stockData += ` 52周:${q.year_low}-${q.year_high}`;
  } catch { /* ignore */ }

  // 收集所有结果
  const reports: { agent: string; report: ResearchReport }[] = [];
  const masterOpinions: { master: string; opinion: MasterOpinion }[] = [];
  let synthesis: SynthesisResult | MasterOpinion | null = null;
  let selectedMasters: string[] = [];
  let routeRule = "";
  let routeReasoning = "";
  let layer1Count = 0;
  let hasError = false;

  try {
    const events = streamOrchestrator(symbol, {
      stockData,
      mode: options.mode || "full",
    });

    for await (const event of events) {
      switch (event.type) {
        case "route_info":
          spinner.text = `${symbol} 研报 — ${(event.layer1Agents || []).length} 位分析师就位...`;
          break;

        case "layer1_start":
          spinner.text = `Layer 1 — 分析师并行分析中...`;
          break;

        case "layer1_agent_done":
          if (event.report && event.agent) {
            reports.push({ agent: event.agent, report: event.report });
            layer1Count++;
            spinner.text = `Layer 1 — ${layer1Count} 位分析师完成 (${event.label || event.agent}: ${event.report.sentiment})`;
          } else if (event.error) {
            spinner.text = `Layer 1 — ${event.agent || "?"} 失败，继续...`;
          }
          break;

        case "layer1_complete":
          spinner.succeed(`Layer 1 完成 — ${reports.length} 位分析师`);
          // 即时渲染 Layer 1 结果
          console.log(title(`${symbol} 多维度分析 (Layer 1)`));
          for (const { agent, report } of reports) {
            renderAnalystBrief(agent, report);
          }
          const bullish = reports.filter(r => r.report.sentiment === "看多").length;
          const bearish = reports.filter(r => r.report.sentiment === "看空").length;
          const neutral = reports.filter(r => r.report.sentiment === "中性").length;
          console.log(
            `  ${chalk.bold("分析师共识:")} ` +
            `${chalk.red(`看多 ${bullish}`)} | ` +
            `${chalk.green(`看空 ${bearish}`)} | ` +
            `${chalk.yellow(`中性 ${neutral}`)}`
          );
          console.log(divider());
          spinner = ora("Layer 2 — 大师路由中...").start();
          break;

        case "router_done":
          selectedMasters = event.selectedMasters || [];
          routeRule = event.rule || "";
          routeReasoning = event.reasoning || "";
          spinner.text = `Layer 2 — 已选 ${selectedMasters.length} 位大师: ${selectedMasters.map(m => MASTER_LABELS[m] || m).join(", ")}`;
          break;

        case "layer2_start":
          spinner.text = `Layer 2 — 大师圆桌辩论中...`;
          break;

        case "layer2_master_done":
          if (event.opinion && event.master) {
            masterOpinions.push({ master: event.master, opinion: event.opinion });
            spinner.text = `Layer 2 — ${masterOpinions.length}/${selectedMasters.length} 位大师完成 (${MASTER_LABELS[event.master] || event.master})`;
          }
          break;

        case "layer2_complete":
          spinner.succeed(`Layer 2 完成 — ${masterOpinions.length} 位大师辩论`);
          // 渲染大师辩论
          console.log(title(`投资大师圆桌 (Layer 2)`));
          if (routeRule) {
            console.log(chalk.gray(`  路由策略: ${routeRule}`));
            if (routeReasoning) console.log(chalk.gray(`  ${routeReasoning}\n`));
          }
          for (const { master, opinion } of masterOpinions) {
            renderMasterOpinion(master, opinion);
          }
          console.log(divider());
          spinner = ora("Synthesis — 生成最终裁定...").start();
          break;

        case "synthesis":
          synthesis = event.opinion || null;
          spinner.succeed("Synthesis 完成");
          if (synthesis) {
            renderSynthesis(synthesis);
          }
          console.log("\n" + divider());
          break;

        case "error":
          spinner.fail(`研报引擎错误: ${event.error}`);
          hasError = true;
          break;
      }
    }

    // JSON 输出
    const jsonData = {
      symbol,
      layer1: {
        reports: reports.map(r => ({
          agent: r.agent,
          label: AGENT_LABELS[r.agent],
          ...r.report,
        })),
        summary: {
          bullish: reports.filter(r => r.report.sentiment === "看多").length,
          bearish: reports.filter(r => r.report.sentiment === "看空").length,
          neutral: reports.filter(r => r.report.sentiment === "中性").length,
        },
      },
      layer2: {
        route: { rule: routeRule, reasoning: routeReasoning, selectedMasters },
        opinions: masterOpinions.map(m => ({
          master: m.master,
          label: MASTER_LABELS[m.master],
          ...m.opinion,
        })),
      },
      synthesis,
    };

    // JSON 模式下直接输出
    output(jsonData, () => {
      // 终端模式已在 SSE 事件中实时渲染完毕
      if (!reports.length && !hasError) {
        console.log(chalk.yellow("  未获取到研报数据"));
      }
    });
  } catch (err) {
    spinner.fail("研报生成失败");
    printError(err);

    // Fallback：orchestrator 不可用时回退到直接调用分析师
    console.log(chalk.yellow("\n  尝试回退到直接分析模式...\n"));
    return runFallback(symbol, options.full);
  }
}

/** 回退模式：直接并行调用 7 位分析师（无大师辩论） */
async function runFallback(symbol: string, full?: boolean): Promise<void> {
  const spinner = ora(`直接模式 — 7 位分析师并行分析 ${symbol}...`).start();

  try {
    let stockData = "";
    try {
      const q = await getQuote(symbol);
      stockData = `当前价格: $${q.last_price}, 涨跌: ${q.change} (${q.change_percent}%), 成交量: ${q.volume}`;
    } catch { /* ignore */ }

    const agents: string[] = [...AGENT_TYPES].filter(a => a !== "wanda");
    const settled = await Promise.allSettled(
      agents.map(a => fetchResearch(symbol, a, stockData).then(report => ({ agent: a, report }))),
    );
    spinner.stop();

    const completed: { agent: string; report: ResearchReport }[] = [];
    for (const r of settled) {
      if (r.status === "fulfilled") completed.push(r.value);
    }

    const jsonData = {
      symbol,
      mode: "fallback",
      layer1: {
        reports: completed.map(r => ({
          agent: r.agent,
          label: AGENT_LABELS[r.agent],
          ...r.report,
        })),
        summary: {
          bullish: completed.filter(r => r.report.sentiment === "看多").length,
          bearish: completed.filter(r => r.report.sentiment === "看空").length,
          neutral: completed.filter(r => r.report.sentiment === "中性").length,
        },
      },
    };

    output(jsonData, () => {
      console.log(title(`${symbol} 多维度研报 (直接模式)`));
      for (const r of completed) {
        renderAnalystBrief(r.agent, r.report);
        if (full) {
          console.log(r.report.fullReport.split("\n").map((l: string) => `  ${l}`).join("\n"));
          console.log();
        }
      }
      console.log(
        `\n  ${chalk.bold("综合意见:")} ` +
        `${chalk.red(`看多 ${jsonData.layer1.summary.bullish}`)} | ` +
        `${chalk.green(`看空 ${jsonData.layer1.summary.bearish}`)} | ` +
        `${chalk.yellow(`中性 ${jsonData.layer1.summary.neutral}`)}`
      );
      console.log(chalk.gray("\n  注：直接模式无大师辩论和圆桌合成\n"));
    });
  } catch (err) {
    spinner.fail("回退模式也失败了");
    printError(err);
  }
}
