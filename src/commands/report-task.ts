import chalk from "chalk";
import ora, { type Ora } from "ora";
import {
  createReportTaskBackend,
  getReportTaskBackend,
  type ReportTaskResponse,
  type ReportType,
} from "../api.js";
import type {
  CapabilityExecutionResult,
  ConversationArtifactDraft,
} from "../core/conversation-types.js";
import { TerminalAnswerRenderer } from "../core/terminal-answer-renderer.js";
import { printError } from "../errors.js";
import { output } from "../output.js";
import { track } from "../tracker.js";

const REPORT_POLL_INTERVAL_MS = 2_000;
const REPORT_WAIT_TIMEOUT_MS = 30 * 60 * 1_000;

export class ReportWaitTimeoutError extends Error {
  constructor(
    public taskId: string,
    timeoutMs: number,
  ) {
    super(`本地等待超过 ${formatElapsed(timeoutMs)}，后端任务仍在继续: ${taskId}`);
    this.name = "ReportWaitTimeoutError";
  }
}

interface ReportCommandOptions {
  full?: boolean;
  rawUserInput?: string;
}

interface WaitForReportTaskOptions {
  pollIntervalMs?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  onProgress?: (task: ReportTaskResponse, elapsedMs: number) => void;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function asRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.map(asRecord).filter((item): item is Record<string, unknown> => Boolean(item))
    : [];
}

function asText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return text || undefined;
}

function asTextList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(asText).filter((item): item is string => Boolean(item));
  }
  const text = asText(value);
  return text ? [text] : [];
}

function reportLabel(reportType: string): string {
  return reportType === "panorama" ? "全景研报" : "深度研报";
}

function executionPath(progress: Record<string, unknown> | null | undefined): string | undefined {
  const nested = asRecord(progress?.report_execution);
  return asText(nested?.path) ?? asText(progress?.execution_path);
}

function executionPathLabel(path: string | undefined): string | undefined {
  switch (path) {
    case "agent_harness":
      return "Agent Harness";
    case "legacy":
      return "Legacy";
    case "shadow":
      return "Shadow";
    case "dual_visible_debug":
      return "Dual Debug";
    default:
      return path;
  }
}

