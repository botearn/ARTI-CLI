import { z } from "zod";

const BaseEvent = z.object({
  schema_version: z.string().refine(value => value.split(".")[0] === "1"),
  event_id: z.string().regex(/^[1-9][0-9]*$/),
  sequence: z.number().int().positive(),
  run_id: z.string().uuid(),
  task_id: z.string().uuid().nullable().optional(),
  attempt: z.number().int().nonnegative(),
  timestamp: z.string(),
  type: z.string(),
  visibility: z.enum(["public", "debug", "internal"]),
  trace_ref: z.string().nullable().optional(),
  payload: z.record(z.string(), z.unknown()),
}).passthrough();

export type AgentRunEvent = z.infer<typeof BaseEvent>;

export function parseAgentRunEvent(value: unknown): AgentRunEvent {
  const event = BaseEvent.parse(value);
  if (event.event_id !== String(event.sequence)) {
    throw new Error("Agent event_id does not match sequence");
  }
  return event;
}

export interface AgentRunCreateResponse {
  runId: string;
  taskId: string;
  status: string;
  eventsUrl: string;
  resultUrl: string;
  reused: boolean;
}

export interface ParsedSseFrame {
  id?: string;
  event?: string;
  retry?: number;
  data?: string;
}
