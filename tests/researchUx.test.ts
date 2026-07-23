import { describe, expect, it } from "vitest";
import type { ResearchReport } from "../src/api.js";
import {
  buildAnalystOverviewRows,
  buildLayer1AgentDoneProgress,
  buildLayer1AgentSkippedProgress,
  buildResearchStartupProgress,
  buildResearchTimeoutWarning,
  isUsableResearchReport,
} from "../src/commands/research.js";

function makeReport(overrides: Partial<ResearchReport> = {}): ResearchReport {
  return {
    title: "AAPL quick read",
    summary: "Revenue growth is steady while margin pressure remains watchable.",
    keyPoints: ["Services growth supports margins", "Valuation is the main risk"],
    sentiment: "看多",
    confidence: 0.72,
    fullReport: "Detailed report body",
    ...overrides,
  };
}

describe("research UX acceptance helpers", () => {
  it("R1 shows visible startup and per-agent Layer 1 progress", () => {
    expect(buildResearchStartupProgress("AAPL")).toEqual({
      searching: "正在搜索股票代码 AAPL...",
      fetching: "正在获取 AAPL 行情与技术数据...",
      connecting: "连接 ARTI 研报引擎...",
    });

    expect(buildLayer1AgentDoneProgress("技术面", makeReport(), 3)).toBe(
      "Layer 1 — 技术面 完成 (看多, 置信度 72%) | 进度 3/8",
    );
  });

  it("R2 supports a first-screen overview row with stance and confidence", () => {
    const [row] = buildAnalystOverviewRows([
      { agent: "tony", report: makeReport({ sentiment: "中性", confidence: 62 }) },
    ]);

    expect(row).toMatchObject({
      index: 1,
      label: "技术面",
      sentiment: "中性",
      confidence: 0.62,
      skipped: false,
    });
  });

  it("R3 filters missing-data analyst reports into a short skipped state", () => {
    const missingDataReport = makeReport({
      summary: "暂无该项数据，无法获取足够行情数据生成完整技术分析。",
      confidence: 0.81,
    });

    expect(isUsableResearchReport(missingDataReport)).toBe(false);
    expect(buildLayer1AgentSkippedProgress("技术面", 4)).toBe(
      "Layer 1 — 技术面 数据不足，跳过 | 进度 4/8",
    );
    expect(buildAnalystOverviewRows([{ agent: "tony", report: missingDataReport }])[0]).toMatchObject({
      skipped: true,
      skipReason: "数据获取中，跳过",
    });
  });

  it("R4 keeps the analyst overview layered instead of dumping full report text", () => {
    const rows = buildAnalystOverviewRows([
      { agent: "natasha", report: makeReport({ sentiment: "看多", confidence: 0.83 }) },
      { agent: "thor", report: makeReport({ sentiment: "看空", confidence: 0.47 }) },
    ]);

    expect(rows).toEqual([
      expect.objectContaining({ index: 1, label: "情报·宏观", sentiment: "看多", confidence: 0.83 }),
      expect.objectContaining({ index: 2, label: "风控", sentiment: "看空", confidence: 0.47 }),
    ]);
    expect(rows.every(row => !("fullReport" in row))).toBe(true);
  });

  it("R5 shows a cancellable timeout warning after long waits", () => {
    expect(buildResearchTimeoutWarning(62)).toBe(
      "分析耗时较长（已等待 62s），您可以按 Ctrl+C 取消，或继续等待...",
    );
  });
});
