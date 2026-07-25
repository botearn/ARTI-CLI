import { ensureValidAccessToken } from "../auth.js";
import { loadConfig } from "../config.js";
import { ApiError } from "../api.js";
import { SseFrameParser } from "./sse.js";
import {
  parseAgentRunEvent,
  type AgentRunCreateResponse,
  type AgentRunEvent,
} from "./types.js";

function enabled(): boolean {
  return ["1", "true", "yes", "on"].includes(
    (process.env.ARTI_HARNESS_STREAMING_ENABLED ?? "").toLowerCase(),
  );
}

function requireEnabled(): void {
  if (!enabled()) {
    throw new Error(
      "Agent Harness streaming is disabled. Set ARTI_HARNESS_STREAMING_ENABLED=true to opt in.",
    );
  }
}

async function request(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  requireEnabled();
  const config = loadConfig();
  const token = await ensureValidAccessToken();
  const base = config.backend.url.replace(/\/+$/, "");
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      Authorization: `Bearer ${token}`,
      ...init.headers,
    },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "unknown error");
    throw new ApiError(path, response.status, text);
  }
  return response;
}

export async function createAgentRun(input: {
  symbol: string;
  reportType: "panorama" | "deep";
  idempotencyKey: string;
  deliveryMode?: "stream" | "poll";
}): Promise<AgentRunCreateResponse> {
  const response = await request("/v1/agent-runs", {
    method: "POST",
    headers: { "Idempotency-Key": input.idempotencyKey },
    body: JSON.stringify({
      symbol: input.symbol,
      reportType: input.reportType,
      deliveryMode: input.deliveryMode ?? "stream",
    }),
  });
  return await response.json() as AgentRunCreateResponse;
}

export async function getAgentRun(runId: string): Promise<Record<string, unknown>> {
  const payload = await (await request(`/v1/agent-runs/${encodeURIComponent(runId)}`)).json();
  return payload as Record<string, unknown>;
}

export async function getAgentRunResult(runId: string): Promise<Record<string, unknown>> {
  const payload = await (
    await request(`/v1/agent-runs/${encodeURIComponent(runId)}/result`)
  ).json();
  return payload as Record<string, unknown>;
}

export async function cancelAgentRun(runId: string): Promise<Record<string, unknown>> {
  return await (await request(`/v1/agent-runs/${encodeURIComponent(runId)}/cancel`, {
    method: "POST",
  })).json() as Record<string, unknown>;
}

export async function* attachAgentRun(
  runId: string,
  options: { afterSequence?: number; signal?: AbortSignal } = {},
): AsyncGenerator<AgentRunEvent> {
  let lastSequence = Math.max(options.afterSequence ?? 0, 0);
  const response = await request(`/v1/agent-runs/${encodeURIComponent(runId)}/events`, {
    method: "GET",
    headers: lastSequence ? { "Last-Event-ID": String(lastSequence) } : {},
    signal: options.signal,
  });
  if (!response.body) throw new Error("Agent run SSE response has no body");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parser = new SseFrameParser();
  try {
    while (true) {
      const { done, value } = await reader.read();
      const frames = parser.feed(
        value ? decoder.decode(value, { stream: !done }) : "",
        done,
      );
      for (const frame of frames) {
        if (!frame.data) continue;
        const event = parseAgentRunEvent(JSON.parse(frame.data));
        if (frame.id && frame.id !== event.event_id) {
          throw new Error("SSE id does not match event_id");
        }
        if (frame.event && frame.event !== event.type) {
          throw new Error("SSE event does not match payload type");
        }
        if (event.sequence <= lastSequence) continue;
        // The durable sequence covers public, debug and internal events. Public
        // consumers therefore see a strictly increasing, but not contiguous,
        // cursor when non-public events are filtered by the server.
        lastSequence = event.sequence;
        yield event;
      }
      if (done) break;
    }
  } finally {
    reader.releaseLock();
  }
}
