import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadConfig = vi.fn();
const ensureValidAccessToken = vi.fn();

vi.mock("../src/config.js", () => ({ loadConfig }));
vi.mock("../src/auth.js", () => ({ ensureValidAccessToken }));

const runId = "3f621494-3ebd-4518-93f8-643a86d5b8bb";

function event(sequence: number): Record<string, unknown> {
  return {
    schema_version: "1.0",
    event_id: String(sequence),
    sequence,
    run_id: runId,
    task_id: "6d02a989-f2df-4457-8057-83595320dd9f",
    attempt: 1,
    type: "agent.started",
    timestamp: "2026-07-26T10:00:00Z",
    visibility: "public",
    payload: {},
  };
}

function sse(events: Array<Record<string, unknown>>): Response {
  const body = events
    .map(item => `id: ${item.event_id}\nevent: ${item.type}\ndata: ${JSON.stringify(item)}\n\n`)
    .join("");
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

async function collectSequences(): Promise<number[]> {
  const { attachAgentRun } = await import("../src/harness/client.js");
  const sequences: number[] = [];
  for await (const item of attachAgentRun(runId)) sequences.push(item.sequence);
  return sequences;
}

describe("Agent Harness streaming client", () => {
  beforeEach(() => {
    process.env.ARTI_HARNESS_STREAMING_ENABLED = "true";
    loadConfig.mockReturnValue({
      backend: { url: "https://backend.example", timeout: 60_000 },
    });
    ensureValidAccessToken.mockResolvedValue("user-jwt");
  });

  afterEach(() => {
    delete process.env.ARTI_HARNESS_STREAMING_ENABLED;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    loadConfig.mockReset();
    ensureValidAccessToken.mockReset();
  });

  it("accepts gaps caused by server-side visibility filtering", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => sse([event(1), event(2), event(10), event(19)])));

    await expect(collectSequences()).resolves.toEqual([1, 2, 10, 19]);
  });

  it("ignores duplicate or stale replay frames", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => sse([event(1), event(2), event(2), event(1), event(5)])));

    await expect(collectSequences()).resolves.toEqual([1, 2, 5]);
  });
});