function formatElapsed(elapsedMs: number): string {
  const seconds = Math.max(0, Math.floor(elapsedMs / 1_000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m${seconds % 60}s`;
}

export function buildReportTaskProgressText(
  task: ReportTaskResponse,
  elapsedMs: number,
): string {
  const path = executionPathLabel(executionPath(task.progress));
  const completed = Array.isArray(task.progress?.completed)
    ? task.progress.completed.length
    : 0;
  const total = typeof task.progress?.total === "number"
    ? task.progress.total
    : 0;

  let stage: string;
  switch (task.status) {
    case "pending":
      stage = "已进入后端队列";
      break;
    case "processing":
      stage = completed > 0 && total > 0
        ? `后端执行中 · 已完成 ${completed}/${total}`
        : path === "Agent Harness"
          ? "Agent Harness 正在取证与综合"
          : "后端正在生成研报";
      break;
    case "done":
      stage = "研报已完成";
      break;
    case "failed":
      stage = "研报生成失败";
      break;
  }

  return [
    `${task.symbol || "研报"} · ${reportLabel(task.reportType)}`,
    stage,
    path,
    formatElapsed(elapsedMs),
  ].filter(Boolean).join(" · ");
}

function abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(new DOMException("等待已中断", "AbortError"));
  }
  return new Promise((resolve, reject) => {
    const finish = () => {
      signal?.removeEventListener("abort", abort);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    const abort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      reject(new DOMException("等待已中断", "AbortError"));
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
}

export async function waitForReportTask(
  taskId: string,
  options: WaitForReportTaskOptions = {},
): Promise<ReportTaskResponse> {
  const startedAt = Date.now();
  const pollIntervalMs = options.pollIntervalMs ?? REPORT_POLL_INTERVAL_MS;
  const timeoutMs = options.timeoutMs ?? REPORT_WAIT_TIMEOUT_MS;

  while (true) {
    const task = await getReportTaskBackend(taskId, options.signal);
    const elapsedMs = Date.now() - startedAt;
    options.onProgress?.(task, elapsedMs);

    if (task.status === "done" || task.status === "failed") return task;
    if (elapsedMs >= timeoutMs) {
      throw new ReportWaitTimeoutError(taskId, timeoutMs);
    }
    await abortableDelay(pollIntervalMs, options.signal);
  }
}

function firstText(record: Record<string, unknown> | undefined, keys: string[]): string | undefined {
  for (const key of keys) {
    const text = asText(record?.[key]);
    if (text) return text;
  }
  return undefined;
}

function buildAnalystMarkdown(result: Record<string, unknown>, full: boolean): string[] {
  const reports = asRecords(result.analystReports);
  if (!reports.length) return [];

  const lines = ["## 分析团队"];
  for (const report of reports) {
    const name = firstText(report, ["label", "title", "agent", "role"]) ?? "分析角色";
    const stance = firstText(report, ["sentiment", "stance"]);
    const confidence = typeof report.confidence === "number"
      ? `${Math.round(report.confidence * 100)}%`
      : undefined;
    const metadata = [stance, confidence].filter(Boolean).join(" · ");
    lines.push(`### ${name}${metadata ? ` · ${metadata}` : ""}`);

    const summary = firstText(report, ["summary", "content", "view"]);
    if (summary) lines.push(summary);

    const keyPoints = asTextList(report.keyPoints ?? report.key_points);
    if (keyPoints.length) {
      lines.push("**关键依据**");
      lines.push(...keyPoints.map(item => `- ${item}`));
    }

    const risks = asTextList(report.risks ?? report.risk);
    if (risks.length) {
      lines.push("**风险**");
      lines.push(...risks.map(item => `- ${item}`));
    }

    if (full) {
      const detail = firstText(report, ["fullReport", "full_report"]);
      if (detail && detail !== summary) lines.push(detail);
    }
  }
  return lines;
}

function buildRoundtableMarkdown(result: Record<string, unknown>): string[] {
  const roundtable = asRecord(result.roundtable);
  if (!roundtable) return [];

  const lines = ["## 投资框架圆桌"];
  for (const master of asRecords(roundtable.masters)) {
    const role = firstText(master, ["role", "name", "master"]) ?? "投资框架";
    const stance = firstText(master, ["stance"]);
    const view = firstText(master, ["view", "opinion", "content"]);
    if (view) lines.push(`- **${role}${stance ? ` · ${stance}` : ""}**：${view}`);
  }

  const verdict = firstText(roundtable, ["verdict"]);
  const divergence = firstText(roundtable, ["divergence"]);
  if (verdict) lines.push(`**圆桌结论**：${verdict}`);
  if (divergence) lines.push(`**核心分歧**：${divergence}`);
  return lines.length > 1 ? lines : [];
}

function buildSynthesisMarkdown(result: Record<string, unknown>): string[] {
  const synthesis = asRecord(result.synthesis);
  if (!synthesis) return [];

  const lines = ["## 综合裁定"];
  const verdict = firstText(synthesis, [
    "roundtable_verdict",
    "roundtableVerdict",
    "raw_synthesis",
    "rawSynthesis",
  ]);
  const divergence = firstText(synthesis, ["key_divergence", "keyDivergence"]);
  const bull = firstText(synthesis, ["bull_coalition", "bullCoalition"]);
  const bear = firstText(synthesis, ["bear_challenge", "bearChallenge"]);
  if (verdict) lines.push(verdict);
  if (bull) lines.push(`**支持依据**：${bull}`);
  if (bear) lines.push(`**保留意见**：${bear}`);
  if (divergence) lines.push(`**核心分歧**：${divergence}`);

  const failureSignals = asTextList(synthesis.failure_signals ?? synthesis.failureSignals);
  if (failureSignals.length) {
    lines.push("**失效信号**");
    lines.push(...failureSignals.map(item => `- ${item}`));
  }
  return lines.length > 1 ? lines : [];
}

export function buildReportMarkdown(task: ReportTaskResponse, full = false): string {
  const result = asRecord(task.result);
  const path = executionPathLabel(executionPath(task.progress));
  const lines = [
    `# ${task.symbol} ${reportLabel(task.reportType)}`,
    `任务：\`${task.taskId}\`${path ? ` · 路径：${path}` : ""}`,
  ];

  if (!result) {
    lines.push("后端返回的研报结果为空。");
    return lines.join("\n\n");
  }

  lines.push(
    ...buildSynthesisMarkdown(result),
    ...buildRoundtableMarkdown(result),
    ...buildAnalystMarkdown(result, full),
  );

  if (lines.length === 2) {
    lines.push("研报已完成，但当前终端版本无法识别该结果结构；请使用 `--json` 查看原始结果。");
  }
  return lines.join("\n\n");
}

function buildReportArtifact(task: ReportTaskResponse): ConversationArtifactDraft {
  const result = asRecord(task.result);
  const synthesis = asRecord(result?.synthesis);
  const roundtable = asRecord(result?.roundtable);
  const conclusion = firstText(synthesis, [
    "roundtable_verdict",
    "roundtableVerdict",
    "raw_synthesis",
    "rawSynthesis",
  ]) ?? firstText(roundtable, ["verdict"]);
  const risks = [...new Set([
    ...asTextList(synthesis?.failure_signals ?? synthesis?.failureSignals),
    ...asRecords(result?.analystReports).flatMap(report => asTextList(report.risks)),
  ])];
  const digest = [
    `${task.symbol} ${reportLabel(task.reportType)}`,
    `task ${task.taskId}`,
    conclusion,
    risks.length ? `风险：${risks.slice(0, 3).join("；")}` : undefined,
  ].filter(Boolean).join("；");

  return {
    type: task.reportType === "panorama" ? "full_report" : "deep_report",
    symbol: task.symbol,
    digest,
    payload: task,
  };
}

function renderReport(task: ReportTaskResponse, full: boolean): void {
  const markdown = buildReportMarkdown(task, full);
  if (process.stdout.isTTY) {
    process.stdout.write("\n");
    const renderer = new TerminalAnswerRenderer();
    renderer.write(markdown);
    renderer.end();
    return;
  }
  console.log(markdown);
}

async function waitAndOutputReport(
  taskId: string,
  options: ReportCommandOptions,
  initialSpinner?: Ora,
): Promise<CapabilityExecutionResult | undefined> {
  const controller = new AbortController();
  const interrupt = () => controller.abort();
  process.once("SIGINT", interrupt);
  let spinner = initialSpinner;

  if (!spinner && process.stderr.isTTY) {
    spinner = ora(`正在读取研报任务 ${taskId}…`).start();
  }

  try {
    const task = await waitForReportTask(taskId, {
      signal: controller.signal,
      onProgress: (current, elapsedMs) => {
        if (spinner) spinner.text = buildReportTaskProgressText(current, elapsedMs);
      },
    });

    if (task.status === "failed") {
      throw new Error(task.error || `研报任务失败: ${task.taskId}`);
    }

    spinner?.succeed(`${task.symbol} ${reportLabel(task.reportType)}已完成`);
    output(task, () => renderReport(task, Boolean(options.full)));
    return {
      json: task,
      artifact: buildReportArtifact(task),
    };
  } catch (err) {
    spinner?.stop();
    if (controller.signal.aborted) {
      console.error(chalk.yellow(`\n  已停止本地等待，后端任务仍在继续：${taskId}`));
      console.error(chalk.gray(`  稍后运行：arti report ${taskId}`));
      if (process.argv.length > 2) process.exitCode = 130;
      return;
    }
    printError(err);
    process.exitCode = 1;
    return;
  } finally {
    process.removeListener("SIGINT", interrupt);
  }
}

export async function createHarnessReportCommand(
  symbol: string,
  reportType: ReportType,
  options: ReportCommandOptions = {},
): Promise<CapabilityExecutionResult | undefined> {
  const normalizedSymbol = symbol.trim().toUpperCase();
  const spinner = process.stderr.isTTY
    ? ora(`正在创建 ${normalizedSymbol} ${reportLabel(reportType)}任务…`).start()
    : undefined;

  try {
    track(reportType === "panorama" ? "full" : "deep", [normalizedSymbol]);
    const created = await createReportTaskBackend({
      symbol: normalizedSymbol,
      reportType,
      rawSymbolText: symbol,
      rawUserInput: options.rawUserInput,
    });
    const taskLine = `任务已创建：${created.taskId}`;
    if (spinner) {
      spinner.text = `${taskLine} · 等待后端处理…`;
    } else {
      console.error(chalk.gray(`  ${taskLine}`));
    }
    return waitAndOutputReport(created.taskId, options, spinner);
  } catch (err) {
    spinner?.stop();
    printError(err);
    process.exitCode = 1;
    return;
  }
}

export async function reportTaskCommand(
  taskId: string,
  options: ReportCommandOptions = {},
): Promise<CapabilityExecutionResult | undefined> {
  const normalizedTaskId = taskId.trim();
  if (!normalizedTaskId) {
    console.log(chalk.red("请提供 task ID，例如：arti report <taskId>"));
    return;
  }
  return waitAndOutputReport(normalizedTaskId, options);
}
