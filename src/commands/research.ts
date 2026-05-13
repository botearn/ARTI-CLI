/**
 * research 命令 — 三层级 AI 研报（Orchestrator SSE 对接）
 *
 * Layer 1: 7+1 分析师并行分析
 * Layer 2: 投资大师圆桌辩论（动态路由选择）
 * Layer 3: 综合裁定（Synthesis）
 *
 * 用法：arti research AAPL [--agent tony] [--mode deep|panorama]
 */
import chalk from "chalk";
import ora from "ora";
import {
  streamOrchestrator,
  fetchResearch,
  AGENT_TYPES,
  AGENT_LABELS,
  MASTER_LABELS,
  type ResearchReport,
  type MasterOpinion,
  type SynthesisResult,
} from "../api.js";
import { title, divider, sentimentBadge, confidenceBar } from "../format.js";
import { printError } from "../errors.js";
import { output } from "../output.js";
import { track } from "../tracker.js";
import {
  assertSufficientCredits,
  applyDeduction,
  printDeductResult,
  InsufficientCreditsError,
  type BillingState,
  type FeatureKey,
} from "../billing.js";
import { buildResearchStockContext } from "../data/research-context.js";

/** 渲染单个分析师报告（简洁模式） */
function renderAnalystBrief(agent: string, report: ResearchReport): void {
  const label = AGENT_LABELS[agent] || agent;
  console.log(
    `  ${chalk.bold.magenta(`【${label}】`)} ${sentimentBadge(report.sentiment)} ` +
    `${chalk.gray("置信度")} ${confidenceBar(report.confidence)}`
  );
  console.log(`  ${chalk.bold(report.title)}`);
  console.log(`  ${chalk.gray(report.summary)}`);

  // E1: 防御性检查 keyPoints 字段
  if (report.keyPoints) {
    let points: string[] = [];

    // 如果是数组，直接使用
    if (Array.isArray(report.keyPoints)) {
      points = report.keyPoints;
    }
    // 如果是字符串，尝试按行拆分
    else if (typeof report.keyPoints === "string") {
      points = report.keyPoints.split("\n").filter(line => line.trim());
    }

    // 显示前 3 个要点
    if (points.length > 0) {
      for (const p of points.slice(0, 3)) {
        console.log(`    ${chalk.yellow("•")} ${p}`);
      }
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
  const normalizedMode = normalizeResearchMode(options.mode);

  // 判断功能档位：单分析师/layer1-only = 全景报告，完整三层 = 深度报告
  const isDeep = !options.agent && normalizedMode !== "layer1-only";
  const featureKey = isDeep ? "deepReport" : "panorama";

  let billingState: BillingState;
  try {
    billingState = assertSufficientCredits(featureKey);
  } catch (err) {
    if (err instanceof InsufficientCreditsError) {
      console.log(chalk.red(`\n  ✗ ${err.message}\n`));
      return;
    }
    printError(err);
    return;
  }

  track("research", [symbol]);

  // 单分析师模式：直接调 stock-research（不走 orchestrator）
  if (options.agent) {
    return runSingleAgent(symbol, options.agent, options.full, featureKey, billingState);
  }

  // 完整三层级模式：调 orchestrator SSE
  return runOrchestrator(symbol, { ...options, mode: normalizedMode }, featureKey, billingState);
}

export function normalizeResearchMode(mode?: string): "full" | "layer1-only" {
  switch ((mode || "").trim().toLowerCase()) {
    case "":
    case "full":
    case "deep":
      return "full";
    case "layer1-only":
    case "panorama":
      return "layer1-only";
    default:
      return "full";
  }
}

/** 单分析师快速分析 */
async function runSingleAgent(
  symbol: string,
  agent: string,
  full: boolean | undefined,
  featureKey: FeatureKey,
  billingState: BillingState,
): Promise<void> {
  const spinner = ora(`${AGENT_LABELS[agent] || agent} 分析 ${symbol}...`).start();

  try {
    const context = await buildResearchStockContext(symbol);

    const report = await fetchResearch(symbol, agent, context.stockData);
    const deduct = applyDeduction(featureKey, billingState);
    spinner.stop();

    output({ symbol, agent, label: AGENT_LABELS[agent], technicalSource: context.technicalSource, ...report }, () => {
      console.log(title(`${symbol} ${AGENT_LABELS[agent] || agent}分析`));
      renderAnalystBrief(agent, report);
      if (full) {
        console.log(chalk.gray("  ── 完整报告 ──\n"));
        console.log(report.fullReport.split("\n").map(l => `  ${l}`).join("\n"));
      }
      console.log(divider());
      if (deduct) printDeductResult(deduct);
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
  featureKey: FeatureKey,
  billingState: BillingState,
): Promise<void> {
  let spinner = ora(`正在搜索股票代码 ${symbol}...`).start();

  // R1: 实时进度反馈 - 显示数据获取阶段
  spinner.text = `正在获取 ${symbol} 行情与技术数据...`;
  const context = await buildResearchStockContext(symbol);
  const stockData = context.stockData;

  // 调试日志
  console.log(chalk.gray(`\n  [调试] stockData 长度: ${stockData.length} 字符`));
  if (stockData.length > 0) {
    console.log(chalk.gray(`  [调试] stockData 预览: ${stockData.substring(0, 100)}...`));
  } else {
    console.log(chalk.red(`  [调试] ⚠️ stockData 为空！`));
  }

  spinner.text = `连接 ARTI 研报引擎...`;

  // 收集所有结果
  const reports: { agent: string; report: ResearchReport }[] = [];
  const masterOpinions: { master: string; opinion: MasterOpinion }[] = [];
  let synthesis: SynthesisResult | MasterOpinion | null = null;
  let selectedMasters: string[] = [];
  let routeRule = "";
  let routeReasoning = "";
  let layer1Count = 0;
  let hasError = false;

  // R5: 超时保护 - 60秒后显示提示
  const startTime = Date.now();
  let timeoutWarningShown = false;
  const timeoutChecker = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    if (elapsed >= 60 && !timeoutWarningShown) {
      spinner.warn(
        chalk.yellow(
          `分析耗时较长（已等待 ${elapsed}s），您可以按 Ctrl+C 取消，或继续等待...`
        )
      );
      timeoutWarningShown = true;
      spinner = ora(`继续等待研报生成...`).start();
    }
  }, 5000);

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
            // R1: 实时进度反馈 - 显示每个分析师完成状态
            const label = event.label || AGENT_LABELS[event.agent] || event.agent;
            spinner.text = `Layer 1 — ${label} 完成 (${event.report.sentiment}, 置信度 ${event.report.confidence}%) | 进度 ${layer1Count}/8`;
          } else if (event.error) {
            layer1Count++;
            const label = event.label || AGENT_LABELS[event.agent || ""] || event.agent || "?";
            spinner.text = `Layer 1 — ${label} 数据不足，跳过 | 进度 ${layer1Count}/8`;
          }
          break;

        case "layer1_complete":
          spinner.succeed(`Layer 1 完成 — ${reports.length} 位分析师`);

          // R2: 快速结论先行 - 显示核心摘要
          const bullish = reports.filter(r => r.report.sentiment === "看多").length;
          const bearish = reports.filter(r => r.report.sentiment === "看空").length;
          const neutral = reports.filter(r => r.report.sentiment === "中性").length;

          // 判断报告类型（根据分析师数量和模式）
          const isPanoramaReport = options.mode === "layer1-only" || reports.length <= 5;
          const reportTypeLabel = isPanoramaReport ? "全景报告" : "深度研报";
          const reportIconLabel = isPanoramaReport ? "📊" : "📈";

          console.log(chalk.bold.cyan(`\n  ${reportIconLabel} ${symbol} ${reportTypeLabel} · 核心结论\n`));
          const consensusSentiment = bullish > bearish + neutral ? "看多" :
                                      bearish > bullish + neutral ? "看空" : "中性";
          const avgConfidence = Math.round(
            reports.reduce((sum, r) => sum + r.report.confidence, 0) / reports.length
          );
          console.log(
            `  ${sentimentBadge(consensusSentiment)} ` +
            `${chalk.gray("综合置信度")} ${confidenceBar(avgConfidence)} ${chalk.gray(`(${avgConfidence}%)`)}`
          );
          console.log(
            `  ${chalk.gray("分析师共识:")} ` +
            `${chalk.red(`看多 ${bullish}`)} | ` +
            `${chalk.green(`看空 ${bearish}`)} | ` +
            `${chalk.yellow(`中性 ${neutral}`)}`
          );

          // 显示报告覆盖范围
          if (isPanoramaReport) {
            console.log(chalk.gray(`  ${chalk.dim("覆盖范围:")} 宏观环境 · 板块轮动 · 技术面 · 基本面 · 风控`));
          } else {
            console.log(chalk.gray(`  ${chalk.dim("覆盖范围:")} 8维全面分析 · 量化验证 · 组合策略`));
          }

          // R3: 消除暂无数据尴尬 - 过滤掉置信度过低或明显缺数据的分析师
          const validReports = reports.filter(r => {
            const report = r.report;
            // 置信度低于30%视为数据不足
            if (report.confidence < 30) return false;
            // 摘要包含"暂无"/"数据缺失"等关键词
            if (/(暂无|数据缺失|无法获取|缺少.*数据)/i.test(report.summary)) return false;
            return true;
          });

          // R4: 分层展示详情 - 先显示简洁列表
          console.log(chalk.bold(`\n  ── 8位分析师观点 ──\n`));
          let idx = 1;
          for (const { agent, report } of reports) {
            // 如果数据不足，简短说明后跳过
            if (!validReports.find(r => r.agent === agent)) {
              console.log(
                `  ${chalk.gray(`${idx}. ${AGENT_LABELS[agent]}`)} ${chalk.dim("数据获取中，跳过")}`
              );
              idx++;
              continue;
            }
            const label = AGENT_LABELS[agent] || agent;
            console.log(
              `  ${chalk.bold(`${idx}. ${label}`)} ` +
              `${sentimentBadge(report.sentiment)} ` +
              `${confidenceBar(report.confidence)}`
            );
            idx++;
          }

          console.log(chalk.gray(`\n  提示: 详细报告将在 Layer 2 大师辩论后一并展示\n`));
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
          const isPanoramaMode = masterOpinions.length <= 4;
          const debateType = isPanoramaMode ? "轻量辩论" : "完整辩论";
          spinner.succeed(`Layer 2 完成 — ${masterOpinions.length} 位大师${debateType}`);

          // 渲染大师辩论
          const debateIcon = isPanoramaMode ? "💬" : "🎯";
          console.log(title(`${debateIcon} 投资大师圆桌 (Layer 2)`));

          if (isPanoramaMode) {
            console.log(chalk.gray(`  ${chalk.dim("模式:")} 全景模式 — 聚焦核心分歧，快速定位关键风险`));
          } else {
            console.log(chalk.gray(`  ${chalk.dim("模式:")} 深度模式 — 七位大师完整辩论，多空充分博弈`));
          }

          if (routeRule) {
            console.log(chalk.gray(`  ${chalk.dim("路由策略:")} ${routeRule}`));
            if (routeReasoning) console.log(chalk.gray(`  ${routeReasoning}\n`));
          }
          for (const { master, opinion } of masterOpinions) {
            renderMasterOpinion(master, opinion);
          }
          console.log(divider());

          const synthesisType = isPanoramaMode ? "压缩总结" : "深度裁定";
          spinner = ora(`Synthesis — 生成${synthesisType}...`).start();
          break;

        case "synthesis":
          synthesis = event.opinion || null;
          const isFinalPanorama = masterOpinions.length <= 4;
          const synthesisLabel = isFinalPanorama ? "全景总结" : "深度裁定";

          spinner.succeed(`${synthesisLabel}完成`);

          if (synthesis) {
            renderSynthesis(synthesis);
          }

          // 显示报告完成状态
          const finalReportType = isFinalPanorama ? "全景报告" : "深度研报";
          const finalReportIcon = isFinalPanorama ? "📊" : "📈";
          console.log(chalk.bold.green(`\n  ${finalReportIcon} ${finalReportType}已生成完成\n`));

          // 显示关键指标总结
          const finalBullish = reports.filter(r => r.report.sentiment === "看多").length;
          const finalBearish = reports.filter(r => r.report.sentiment === "看空").length;
          const finalAvgConf = Math.round(
            reports.reduce((sum, r) => sum + r.report.confidence, 0) / reports.length
          );

          console.log(chalk.gray(`  分析师维度: ${reports.length} 位 | 大师辩论: ${masterOpinions.length} 位`));
          console.log(chalk.gray(`  多空比: ${chalk.red(finalBullish)}:${chalk.green(finalBearish)} | 平均置信度: ${finalAvgConf}%`));

          if (isFinalPanorama) {
            console.log(chalk.gray(`  用途场景: 快速全景扫描 · 日常监控 · 趋势判断`));
          } else {
            console.log(chalk.gray(`  用途场景: 重仓决策 · 深度研究 · 投委会报告`));
          }

          // R4: 最终展示详细报告（可选）
          if (options.full) {
            console.log(chalk.bold.cyan("\n  ━━━ 详细分析报告 ━━━\n"));
            console.log(title(`${symbol} 多维度分析 (Layer 1)`));
            const validReports = reports.filter(r => {
              const report = r.report;
              if (report.confidence < 30) return false;
              if (/(暂无|数据缺失|无法获取|缺少.*数据)/i.test(report.summary)) return false;
              return true;
            });
            for (const { agent, report } of validReports) {
              renderAnalystBrief(agent, report);
            }
            console.log(divider());

            if (masterOpinions.length) {
              console.log(title(`投资大师圆桌 (Layer 2)`));
              for (const { master, opinion } of masterOpinions) {
                renderMasterOpinion(master, opinion);
              }
              console.log(divider());
            }
          } else {
            console.log(
              chalk.gray("\n  💡 提示: 使用 --full 选项查看完整详细报告\n")
            );
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
      technicalSource: context.technicalSource,
      synthesis,
    };

    // JSON 模式下直接输出
    const deduct = (reports.length || masterOpinions.length || synthesis)
      ? applyDeduction(featureKey, billingState)
      : undefined;
    output(jsonData, () => {
      // 终端模式已在 SSE 事件中实时渲染完毕
      if (!reports.length && !hasError) {
        console.log(chalk.yellow("  未获取到研报数据"));
      }
      if (deduct) printDeductResult(deduct);
    });
  } catch (err) {
    clearInterval(timeoutChecker);
    spinner.fail("研报生成失败");
    printError(err);

    // Fallback：orchestrator 不可用时回退到直接调用分析师
    console.log(chalk.yellow("\n  尝试回退到直接分析模式...\n"));
    return runFallback(symbol, options.full);
  } finally {
    clearInterval(timeoutChecker);
  }
}

/** 回退模式：直接并行调用 7 位分析师（无大师辩论） */
async function runFallback(symbol: string, full?: boolean): Promise<void> {
  const spinner = ora(`直接模式 — 7 位分析师并行分析 ${symbol}...`).start();

  try {
    const context = await buildResearchStockContext(symbol);
    const stockData = context.stockData;

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
      technicalSource: context.technicalSource,
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
