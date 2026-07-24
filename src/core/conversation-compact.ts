import { streamChat } from "../api.js";
import type { ChatMessage } from "../commands/chat.js";
import {
  isConversationSummary,
  type ChatUsageEvent,
  type ConversationArtifactReference,
  type ConversationSummary,
} from "./conversation-types.js";

export interface ConversationCompactInput {
  focus?: string;
  previousSummary?: ConversationSummary;
  messages: ChatMessage[];
  activeSymbols: string[];
  artifacts: ConversationArtifactReference[];
}

interface ConversationCompactOptions {
  onUsage?: (usage: ChatUsageEvent) => void;
}

function stripCodeFence(content: string): string {
  const trimmed = content.trim();
  const match = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return match ? match[1].trim() : trimmed;
}

export async function requestConversationSummary(
  input: ConversationCompactInput,
  options: ConversationCompactOptions = {},
): Promise<ConversationSummary> {
  const prompt = [
    "请把以下投研会话压缩为严格 JSON，不要输出解释或 Markdown。",
    "必须返回字段：goal、activeSymbols、facts、conclusions、risks、assumptions、unresolvedQuestions、artifactIds。",
    "facts 每项格式为 {\"text\": string, \"asOf\"?: string, \"source\"?: string}。",
    "保留标的、带时间的数据事实、结论、风险、用户约束、未决问题和 Artifact 引用。",
    input.focus ? `用户指定的压缩重点：${input.focus}` : "用户未指定额外压缩重点。",
    `待压缩内容：${JSON.stringify({
      previousSummary: input.previousSummary,
      messages: input.messages,
      activeSymbols: input.activeSymbols,
      artifacts: input.artifacts,
    })}`,
  ].join("\n");

  let content = "";
  for await (const delta of streamChat(
    [{ role: "user", content: prompt }],
    {
      clientCapabilities: { usageEvents: true },
      ...(options.onUsage ? { onUsage: options.onUsage } : {}),
    },
  )) {
    content += delta;
  }

  try {
    const summary = JSON.parse(stripCodeFence(content));
    if (!isConversationSummary(summary)) throw new Error("字段不完整");
    return summary;
  } catch (err) {
    throw new Error(
      `模型未返回合法的结构化摘要: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
