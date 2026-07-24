import type { SessionIndexEntry, TokenUsage } from "./conversation-types.js";
import type { ConversationSessionSnapshot } from "./conversation-session.js";

function formatNumber(value: number): string {
  return value.toLocaleString("en-US");
}

function formatUsage(usage: TokenUsage): string {
  const parts = [
    `输入 ${formatNumber(usage.inputTokens)}`,
    `输出 ${formatNumber(usage.outputTokens)}`,
  ];
  if (usage.cachedInputTokens !== undefined) {
    parts.push(`缓存 ${formatNumber(usage.cachedInputTokens)}`);
  }
  if (usage.reasoningTokens !== undefined) {
    parts.push(`推理 ${formatNumber(usage.reasoningTokens)}`);
  }
  parts.push(`总计 ${formatNumber(usage.totalTokens)}`);
  return parts.join(" · ");
}

export function formatSessionStatus(snapshot: ConversationSessionSnapshot): string[] {
  const { entry, lastUsage } = snapshot;
  const context = lastUsage?.contextWindow
    ? `${formatNumber(lastUsage.inputTokens)} / ${formatNumber(lastUsage.contextWindow)} tokens (${(
        lastUsage.inputTokens / lastUsage.contextWindow * 100
      ).toFixed(1)}%)`
    : snapshot.messages.length
      ? "服务端尚未返回 Token usage"
      : "尚无（完成一次对话后由服务端返回）";

  return [
    `Session: ${entry.id}`,
    `标题: ${entry.title}`,
    `模型: ${entry.lastModel ?? "未知"}`,
    `上下文: ${context}`,
    `活动标的: ${entry.activeSymbols.length ? entry.activeSymbols.join("、") : "无"}`,
    `Artifacts: ${snapshot.artifacts.length}`,
  ];
}

export function formatSessionUsage(snapshot: ConversationSessionSnapshot): string[] {
  const title = "Token usage（不等于 Credits）:";
  if (!snapshot.lastUsage) {
    return [
      title,
      snapshot.messages.length
        ? "服务端尚未返回 Token usage"
        : "尚无记录；完成一次对话后再查看",
    ];
  }
  return [
    title,
    `最近一轮: ${formatUsage(snapshot.lastUsage)}`,
    `会话累计: ${formatUsage(snapshot.entry.totalUsage)}`,
  ];
}

export function formatSessionList(
  sessions: SessionIndexEntry[],
  activeSessionId: string | null,
): string[] {
  if (!sessions.length) return ["暂无可恢复会话"];

  return [
    "最近会话:",
    ...sessions.slice(0, 10).map(session => {
      const marker = session.id === activeSessionId ? "*" : " ";
      const updatedAt = session.updatedAt.slice(0, 16).replace("T", " ");
      return `${marker} ${session.id} · ${updatedAt} · ${session.title}`;
    }),
    "使用 /resume <Session ID 或前缀> 恢复",
  ];
}
