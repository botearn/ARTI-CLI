import type { ParsedSseFrame } from "./types.js";

export class SseFrameParser {
  private buffer = "";

  feed(chunk: string, flush = false): ParsedSseFrame[] {
    this.buffer += chunk;
    const normalized = this.buffer.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const blocks = normalized.split("\n\n");
    const trailing = blocks.pop() ?? "";
    if (flush) {
      this.buffer = "";
      if (trailing) blocks.push(trailing);
    } else {
      this.buffer = trailing;
    }

    return blocks
      .map(parseFrame)
      .filter((frame): frame is ParsedSseFrame => frame !== null);
  }
}

function parseFrame(block: string): ParsedSseFrame | null {
  if (!block.trim()) return null;
  const frame: ParsedSseFrame = {};
  const data: string[] = [];
  for (const line of block.split("\n")) {
    if (!line || line.startsWith(":")) continue;
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "id" && !value.includes("\0")) frame.id = value;
    else if (field === "event") frame.event = value;
    else if (field === "retry" && /^\d+$/.test(value)) frame.retry = Number(value);
    else if (field === "data") data.push(value);
  }
  if (data.length) frame.data = data.join("\n");
  return Object.keys(frame).length ? frame : null;
}
