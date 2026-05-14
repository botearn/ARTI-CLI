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
  streamOrchestratorBackend,
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

interface BackendSnapshot {
  quote?: {
    price?: number | null;
    yearHigh?: number | null;
    yearLow?: number | null;
  };
  technical?: {
    ma?: Record<string, number | null>;
    rsi?: number | null;
    bbands?: { upper?: number | null; middle?: number | null; lower?: number | null } | null;
    atr?: number | null;
    signals?: string[];
    overallSignal?: string | null;
  };
  technicalSource?: string | null;
}

interface ScenarioItem {
  label: string;
  probability: number | null;
  summary: string;
}

interface FormalReportSummary {
  action: string | null;
  positionLine: string | null;
  levelLine: string | null;
  oneLiner: string | null;
  whyNow: string | null;
  audience: string | null;
  invalidation: string | null;
  bullCase: string[];
  bearCase: string[];
  scenarios: ScenarioItem[];
}

function normalizeConfidence(confidence: number | null | undefined): number {
  if (typeof confidence !== "number" || Number.isNaN(confidence)) return 0;
  if (confidence > 1) return Math.max(0, Math.min(confidence / 100, 1));
  if (confidence < 0) return 0;
  return confidence;
}

function normalizeReportText(text: string): string {
  return text
    .replace(/^```[a-zA-Z0-9_-]*\s*/g, "")
    .replace(/\s*```$/g, "")
    .trim();
}

