import type {
  ChatUsageEvent,
  ConversationContext,
} from "./conversation-types.js";

interface ResearchGuideInput {
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  conversation?: ConversationContext;
}

function formatElapsed(elapsedMs: number): string {
  return `${(Math.max(0, elapsedMs) / 1000).toFixed(1)}s`;
}

export function buildChatLoadingText(elapsedMs: number): string {
  if (elapsedMs >= 8_000) {
    return `普通对话 · 已等待 ${Math.floor(elapsedMs / 1000)}s，可按 Ctrl+C 取消`;
  }
  return `普通对话 · 正在生成回答… ${formatElapsed(elapsedMs)}`;
}

export function buildChatCompletionText(
  elapsedMs: number,
  usage?: ChatUsageEvent,
): string {
  const parts = [
    "✓ 普通对话完成",
    formatElapsed(elapsedMs),
    usage?.model,
    usage ? `${usage.totalTokens.toLocaleString("en-US")} tokens` : undefined,
  ].filter((part): part is string => Boolean(part));
  return parts.join(" · ");
}

export function buildResearchGuideLines(): string[] {
  return [
    "本轮入口：普通对话；CLI 只收到回答正文，无法验证内部多角色过程",
    "需要可见、可追踪的研究过程：",
    "  /quick <代码>  行情、技术面和基本面快速扫描",
    "  /full <代码>   8 个 AI 分析角色交叉验证",
    "  /deep <代码>   AI 分析角色 → 大师投资框架辩论 → 综合裁定",
    "说明：分析师和大师均为 AI 角色；大师是投资框架模拟，并非真人意见。",
  ];
}

export function shouldShowResearchGuide(input: ResearchGuideInput): boolean {
  if (!input.conversation) return false;
  if (input.history?.some(message => message.role === "assistant")) return false;
  if (input.conversation.summary) return false;
  return input.conversation.artifacts.length === 0;
}
