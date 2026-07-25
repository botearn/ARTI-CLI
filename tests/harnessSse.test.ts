import { describe, expect, it } from "vitest";
import { SseFrameParser } from "../src/harness/sse.js";
import { parseAgentRunEvent } from "../src/harness/types.js";

const validEvent = {
  schema_version: "1.0",
  event_id: "42",
  sequence: 42,
  run_id: "3f621494-3ebd-4518-93f8-643a86d5b8bb",
  task_id: "6d02a989-f2df-4457-8057-83595320dd9f",
  attempt: 1,
  type: "judge.completed",
  timestamp: "2026-07-26T10:00:00Z",
  visibility: "public",
  payload: {
    judge_round: 1,
    decision: "needs_more_evidence",
    summary: "关键估值数据时效不足，正在补充查询",
  },
};

describe("Agent Harness SSE parser", () => {
  it("preserves id, event, retry and multi-line data across fragmented chunks", () => {
    const parser = new SseFrameParser();
    expect(parser.feed("retry: 3000\n\nid: 42\nevent: judge.")).toEqual([
      { retry: 3000 },
    ]);
    const frames = parser.feed(
      `completed\ndata: ${JSON.stringify(validEvent)}\n\n`,
    );
    expect(frames).toEqual([{
      id: "42",
      event: "judge.completed",
      data: JSON.stringify(validEvent),
    }]);
  });

  it("ignores comments without losing the next event", () => {
    const parser = new SseFrameParser();
    const frames = parser.feed(`: heartbeat\n\nid: 42\ndata: ${JSON.stringify(validEvent)}\n\n`);
    expect(frames).toHaveLength(1);
    expect(frames[0].id).toBe("42");
  });
});

describe("Agent event compatibility", () => {
  it("accepts same-major future optional fields", () => {
    const parsed = parseAgentRunEvent({
      ...validEvent,
      schema_version: "1.1",
      future_optional_envelope_field: true,
      payload: { ...validEvent.payload, future_optional_payload_field: true },
    });
    expect(parsed.sequence).toBe(42);
  });

  it("rejects mismatched event id and sequence", () => {
    expect(() => parseAgentRunEvent({ ...validEvent, event_id: "41" }))
      .toThrow(/does not match sequence/);
  });

  it("rejects an unsupported major version", () => {
    expect(() => parseAgentRunEvent({ ...validEvent, schema_version: "2.0" }))
      .toThrow();
  });
});
