import { randomUUID } from "node:crypto";
import chalk from "chalk";
import { loadConfig } from "../config.js";
import { isJsonMode, output } from "../output.js";
import {
  attachAgentRun,
  cancelAgentRun,
  createAgentRun,
  getAgentRun,
  getAgentRunResult,
} from "./client.js";
import type { AgentRunEvent } from "./types.js";

export async function harnessCommand(
  args: string[],
  options: Record<string, unknown>,
): Promise<void> {
  const action = (args[0] || "run").toLowerCase();
  const value = args[1];
  if (action === "run") {
    if (!value) throw new Error("usage: arti harness run <symbol> [--type panorama|deep]");
    const reportType = options.type === "deep" ? "deep" : "panorama";
    const created = await createAgentRun({
      symbol: value,
      reportType,
      idempotencyKey: String(options.idempotencyKey || randomUUID()),
      deliveryMode: options.detach ? "poll" : "stream",
    });
    output(created, () => {
      console.log(chalk.cyan(`Run ${created.runId} queued for task ${created.taskId}`));
    });
    if (options.detach) return;
    await renderStream(created.runId, 0, Boolean(options.verbose));
    return;
  }
  if (!value) throw new Error(`usage: arti harness ${action} <run-id>`);
  if (action === "attach") {
    await renderStream(value, Number(options.after || 0), Boolean(options.verbose));
  } else if (action === "status") {
    const status = await getAgentRun(value);
    output(status, () => printLines(formatRunStatus(status)));
  } else if (action === "result") {
    const [result, status] = await Promise.all([
      getAgentRunResult(value),
      getAgentRun(value),
    ]);
    output(result, () => printLines(formatRunResult(result, status)));
  } else if (action === "cancel") {
    const result = await cancelAgentRun(value);
    output(result, () => printLines(formatRunStatus(result)));
  } else {
    throw new Error("harness action must be run, attach, status, result, or cancel");
  }
}

interface StreamStats {
  startedAt: number | null;
  latestAt: number | null;
  roles: Set<string>;
  completedRoles: Set<string>;
  evidenceRefs: Set<string>;
  judgeDecision: string | null;
  outputGatePassed: boolean | null;
  resultUrl: string | null;
  taskId: string | null;
}

function createStreamStats(): StreamStats {
  return {
    startedAt: null,
    latestAt: null,
    roles: new Set(),
    completedRoles: new Set(),
    evidenceRefs: new Set(),
    judgeDecision: null,
    outputGatePassed: null,
    resultUrl: null,
    taskId: null,
  };
}

async function renderStream(
  runId: string,
  afterSequence: number,
  verbose: boolean,
): Promise<void> {
  const stats = createStreamStats();
  for await (const event of attachAgentRun(runId, { afterSequence })) {
    output(event, () => {
      const line = formatStreamEvent(event, stats, verbose);
      if (line) console.log(line);
    });
  }
  if (!isJsonMode()) printLines(formatStreamCompletion(runId, stats));
}

