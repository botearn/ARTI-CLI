import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  formatRunResult,
  formatStreamEvent,
} from "../src/harness/command.js";
import type { AgentRunEvent } from "../src/harness/types.js";

function event(
  sequence: number,
  type: string,
  payload: Record<string, unknown>,
): AgentRunEvent {
  return {
    schema_version: "1.0",
    event_id: String(sequence),
    sequence,
    run_id: "3f621494-3ebd-4518-93f8-643a86d5b8bb",
    task_id: "6d02a989-f2df-4457-8057-83595320dd9f",
    attempt: 1,
    timestamp: `2026-07-26T10:00:${String(sequence).padStart(2, "0")}Z`,
    type,
    visibility: "public",
    payload,
  };
}

describe("Agent Harness human output", () => {
  beforeEach(() => {
    process.env.ARTI_WEB_URL = "https://dev.artifin.ai";
  });

  afterEach(() => {
    delete process.env.ARTI_WEB_URL;
  });

  it("renders the final hard-gate decision and retry state", () => {
    const stats = {
      startedAt: null,
      latestAt: null,
      roles: new Set<string>(),
      completedRoles: new Set<string>(),
      evidenceRefs: new Set<string>(),
      judgeDecision: null,
      outputGatePassed: null,
      resultUrl: null,
      taskId: null,
    };
    const line = formatStreamEvent(event(24, "judge.completed", {
      judge_round: 1,
      decision: "needs_more_evidence",
      output_gate_passed: false,
      should_retry: true,
      missing_evidence: ["price", "financials"],
    }), stats);

    expect(line).toContain("needs_more_evidence");
    expect(line).toContain("门禁未通过");
    expect(line).toContain("缺口 2");
    expect(line).toContain("将继续补证");
  });

  it("keeps long objectives hidden unless verbose mode is requested", () => {
    const makeStats = () => ({
      startedAt: null,
      latestAt: null,
      roles: new Set<string>(),
      completedRoles: new Set<string>(),
      evidenceRefs: new Set<string>(),
      judgeDecision: null,
      outputGatePassed: null,
      resultUrl: null,
      taskId: null,
    });
    const spawned = event(3, "agent.spawned", {
      role: "value-guardian",
      objective_summary: "一段很长的内部任务目标",
    });

    expect(formatStreamEvent(spawned, makeStats(), false)).not.toContain("一段很长");
    expect(formatStreamEvent(spawned, makeStats(), true)).toContain("一段很长");
  });

  it("aggregates distinct agents and evidence by public identity", () => {
    const stats = {
      startedAt: null,
      latestAt: null,
      roles: new Set<string>(),
      completedRoles: new Set<string>(),
      evidenceRefs: new Set<string>(),
      judgeDecision: null,
      outputGatePassed: null,
      resultUrl: null,
      taskId: null,
    };

    const line = formatStreamEvent(event(8, "agent.completed", {
      agent_id: "value-guardian",
      role: "roundtable_master",
      status: "completed",
      evidence_refs: ["ev-1", "ev-2"],
    }), stats);

    expect(line).toContain("[value-guardian]");
    expect(line).toContain("证据 2");
    expect(stats.roles).toEqual(new Set(["value-guardian"]));
    expect(stats.completedRoles).toEqual(new Set(["value-guardian"]));
    expect(stats.evidenceRefs).toEqual(new Set(["ev-1", "ev-2"]));
  });

  it("renders a compact result summary with quality and report URL", () => {
    const lines = formatRunResult({
      run_id: "3f621494-3ebd-4518-93f8-643a86d5b8bb",
      status: "completed_with_gaps",
      quality: {
        judge_decision: "pass_with_gaps",
        output_gate_passed: true,
      },
      payload: {
        cards: [
          {
            type: "hero",
            data: { symbol: "AAPL", name: "Apple Inc." },
          },
          {
            type: "roundtable",
            data: {
              harnessTrace: {
                evidenceRefCount: 19,
                subagentCount: 4,
              },
            },
          },
        ],
      },
    }, {
      task_id: "6d02a989-f2df-4457-8057-83595320dd9f",
    });

    expect(lines.join("\n")).toContain("Apple Inc.（AAPL）");
    expect(lines.join("\n")).toContain("质量门禁：通过");
    expect(lines.join("\n")).toContain("证据数量：19");
    expect(lines.join("\n")).toContain(
      "https://dev.artifin.ai/report/task/6d02a989-f2df-4457-8057-83595320dd9f",
    );
    expect(lines.join("\n")).toContain("--json");
  });
});
