import type {
  ChatUsageEvent,
  ConversationContext,
} from "./conversation-types.js";

interface ResearchGuideInput {
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  conversation?: ConversationContext;
}

export interface ChatLoadingContext {
  historyMessages: number;
  hasSummary: boolean;
  artifactCount: number;
  activeSymbols: string[];
  canCancel: boolean;
}

const CONTEXT_REVEAL_MS = 2_000;
const PRINCIPLE_REVEAL_MS = 8_000;
const PRINCIPLE_ROTATION_MS = 6_000;
const CANCEL_HINT_MS = 20_000;

const INVESTMENT_PRINCIPLES = [
  "先定义风险，再讨论收益。",
  "事实、推断和行动要分开。",
  "仓位是对不确定性的回答。",
  "没有失效条件的观点，无法被验证。",
  "价格在变化，结论也应该允许更新。",
  "真正的优势不是每次正确，而是错误时损失可控。",
  "分歧不是噪声，而是需要解释的信息。",
  "看不懂的时候，等待也是一种仓位。",
] as const;

function formatElapsed(elapsedMs: number): string {
  return `${(Math.max(0, elapsedMs) / 1000).toFixed(1)}s`;
}

function formatLoadingContext(context: ChatLoadingContext): string {
  const visibleSymbols = context.activeSymbols.slice(0, 3);
  const symbolSummary = visibleSymbols.length
    ? `${visibleSymbols.join("、")}${context.activeSymbols.length > visibleSymbols.length
      ? ` 等 ${context.activeSymbols.length} 个`
      : ""}`
    : "";
  const parts = [
    "当前问题",
    `历史 ${context.historyMessages}`,
    ...(context.hasSummary ? ["摘要 1"] : []),
    ...(context.artifactCount ? [`Artifact ${context.artifactCount} 个`] : []),
    ...(symbolSummary ? [`标的 ${symbolSummary}`] : []),
  ];
  return `发送：${parts.join(" · ")}`;
}

function investmentPrincipleAt(elapsedMs: number): string {
  const index = Math.floor(
    Math.max(0, elapsedMs - PRINCIPLE_REVEAL_MS) / PRINCIPLE_ROTATION_MS,
  ) % INVESTMENT_PRINCIPLES.length;
  return INVESTMENT_PRINCIPLES[index];
}

export function buildChatLoadingLines(
  elapsedMs: number,
  context: ChatLoadingContext,
): string[] {
  if (elapsedMs < CONTEXT_REVEAL_MS) {
    return [`普通对话 · 正在准备会话请求… ${formatElapsed(elapsedMs)}`];
  }

  const status = `普通对话 · 请求已发送，等待首段回答… ${formatElapsed(elapsedMs)}`;
  const lines = [
    elapsedMs >= CANCEL_HINT_MS && context.canCancel
      ? `${status} · Ctrl+C 可取消当前回答`
      : status,
    "本轮路径：普通对话 · general",
    formatLoadingContext(context),
  ];

  if (elapsedMs >= PRINCIPLE_REVEAL_MS) {
    lines.push(`投资原则：${investmentPrincipleAt(elapsedMs)}`);
  }
  return lines;
}

export function buildChatLoadingText(
  elapsedMs: number,
  context: ChatLoadingContext,
): string {
  return buildChatLoadingLines(elapsedMs, context).join("\n  ");
}

export function buildChatFailureText(elapsedMs: number): string {
  return `普通对话未完成 · ${formatElapsed(elapsedMs)}`;
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
    "  /full <代码>   Agent Harness 多角色交叉验证",
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