export function formatStreamEvent(
  event: AgentRunEvent,
  stats: StreamStats,
  verbose = false,
): string | null {
  updateStreamStats(event, stats);
  const payload = event.payload;
  const sequence = chalk.gray(event.sequence.toString().padStart(4, " "));
  const role = text(payload.role) || "Agent";
  const evidenceCount = stringList(payload.evidence_refs).length;
  const round = positiveNumber(payload.judge_round) || positiveNumber(payload.retry_round);
  switch (event.type) {
    case "run.queued":
      return `${sequence} ${chalk.gray("任务已进入队列")}`;
    case "run.started":
      return `${sequence} ${chalk.cyan("Harness 开始执行")}`;
    case "agent.spawned": {
      const objective = text(payload.objective_summary);
      const suffix = verbose && objective ? `：${objective}` : "";
      return `${sequence} ${chalk.cyan(`[${role}]`)} 已接收任务${suffix}`;
    }
    case "agent.started":
      return `${sequence} ${chalk.cyan(`[${role}]`)} 开始执行`;
    case "agent.completed":
      return `${sequence} ${chalk.green(`[${role}]`)} 完成本轮分析 · 证据 ${evidenceCount}`;
    case "agent.failed":
      return `${sequence} ${chalk.red(`[${role}]`)} 执行失败 · ${text(payload.error_code) || "unknown"}`;
    case "judge.started":
      return `${sequence} ${chalk.yellow(`第 ${round || "?"} 轮裁判开始`)}`;
    case "judge.completed": {
      const decision = text(payload.decision) || "unknown";
      const gate = payload.output_gate_passed === true ? "门禁通过" : "门禁未通过";
      const missing = stringList(payload.missing_evidence).length;
      const retry = payload.should_retry === true ? " · 将继续补证" : "";
      return `${sequence} ${chalk.yellow(`第 ${round || "?"} 轮裁判`)}：${decision} · ${gate} · 缺口 ${missing}${retry}`;
    }
    case "refine.started": {
      const targets = stringList(payload.target_agent_ids);
      const targetText = targets.length ? ` · 目标 ${targets.join("、")}` : "";
      const objective = text(payload.objective_summary);
      const detail = verbose && objective ? `：${objective}` : "";
      return `${sequence} ${chalk.magenta(`第 ${round || "?"} 轮修正`)}${targetText}${detail}`;
    }
    case "run.completed":
      return `${sequence} ${chalk.green("任务执行完成")} · ${text(payload.status) || "completed"}`;
    case "run.failed":
      return `${sequence} ${chalk.red("任务执行失败")} · ${text(payload.error_code) || "unknown"}`;
    case "run.cancelled":
      return `${sequence} ${chalk.yellow("任务已取消")}`;
    default:
      return verbose
        ? `${sequence} ${chalk.gray(event.type)} ${text(payload.summary)}`
        : null;
  }
}

export function formatRunResult(
  result: Record<string, unknown>,
  status: Record<string, unknown>,
): string[] {
  const payload = record(result.payload);
  const quality = record(result.quality);
  const cards = Array.isArray(payload.cards) ? payload.cards.filter(isRecord) : [];
  const hero = cards.find(card => {
    const cardType = text(card.type) || text(card.cardType) || text(card.card_type);
    return cardType === "hero";
  });
  const heroData = record(hero?.data);
  const trace = findHarnessTrace(payload, cards);
  const taskId = text(status.task_id) || text(status.taskId);
  const runId = text(result.run_id) || text(status.id) || text(status.run_id);
  const symbol = text(heroData.symbol) || text(payload.symbol) || "未提供";
  const name = text(heroData.name) || text(payload.name);
  const decision = text(quality.judge_decision)
    || text(trace.judgeDecision)
    || text(trace.judge_decision)
    || "未提供";
  const gateValue = quality.output_gate_passed
    ?? trace.outputGatePassed
    ?? trace.output_gate_passed;
  const evidenceCount = firstNumber(
    trace.evidenceRefCount,
    trace.evidence_ref_count,
    trace.evidenceCount,
    trace.evidence_count,
  );
  const masterCount = firstNumber(
    trace.subagentCount,
    trace.subagent_count,
    Array.isArray(payload.masters) ? payload.masters.length : undefined,
  );
  const reportUrl = taskId ? reportPageUrl(taskId) : null;
  return [
    chalk.bold("Agent Harness 结果摘要"),
    `Run ID：${runId || "未提供"}`,
    `Task ID：${taskId || "未提供"}`,
    `标的：${name ? `${name}（${symbol}）` : symbol}`,
    `状态：${text(result.status) || text(status.status) || "未提供"}`,
    `质量裁决：${decision}`,
    `质量门禁：${gateValue === true ? "通过" : gateValue === false ? "未通过" : "未提供"}`,
    `证据数量：${evidenceCount ?? "未提供"}`,
    `角色数量：${masterCount ?? "未提供"}`,
    `报告卡片：${cards.length}`,
    `报告页面：${reportUrl || "未提供"}`,
    "",
    chalk.gray("完整结构化结果请使用：arti harness result <run-id> --json"),
  ];
}