function cleanListItem(text: string): string {
  return text
    .trim()
    .replace(/^[•\-\*\d\.\)\]\s]+/, "")
    .replace(/^[\[\{\("'\s`]+/, "")
    .replace(/[\]\}\),"'\s`]+$/g, "")
    .replace(/,+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanNarrativeLine(text: string): string {
  return text
    .trim()
    .replace(/^#{1,6}\s*/, "")
    .replace(/^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/, "")
    .replace(/^[•\-\*\d\.\)\]\s]+/, "")
    .replace(/^[\[\{\("'\s`]+/, "")
    .replace(/[\]\}\),"'\s`]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractReportPoints(value: unknown): string[] {
  if (!value) return [];

  if (Array.isArray(value)) {
    return [...new Set(value
      .flatMap(item => extractReportPoints(item))
      .filter(Boolean))];
  }

  if (typeof value !== "string") return [];

  const trimmed = normalizeReportText(value);
  if (!trimmed) return [];

  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try {
      return extractReportPoints(JSON.parse(trimmed));
    } catch {
      // ignore and continue with line splitting
    }
  }

  const lines = trimmed
    .split(/\r?\n|(?<=\])\s*,\s*(?=")|\s*\|\s*/)
    .map(cleanListItem)
    .filter(Boolean);

  return [...new Set(lines)];
}

function pointSignature(point: string): string {
  return point
    .toLowerCase()
    .replace(/\$?\d+(?:\.\d+)?/g, "#")
    .replace(/[^\p{L}\p{N}#]+/gu, "")
    .slice(0, 40);
}

function pointTheme(point: string): string {
  const themes: Array<[string, RegExp]> = [
    ["rsi", /\brsi\b|超买|超卖/i],
    ["macd", /\bmacd\b|动能/i],
    ["ma", /\bma\d+\b|均线|多头排列|空头排列/i],
    ["bbands", /布林|上轨|下轨|中轨/i],
    ["resistance", /压力|阻力|年高|突破/i],
    ["support", /支撑|止损|atr/i],
    ["valuation", /估值|pe|pb|ps|roe/i],
    ["fundamental", /services|服务业务|毛利率|现金流|fcf/i],
    ["macro", /美联储|利率|美债|dxy|关税|监管|中国|大中华/i],
  ];

  for (const [theme, pattern] of themes) {
    if (pattern.test(point)) return theme;
  }

  return pointSignature(point);
}

function selectDistinctPoints(points: string[], maxCount = 6): string[] {
  const seenThemes = new Set<string>();
  const seenSignatures = new Set<string>();
  const selected: string[] = [];

  for (const point of points) {
    const normalized = cleanNarrativeLine(point);
    if (!normalized) continue;

    const signature = pointSignature(normalized);
    const theme = pointTheme(normalized);
    if (seenSignatures.has(signature) || seenThemes.has(theme)) continue;

    seenSignatures.add(signature);
    seenThemes.add(theme);
    selected.push(normalized);

    if (selected.length >= maxCount) break;
  }

  return selected;
}

function extractRiskPoints(reports: { agent: string; report: ResearchReport }[]): string[] {
  const riskPattern = /(风险|回调|压力|止损|失速|下滑|跌破|关税|监管|超买|回撤|波动|不及预期|估值|阻力)/i;
  const points = reports.flatMap(({ report }) => extractReportPoints(report.keyPoints));
  return selectDistinctPoints(points.filter(point => riskPattern.test(point)), 6);
}

function extractSupportPoints(reports: { agent: string; report: ResearchReport }[]): string[] {
  const riskPattern = /(风险|回调|压力|止损|失速|下滑|跌破|关税|监管|超买|回撤|波动|不及预期|估值|阻力)/i;
  const points = reports.flatMap(({ report }) => extractReportPoints(report.keyPoints));
  return selectDistinctPoints(points.filter(point => !riskPattern.test(point)), 6);
}

function isDebugEnabled(): boolean {
  const value = process.env.ARTI_DEBUG?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

function isUsableReport(report: ResearchReport): boolean {
  if (normalizeConfidence(report.confidence) < 0.3) return false;
  if (/(暂无|数据缺失|无法获取|缺少.*数据)/i.test(report.summary)) return false;
  return true;
}

function summarizeMarketSnapshot(stockData: string): string {
  const snapshot = normalizeReportText(stockData).replace(/\s+/g, " ").trim();
  if (!snapshot) return "";
  return snapshot.length > 180 ? `${snapshot.slice(0, 177)}...` : snapshot;
}

function collectReportLines(report: ResearchReport): string[] {
  const lines = [
    report.summary,
    ...extractReportPoints(report.keyPoints),
    ...normalizeReportText(report.fullReport).split(/\r?\n/),
  ];

  return [...new Set(lines
    .map(cleanNarrativeLine)
    .filter(line => (
      line &&
      !/^(---+|===+)$/.test(line) &&
      !/^title\s*\|/i.test(line) &&
      !/^\|.*\|$/.test(line)
    )))];
}

function parseBackendSnapshot(raw: string): BackendSnapshot | null {
  if (!raw.trim()) return null;
  try {
    return JSON.parse(raw) as BackendSnapshot;
  } catch {
    return null;
  }
}

function formatLevel(value: number | null | undefined): string | null {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(2) : null;
}

function buildActionableSummary(
  reports: { agent: string; report: ResearchReport }[],
  backendStockData: string,
): FormalReportSummary {
  const allLines = reports.flatMap(({ report }) => collectReportLines(report));
  const actionMatchers: Array<{ label: string; pattern: RegExp; priority: number }> = [
    { label: "清仓", pattern: /清仓/i, priority: 5 },
    { label: "减仓", pattern: /减仓|降低仓位|收紧仓位/i, priority: 4 },
    { label: "观望", pattern: /观望|等待|不建议追高|不宜追高|暂不进场/i, priority: 3 },
    { label: "持有", pattern: /持有|保留底仓/i, priority: 2 },
    { label: "增持", pattern: /增持|加仓|介入|做多|追入/i, priority: 1 },
  ];

  const actionScores = new Map<string, { count: number; priority: number }>();
  for (const line of allLines) {
    for (const matcher of actionMatchers) {
      if (matcher.pattern.test(line)) {
        const current = actionScores.get(matcher.label) || { count: 0, priority: matcher.priority };
        current.count += 1;
        actionScores.set(matcher.label, current);
      }
    }
  }

  const action = [...actionScores.entries()]
    .sort((a, b) => b[1].count - a[1].count || b[1].priority - a[1].priority)[0]?.[0] || null;

  const explicitStance = allLines.find(line => /仓位建议[:：]?\s*(轻仓|中仓|重仓)/i.test(line))
    || allLines.find(line => /^(轻仓|中仓|重仓)$/i.test(line))
    || allLines.find(line => /(建议轻仓|建议中仓|建议重仓)/i.test(line) && line.length <= 36);
  const upperLine = allLines.find(line => /仓位上限[:：]?\s*\d+(?:\.\d+)?%/i.test(line));
  const suggestedLine = allLines.find(line => /建议实际仓位[:：]?\s*\d+(?:\.\d+)?(?:-\d+(?:\.\d+)?)?%/i.test(line))
    || allLines.find(line => /建议.*仓位[:：]?\s*\d+(?:\.\d+)?(?:-\d+(?:\.\d+)?)?%/i.test(line) && line.length <= 48);

  const positionBits: string[] = [];
  const stanceMatch = explicitStance?.match(/(轻仓|中仓|重仓)/i)?.[1];
  const upperMatch = upperLine?.match(/仓位上限[:：]?\s*(\d+(?:\.\d+)?%)/i)?.[1];
  const suggestedMatch = suggestedLine?.match(/(\d+(?:\.\d+)?(?:-\d+(?:\.\d+)?)?%)/i)?.[1];
  if (stanceMatch) positionBits.push(stanceMatch);
  if (upperMatch) positionBits.push(`上限 ${upperMatch}`);
  if (suggestedMatch) positionBits.push(`建议 ${suggestedMatch}`);

  const snapshot = parseBackendSnapshot(backendStockData);
  const price = snapshot?.quote?.price ?? null;
  const yearHigh = snapshot?.quote?.yearHigh ?? null;
  const ma10 = snapshot?.technical?.ma?.MA10 ?? null;
  const ma20 = snapshot?.technical?.ma?.MA20 ?? null;
  const bbUpper = snapshot?.technical?.bbands?.upper ?? null;
  const rsi = snapshot?.technical?.rsi ?? null;
  const atr = snapshot?.technical?.atr ?? null;
  const overallSignal = snapshot?.technical?.overallSignal ?? null;
  const stop = typeof price === "number" && typeof atr === "number" ? price - atr * 2 : null;
  const nearResistance = typeof price === "number" && typeof yearHigh === "number"
    ? Math.abs(yearHigh - price) / Math.max(price, 1) <= 0.02
    : false;
  const overbought = typeof rsi === "number" ? rsi >= 70 : /超买/i.test(allLines.join(" "));
  const trendUp = typeof price === "number" && typeof ma20 === "number"
    ? price > ma20
    : /(多头排列|趋势向上|中长期趋势向上)/i.test(allLines.join(" "));

  const pressureParts = [formatLevel(yearHigh), formatLevel(bbUpper)].filter(Boolean);
  const supportParts = [formatLevel(ma10), formatLevel(ma20)].filter(Boolean);
  const stopPart = formatLevel(stop);

  const levelBits: string[] = [];
  if (pressureParts.length) {
    levelBits.push(`压力 ${pressureParts.join(" - ")}`);
  }
  if (supportParts.length) {
    levelBits.push(`支撑 ${supportParts.join(" / ")}`);
  }
  if (stopPart) {
    levelBits.push(`止损 ${stopPart}`);
  }

  const reportTexts = reports.map(({ report }) => normalizeReportText(report.fullReport));

  const oneLiner = selectDistinctPoints(
    allLines.filter(line =>
      /(建议|适合|更适合|不适合|性价比|赔率|等待回调|不追高|观望|中长期趋势)/i.test(line) &&
      line.length >= 18 &&
      line.length <= 70
    ),
    1,
  )[0] || (
    action === "观望"
      ? overbought && nearResistance && trendUp
        ? "中长期趋势未坏，但短线超买且贴近压力位，当前更适合观望等待回踩确认。"
        : "当前位置缺少足够赔率，先观察关键价位是否被确认更稳妥。"
      : action === "增持"
        ? "中期趋势与基本面仍支撑配置，可优先在关键支撑附近分批介入。"
        : action === "减仓"
          ? "短线风险开始大于收益，优先控制仓位并等待下一轮信号确认。"
          : action === "清仓"
            ? "当前下行风险已明显占优，继续持有的风险收益比不再合适。"
            : overallSignal === "偏空"
              ? "信号开始转弱，先看关键支撑是否守住，再决定是否继续持有。"
              : null
  );

  const whyNow = selectDistinctPoints(
    allLines.filter(line => /(超买|压力|阻力|估值|年高|布林|上行空间|回调)/i.test(line) && line.length <= 64),
    1,
  )[0] || null;

  const audience = action === "观望"
    ? "已持仓者继续跟踪，未持仓者不追高"
    : action === "增持"
      ? "已有跟踪基础、能接受波动的中长期投资者"
      : action === "减仓"
        ? "已有仓位者优先控制风险"
        : null;

  const invalidation = levelBits.join(" | ") || selectDistinctPoints(
    allLines.filter(line => /(跌破|突破|站稳|失效|止损|企稳)/i.test(line) && line.length <= 72),
    1,
  )[0] || null;

  const bullCase = selectDistinctPoints(
    allLines.filter(line => /(多头|趋势向上|护城河|毛利率|现金流|基本面|突破|增持|长期)/i.test(line)),
    3,
  );
  const bearCase = selectDistinctPoints(
    allLines.filter(line => /(超买|回调|估值|压力|关税|监管|利率|下滑|跌破|风险)/i.test(line)),
    3,
  );

  const scenarioPatterns: Array<{ label: string; patterns: RegExp[] }> = [
    { label: "乐观情景", patterns: [/乐观情景/i, /\bbull[_\s-]?case\b/i] },
    { label: "基准情景", patterns: [/基准情景/i, /\bbase[_\s-]?case\b/i] },
    { label: "悲观情景", patterns: [/悲观情景/i, /\bbear[_\s-]?case\b/i] },
  ];

  const scenarios: ScenarioItem[] = [];
  for (const config of scenarioPatterns) {
    const matchedLine = allLines.find(line => config.patterns.some(pattern => pattern.test(line)));
    const matchedText = reportTexts.find(text => config.patterns.some(pattern => pattern.test(text)));
    const matchedTextLine = matchedText
      ?.split(/\r?\n/)
      .map(cleanNarrativeLine)
      .find(line => line && config.patterns.some(pattern => pattern.test(line)));
    const probabilityMatch = matchedLine?.match(/概率[：:\s]*([0-9]{1,3})%/i)
      || matchedTextLine?.match(/概率[：:\s]*([0-9]{1,3})%/i);
    const probability = probabilityMatch ? Number(probabilityMatch[1]) : null;
    const summary = matchedLine || matchedTextLine || "";
    if (summary) {
      scenarios.push({
        label: config.label,
        probability,
        summary: summary.replace(/\s+/g, " ").trim(),
      });
    }
  }

  return {
    action,
    positionLine: positionBits.join(" | ") || null,
    levelLine: levelBits.join(" | ") || null,
    oneLiner,
    whyNow,
    audience,
    invalidation,
    bullCase,
    bearCase,
    scenarios,
  };
}

function renderIndentedBlock(text: string, prefix = "  "): void {
  const normalized = normalizeReportText(text);
  if (!normalized) return;
  console.log(normalized.split("\n").map(line => `${prefix}${line}`).join("\n"));
}

function extractReportExcerpt(text: string, maxLines = 6): string[] {
  const normalized = normalizeReportText(text);
  if (!normalized) return [];

  const lines = normalized
    .split(/\r?\n/)
    .map(cleanNarrativeLine)
    .filter(line => (
      line &&
      line.length <= 120 &&
      !/^(\|.+\|)$/.test(line) &&
      !/^(数据来源|免责声明|以上分析仅供参考|投资有风险)/i.test(line) &&
      !/^(分析概览|技术指标总览|结构化风险|情景分析|交易计划|风险传导路径|压力测试矩阵)$/i.test(line)
    ));

  return selectDistinctPoints(lines, maxLines);
}

function renderAnalystTerminalDetail(report: ResearchReport): void {
  const excerpt = extractReportExcerpt(report.fullReport, 6);
  if (!excerpt.length) return;

  console.log(`  ${chalk.gray("  正文摘录:")}`);
  for (const line of excerpt) {
    console.log(`    ${line}`);
  }

  const totalLines = normalizeReportText(report.fullReport).split(/\r?\n/).filter(line => line.trim()).length;
  if (totalLines > excerpt.length) {
    console.log(`  ${chalk.gray("  ... 已省略其余正文")}`);
  }
  console.log();
}

/** 渲染单个分析师报告（简洁模式） */
function renderAnalystBrief(agent: string, report: ResearchReport): void {
  const label = AGENT_LABELS[agent] || agent;
  console.log(
    `  ${chalk.bold.magenta(`【${label}】`)} ${sentimentBadge(report.sentiment)} ` +
    `${chalk.gray("置信度")} ${confidenceBar(normalizeConfidence(report.confidence))}`
  );
  console.log(`  ${chalk.bold(report.title)}`);
  console.log(`  ${chalk.gray(report.summary)}`);

  const points = extractReportPoints(report.keyPoints);
  if (points.length > 0) {
    for (const p of points.slice(0, 3)) {
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

function renderReportResultBlock(
  symbol: string,
  reportTypeLabel: string,
  reports: { agent: string; report: ResearchReport }[],
  marketSnapshot?: string,
  technicalSource?: string | null,
): void {
  const bullish = reports.filter(r => r.report.sentiment === "看多").length;
  const bearish = reports.filter(r => r.report.sentiment === "看空").length;
  const neutral = reports.filter(r => r.report.sentiment === "中性").length;
  const consensusSentiment = bullish > bearish + neutral ? "看多" :
    bearish > bullish + neutral ? "看空" : "中性";
  const avgConfidenceRatio = normalizeConfidence(
    reports.reduce((sum, r) => sum + normalizeConfidence(r.report.confidence), 0) / Math.max(reports.length, 1),
  );
  const avgConfidence = Math.round(avgConfidenceRatio * 100);

  console.log(chalk.bold(`  ── 报告结论 ──\n`));
  console.log(`  ${chalk.gray("标的:")} ${symbol}`);
  console.log(`  ${chalk.gray("类型:")} ${reportTypeLabel}`);
  console.log(`  ${chalk.gray("生成时间:")} ${new Date().toLocaleString("zh-CN", { hour12: false })}`);
  if (technicalSource) console.log(`  ${chalk.gray("数据来源:")} ${technicalSource}`);
  if (marketSnapshot) console.log(`  ${chalk.gray("行情快照:")} ${marketSnapshot}`);
  console.log(
    `  ${chalk.gray("结论:")} ${sentimentBadge(consensusSentiment)} ` +
    `${chalk.gray("综合置信度")} ${confidenceBar(avgConfidenceRatio)} ${chalk.gray(`(${avgConfidence}%)`)}`
  );
  console.log(
    `  ${chalk.gray("分析师共识:")} ` +
    `${chalk.red(`看多 ${bullish}`)} | ` +
    `${chalk.green(`看空 ${bearish}`)} | ` +
    `${chalk.yellow(`中性 ${neutral}`)}`
  );
  console.log();
}

function renderActionableSummaryBlock(
  reports: { agent: string; report: ResearchReport }[],
  backendStockData: string,
): void {
  const summary = buildActionableSummary(reports, backendStockData);
  if (!summary.action && !summary.positionLine && !summary.levelLine) return;

  console.log(chalk.bold("  ── 操作参考 ──\n"));
  if (summary.action) {
    console.log(`  ${chalk.gray("当前动作:")} ${chalk.bold(summary.action)}`);
  }
  if (summary.positionLine) {
    console.log(`  ${chalk.gray("仓位纪律:")} ${summary.positionLine}`);
  }
  if (summary.levelLine) {
    console.log(`  ${chalk.gray("关键价位:")} ${summary.levelLine}`);
  }
  console.log();
}

function renderFormalLeadBlock(summary: FormalReportSummary): void {
  if (summary.oneLiner) {
    console.log(chalk.bold("  ── 一句话判断 ──\n"));
    console.log(`  ${summary.oneLiner}`);
    console.log();
  }

  console.log(chalk.bold("  ── 当前建议 ──\n"));
  if (summary.action) {
    console.log(`  ${chalk.gray("动作:")} ${chalk.bold(summary.action)}`);
  }
  if (summary.whyNow) {
    console.log(`  ${chalk.gray("原因:")} ${summary.whyNow}`);
  }
  if (summary.audience) {
    console.log(`  ${chalk.gray("适合人群:")} ${summary.audience}`);
  }
  if (summary.invalidation) {
    console.log(`  ${chalk.gray("失效条件:")} ${summary.invalidation}`);
  }
  console.log();

  if (summary.levelLine) {
    console.log(chalk.bold("  ── 关键价位 ──\n"));
    for (const piece of summary.levelLine.split(" | ")) {
      const [label, value] = piece.split(/\s(.+)/);
      if (label && value) {
        console.log(`  ${chalk.gray(`${label}:`)} ${value}`);
      } else {
        console.log(`  ${piece}`);
      }
    }
    console.log();
  }
}

function renderBullBearBlock(summary: FormalReportSummary): void {
  if (!summary.bullCase.length && !summary.bearCase.length) return;

  console.log(chalk.bold("  ── 多空拆解 ──\n"));
  if (summary.bullCase.length) {
    console.log(`  ${chalk.gray("看多逻辑:")}`);
    for (const point of summary.bullCase) {
      console.log(`  ${chalk.yellow("•")} ${point}`);
    }
    console.log();
  }
  if (summary.bearCase.length) {
    console.log(`  ${chalk.gray("看空逻辑:")}`);
    for (const point of summary.bearCase) {
      console.log(`  ${chalk.red("•")} ${point}`);
    }
    console.log();
  }
}

function renderScenarioBlock(summary: FormalReportSummary): void {
  if (!summary.scenarios.length) return;

  console.log(chalk.bold("  ── 情景推演 ──\n"));
  for (const scenario of summary.scenarios) {
    const probability = scenario.probability !== null ? ` (${scenario.probability}%)` : "";
    console.log(`  ${chalk.bold(`${scenario.label}${probability}`)}`);
    console.log(`  ${scenario.summary}`);
    console.log();
  }
}

function renderPanoramaReportDocument(
  symbol: string,
  reportTypeLabel: string,
  reports: { agent: string; report: ResearchReport }[],
  validReports: { agent: string; report: ResearchReport }[],
  marketSnapshot: string,
  technicalSource: string | null,
  backendStockData: string,
): void {
  const formalSummary = buildActionableSummary(validReports, backendStockData);

  console.log(chalk.bold.cyan("\n  ━━━ 详细分析报告 ━━━\n"));
  renderReportResultBlock(symbol, reportTypeLabel, reports, marketSnapshot, technicalSource);
  renderFormalLeadBlock(formalSummary);
  renderActionableSummaryBlock(validReports, backendStockData);

  const supportPoints = extractSupportPoints(validReports);
  const riskPoints = extractRiskPoints(validReports);

  console.log(chalk.bold("  ── 核心驱动 ──\n"));
  if (supportPoints.length) {
    for (const point of supportPoints) {
      console.log(`  ${chalk.yellow("•")} ${point}`);
    }
  } else {
    console.log(`  ${chalk.gray("暂无足够的共性支撑要点")}`);
  }
  console.log();

  console.log(chalk.bold("  ── 关键风险 ──\n"));
  if (riskPoints.length) {
    for (const point of riskPoints) {
      console.log(`  ${chalk.red("•")} ${point}`);
    }
  } else {
    console.log(`  ${chalk.gray("暂无足够的风险提要")}`);
  }
  console.log();

  renderBullBearBlock(formalSummary);
  renderScenarioBlock(formalSummary);

  console.log(chalk.bold("  ── 分析师详报 ──\n"));
  for (const { agent, report } of validReports) {
    renderAnalystBrief(agent, report);
    renderAnalystTerminalDetail(report);
  }
}

function renderDeepReportDocument(
  symbol: string,
  reportTypeLabel: string,
  reports: { agent: string; report: ResearchReport }[],
  validReports: { agent: string; report: ResearchReport }[],
  marketSnapshot: string,
  technicalSource: string | null,
  backendStockData: string,
  masterOpinions: { master: string; opinion: MasterOpinion }[],
  synthesis: SynthesisResult | MasterOpinion | null,
): void {
  const formalSummary = buildActionableSummary(validReports, backendStockData);

  console.log(chalk.bold.cyan("\n  ━━━ 详细分析报告 ━━━\n"));
  renderReportResultBlock(symbol, reportTypeLabel, reports, marketSnapshot, technicalSource);
  renderFormalLeadBlock(formalSummary);
  renderActionableSummaryBlock(validReports, backendStockData);

  const supportPoints = extractSupportPoints(validReports);
  const riskPoints = extractRiskPoints(validReports);

  console.log(chalk.bold("  ── 核心驱动 ──\n"));
  if (supportPoints.length) {
    for (const point of supportPoints) {
      console.log(`  ${chalk.yellow("•")} ${point}`);
    }
  } else {
    console.log(`  ${chalk.gray("暂无足够的共性支撑要点")}`);
  }
  console.log();

  console.log(chalk.bold("  ── 关键风险 ──\n"));
  if (riskPoints.length) {
    for (const point of riskPoints) {
      console.log(`  ${chalk.red("•")} ${point}`);
    }
  } else {
    console.log(`  ${chalk.gray("暂无足够的风险提要")}`);
  }
  console.log();

  renderBullBearBlock(formalSummary);
  renderScenarioBlock(formalSummary);

  if (synthesis) {
    console.log(chalk.bold("  ── 综合裁定 ──\n"));
    renderSynthesis(synthesis);
    console.log();
  }

  if (masterOpinions.length) {
    console.log(chalk.bold("  ── 大师圆桌 ──\n"));
    for (const { master, opinion } of masterOpinions) {
      renderMasterOpinion(master, opinion);
    }
  }

  console.log(chalk.bold("  ── 分析师详报 ──\n"));
  for (const { agent, report } of validReports) {
    renderAnalystBrief(agent, report);
    renderAnalystTerminalDetail(report);
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
    billingState = await assertSufficientCredits(featureKey);
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
    const deduct = await applyDeduction(featureKey, billingState);
    spinner.stop();

    output({ symbol, agent, label: AGENT_LABELS[agent], technicalSource: context.technicalSource, ...report }, () => {
      console.log(title(`${symbol} ${AGENT_LABELS[agent] || agent}分析`));
      renderAnalystBrief(agent, report);
      if (full) {
        console.log(chalk.gray("  ── 正文摘录 ──\n"));
        renderAnalystTerminalDetail(report);
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
  const backendStockData = context.backendStockData || stockData;
  const marketSnapshot = summarizeMarketSnapshot(stockData);

  if (isDebugEnabled()) {
    console.log(chalk.gray(`\n  [调试] stockData 长度: ${stockData.length} 字符`));
    if (stockData.length > 0) {
      console.log(chalk.gray(`  [调试] stockData 预览: ${stockData.substring(0, 100)}...`));
    } else {
      console.log(chalk.red(`  [调试] ⚠️ stockData 为空！`));
    }
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
    // 优先使用 Railway 后端，回退到 Supabase
    const config = await import("../config.js").then(m => m.loadConfig());
    const useBackend = config.backend.enabled && config.backend.url;

    const events = useBackend
      ? streamOrchestratorBackend(symbol, {
          stockData: backendStockData,
          mode: options.mode || "full",
        })
      : streamOrchestrator(symbol, {
          stockData,
          mode: options.mode || "full",
        });

    eventLoop:
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
            spinner.text = `Layer 1 — ${label} 完成 (${event.report.sentiment}, 置信度 ${Math.round(normalizeConfidence(event.report.confidence) * 100)}%) | 进度 ${layer1Count}/8`;
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
          const avgConfidenceRatio = normalizeConfidence(
            reports.reduce((sum, r) => sum + normalizeConfidence(r.report.confidence), 0) / reports.length
          );
          const avgConfidence = Math.round(avgConfidenceRatio * 100);
          console.log(
            `  ${sentimentBadge(consensusSentiment)} ` +
            `${chalk.gray("综合置信度")} ${confidenceBar(avgConfidenceRatio)} ${chalk.gray(`(${avgConfidence}%)`)}`
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

          const quickSummary = buildActionableSummary(reports, backendStockData);
          const quickBits = [
            quickSummary.action ? `动作 ${quickSummary.action}` : "",
            quickSummary.positionLine ? `仓位 ${quickSummary.positionLine}` : "",
            quickSummary.levelLine ? quickSummary.levelLine : "",
          ].filter(Boolean);
          if (quickBits.length) {
            console.log(chalk.gray(`  ${chalk.dim("操作摘要:")} ${quickBits.join(" | ")}`));
          }

          // R3: 消除暂无数据尴尬 - 过滤掉置信度过低或明显缺数据的分析师
          const validReports = reports.filter(({ report }) => isUsableReport(report));

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
              `${confidenceBar(normalizeConfidence(report.confidence))}`
            );
            idx++;
          }

          if (options.mode === "layer1-only") {
            if (options.full) {
              renderPanoramaReportDocument(
                symbol,
                reportTypeLabel,
                reports,
                validReports,
                marketSnapshot,
                context.technicalSource,
                backendStockData,
              );
            } else {
              console.log(chalk.gray("\n  💡 提示: 使用 --full 选项查看完整详细报告\n"));
            }
            console.log(divider());
            break eventLoop;
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
            normalizeConfidence(
              reports.reduce((sum, r) => sum + normalizeConfidence(r.report.confidence), 0) / reports.length
            ) * 100
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
            const validReports = reports.filter(({ report }) => isUsableReport(report));
            renderDeepReportDocument(
              symbol,
              finalReportType,
              reports,
              validReports,
              marketSnapshot,
              context.technicalSource,
              backendStockData,
              masterOpinions,
              synthesis,
            );
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
      ? await applyDeduction(featureKey, billingState)
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
          renderAnalystTerminalDetail(r.report);
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
