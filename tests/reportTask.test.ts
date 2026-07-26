import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createReportTaskBackend = vi.fn();
const getReportTaskBackend = vi.fn();
const output = vi.fn();
const printError = vi.fn();
const track = vi.fn();

vi.mock("../src/api.js", () => ({
  createReportTaskBackend,
  getReportTaskBackend,
}));
vi.mock("../src/output.js", () => ({ output }));
vi.mock("../src/errors.js", () => ({ printError }));
vi.mock("../src/tracker.js", () => ({ track }));

describe("Backend Agent Harness 研报任务", () => {
  const doneTask = {
    taskId: "task-1",
    symbol: "NVDA",
    reportType: "panorama",
    status: "done" as const,
    progress: {
      execution_path: "agent_harness",
    },
    result: {
      analystReports: [{
        agent: "growth-hunter",
        label: "成长猎手",
        summary: "AI 数据中心收入保持增长。",
        keyPoints: ["订单能见度仍强。"],
        risks: ["估值处于高位。"],
        sentiment: "看多",
        confidence: 0.82,
      }],
      roundtable: {
        masters: [{
          role: "价值守门人",
          stance: "中性",
          view: "增长强，但需要估值安全边际。",
        }],
        verdict: "当前结论偏积极。",
        divergence: "增长与估值存在分歧。",
      },
      synthesis: {
        roundtable_verdict: "基本面保持强势，但不宜忽略估值风险。",
        failure_signals: ["订单增速明显下滑。"],
      },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  it("依次轮询 pending、processing 和 done", async () => {
    getReportTaskBackend
      .mockResolvedValueOnce({
        ...doneTask,
        status: "pending",
        result: null,
      })
      .mockResolvedValueOnce({
        ...doneTask,
        status: "processing",
        result: null,
      })
      .mockResolvedValueOnce(doneTask);
    const onProgress = vi.fn();

    const { waitForReportTask } = await import("../src/commands/report-task.js");
    await expect(waitForReportTask("task-1", {
      pollIntervalMs: 0,
      timeoutMs: 1_000,
      onProgress,
    })).resolves.toEqual(doneTask);

    expect(getReportTaskBackend).toHaveBeenCalledTimes(3);
    expect(onProgress).toHaveBeenCalledTimes(3);
  });

  it("本地等待超时保留 task ID，便于恢复", async () => {
    getReportTaskBackend.mockResolvedValue({
      ...doneTask,
      status: "processing",
      result: null,
    });

    const {
      ReportWaitTimeoutError,
      waitForReportTask,
    } = await import("../src/commands/report-task.js");
    await expect(waitForReportTask("task-1", {
      pollIntervalMs: 0,
      timeoutMs: 0,
    })).rejects.toEqual(expect.objectContaining({
      name: "ReportWaitTimeoutError",
      taskId: "task-1",
    }));
    await expect(waitForReportTask("task-1", {
      pollIntervalMs: 0,
      timeoutMs: 0,
    })).rejects.toBeInstanceOf(ReportWaitTimeoutError);
  });

  it("进度文案只展示后端实际状态与执行路径", async () => {
    const { buildReportTaskProgressText } = await import("../src/commands/report-task.js");

    expect(buildReportTaskProgressText({
      ...doneTask,
      status: "processing",
      progress: {
        report_execution: { path: "agent_harness" },
      },
      result: null,
    }, 65_000)).toBe(
      "NVDA · 全景研报 · Agent Harness 正在取证与综合 · Agent Harness · 1m5s",
    );

    expect(buildReportTaskProgressText({
      ...doneTask,
      status: "processing",
      progress: {
        execution_path: "legacy",
        completed: ["natasha", "tony"],
        total: 5,
      },
      result: null,
    }, 8_000)).toContain("已完成 2/5 · Legacy");
  });

  it("把统一 result 渲染为终端报告结构", async () => {
    const { buildReportMarkdown } = await import("../src/commands/report-task.js");
    const markdown = buildReportMarkdown(doneTask);

    expect(markdown).toContain("# NVDA 全景研报");
    expect(markdown).toContain("路径：Agent Harness");
    expect(markdown).toContain("## 综合裁定");
    expect(markdown).toContain("基本面保持强势");
    expect(markdown).toContain("## 投资框架圆桌");
    expect(markdown).toContain("价值守门人");
    expect(markdown).toContain("## 分析团队");
    expect(markdown).toContain("成长猎手");
    expect(markdown).toContain("估值处于高位");
  });

  it("full 创建 panorama 任务、透传研究重点并返回 Artifact", async () => {
    createReportTaskBackend.mockResolvedValue({
      taskId: "task-1",
      status: "pending",
    });
    getReportTaskBackend.mockResolvedValue(doneTask);

    const { createHarnessReportCommand } = await import("../src/commands/report-task.js");
    await expect(createHarnessReportCommand("nvda", "panorama", {
      rawUserInput: "重点看估值风险",
    })).resolves.toEqual({
      json: doneTask,
      artifact: {
        type: "full_report",
        symbol: "NVDA",
        digest: expect.stringContaining("基本面保持强势"),
        payload: doneTask,
      },
    });

    expect(createReportTaskBackend).toHaveBeenCalledWith({
      symbol: "NVDA",
      reportType: "panorama",
      rawSymbolText: "nvda",
      rawUserInput: "重点看估值风险",
    });
    expect(output).toHaveBeenCalledWith(doneTask, expect.any(Function));
    expect(track).toHaveBeenCalledWith("full", ["NVDA"]);
  });

  it("report 只恢复已有任务，不创建新任务", async () => {
    getReportTaskBackend.mockResolvedValue({
      ...doneTask,
      reportType: "deep",
    });

    const { reportTaskCommand } = await import("../src/commands/report-task.js");
    const result = await reportTaskCommand("task-1");

    expect(createReportTaskBackend).not.toHaveBeenCalled();
    expect(getReportTaskBackend).toHaveBeenCalledWith("task-1", expect.any(AbortSignal));
    expect(result?.artifact?.type).toBe("deep_report");
  });

  it("后端任务失败时输出错误并返回失败退出码", async () => {
    getReportTaskBackend.mockResolvedValue({
      ...doneTask,
      status: "failed",
      result: null,
      error: "分析角色执行失败",
    });

    const { reportTaskCommand } = await import("../src/commands/report-task.js");
    await expect(reportTaskCommand("task-1")).resolves.toBeUndefined();

    expect(printError).toHaveBeenCalledWith(expect.objectContaining({
      message: "分析角色执行失败",
    }));
    expect(process.exitCode).toBe(1);
  });
});