export function formatRunStatus(status: Record<string, unknown>): string[] {
  const taskId = text(status.task_id) || text(status.taskId);
  const runId = text(status.id) || text(status.run_id) || text(status.runId);
  return [
    chalk.bold("Agent Harness 运行状态"),
    `Run ID：${runId || "未提供"}`,
    `Task ID：${taskId || "未提供"}`,
    `状态：${text(status.status) || "未提供"}`,
    `报告页面：${taskId ? reportPageUrl(taskId) : "未提供"}`,
  ];
}

function updateStreamStats(event: AgentRunEvent, stats: StreamStats): void {
  const timestamp = Date.parse(event.timestamp);
  if (Number.isFinite(timestamp)) {
    stats.startedAt = stats.startedAt === null ? timestamp : Math.min(stats.startedAt, timestamp);
    stats.latestAt = stats.latestAt === null ? timestamp : Math.max(stats.latestAt, timestamp);
  }
  stats.taskId ||= event.task_id ? String(event.task_id) : null;
  const role = text(event.payload.role);
  if (role) stats.roles.add(role);
  if (event.type === "agent.completed" && role) stats.completedRoles.add(role);
  for (const ref of stringList(event.payload.evidence_refs)) stats.evidenceRefs.add(ref);
  if (event.type === "judge.completed") {
    stats.judgeDecision = text(event.payload.decision) || stats.judgeDecision;
    if (typeof event.payload.output_gate_passed === "boolean") {
      stats.outputGatePassed = event.payload.output_gate_passed;
    }
  }
  if (event.type === "run.completed") {
    stats.resultUrl = text(event.payload.result_url) || null;
  }
}

function formatStreamCompletion(runId: string, stats: StreamStats): string[] {
  if (stats.latestAt === null) return [];
  const elapsed = stats.startedAt === null
    ? "未提供"
    : formatDuration(Math.max(0, stats.latestAt - stats.startedAt));
  const reportUrl = stats.taskId ? reportPageUrl(stats.taskId) : null;
  return [
    "",
    chalk.bold("执行摘要"),
    `Run ID：${runId}`,
    `角色：${stats.completedRoles.size}/${stats.roles.size} 完成`,
    `耗时：${elapsed}`,
    `证据：${stats.evidenceRefs.size}`,
    `最终裁决：${stats.judgeDecision || "未提供"}`,
    `质量门禁：${stats.outputGatePassed === true ? "通过" : stats.outputGatePassed === false ? "未通过" : "未提供"}`,
    `报告页面：${reportUrl || absoluteResultUrl(stats.resultUrl) || "未提供"}`,
  ];
}

function reportPageUrl(taskId: string): string {
  const configured = process.env.ARTI_WEB_URL?.replace(/\/+$/, "");
  if (configured) return `${configured}/report/task/${encodeURIComponent(taskId)}`;
  const backend = loadConfig().backend.url;
  const isDev = backend.toLowerCase().includes("dev");
  return `${isDev ? "https://dev.artifin.ai" : "https://www.artifin.ai"}/report/task/${encodeURIComponent(taskId)}`;
}

function absoluteResultUrl(path: string | null): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `${loadConfig().backend.url.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

function findHarnessTrace(
  payload: Record<string, unknown>,
  cards: Array<Record<string, unknown>>,
): Record<string, unknown> {
  const direct = record(payload.harnessTrace);
  if (Object.keys(direct).length) return direct;
  const roundtable = record(payload.roundtable);
  const nested = record(roundtable.harnessTrace);
  if (Object.keys(nested).length) return nested;
  for (const card of cards) {
    const trace = record(record(card.data).harnessTrace);
    if (Object.keys(trace).length) return trace;
  }
  return {};
}

function printLines(lines: string[]): void {
  for (const line of lines) console.log(line);
}

function formatDuration(milliseconds: number): string {
  const seconds = Math.round(milliseconds / 1000);
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} 分 ${seconds % 60} 秒`;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.length > 0)
    : [];
}

function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function positiveNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const parsed = positiveNumber(value);
    if (parsed !== null) return parsed;
  }
  return null;
}
