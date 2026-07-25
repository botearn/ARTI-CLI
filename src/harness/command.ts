import { randomUUID } from "node:crypto";
import chalk from "chalk";
import { output } from "../output.js";
import {
  attachAgentRun,
  cancelAgentRun,
  createAgentRun,
  getAgentRun,
  getAgentRunResult,
} from "./client.js";

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
    });
    output(created, () => {
      console.log(chalk.cyan(`Run ${created.runId} queued for task ${created.taskId}`));
    });
    if (options.detach) return;
    await renderStream(created.runId, 0);
    return;
  }
  if (!value) throw new Error(`usage: arti harness ${action} <run-id>`);
  if (action === "attach") {
    await renderStream(value, Number(options.after || 0));
  } else if (action === "status") {
    const status = await getAgentRun(value);
    output(status, () => console.log(JSON.stringify(status, null, 2)));
  } else if (action === "result") {
    const result = await getAgentRunResult(value);
    output(result, () => console.log(JSON.stringify(result, null, 2)));
  } else if (action === "cancel") {
    const result = await cancelAgentRun(value);
    output(result, () => console.log(JSON.stringify(result, null, 2)));
  } else {
    throw new Error("harness action must be run, attach, status, result, or cancel");
  }
}

async function renderStream(runId: string, afterSequence: number): Promise<void> {
  for await (const event of attachAgentRun(runId, { afterSequence })) {
    output(event, () => {
      const label = `${event.sequence.toString().padStart(4, " ")} ${event.type}`;
      console.log(chalk.gray(label), formatPayload(event.payload));
    });
  }
}

function formatPayload(payload: Record<string, unknown>): string {
  const summary = payload.summary || payload.objective_summary || payload.status;
  return summary ? String(summary) : "";
}
