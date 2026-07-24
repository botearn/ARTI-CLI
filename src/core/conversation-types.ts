export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
  reasoningTokens?: number;
  totalTokens: number;
  contextWindow?: number;
}

export interface ChatUsageEvent extends TokenUsage {
  requestId: string;
  model?: string;
}

export interface ConversationContext {
  sessionId: string;
  activeSymbols: string[];
  artifacts: Array<{
    id: string;
    type: string;
    digest: string;
  }>;
}

export interface ChatClientCapabilities {
  usageEvents?: boolean;
  toolCalling?: boolean;
}

export interface SessionIndexEntry {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  lastModel?: string;
  activeSymbols: string[];
  totalUsage: TokenUsage;
}

export type ConversationSessionEvent =
  | {
      type: "message";
      role: "user" | "assistant";
      content: string;
      at: string;
    }
  | {
      type: "usage";
      requestId: string;
      model?: string;
      usage: TokenUsage;
      at: string;
    };

export function emptyTokenUsage(): TokenUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
  };
}

export function addTokenUsage(current: TokenUsage, next: TokenUsage): TokenUsage {
  const cachedInputTokens = (current.cachedInputTokens ?? 0) + (next.cachedInputTokens ?? 0);
  const reasoningTokens = (current.reasoningTokens ?? 0) + (next.reasoningTokens ?? 0);

  return {
    inputTokens: current.inputTokens + next.inputTokens,
    outputTokens: current.outputTokens + next.outputTokens,
    ...(current.cachedInputTokens !== undefined || next.cachedInputTokens !== undefined
      ? { cachedInputTokens }
      : {}),
    ...(current.reasoningTokens !== undefined || next.reasoningTokens !== undefined
      ? { reasoningTokens }
      : {}),
    totalTokens: current.totalTokens + next.totalTokens,
    ...(next.contextWindow !== undefined
      ? { contextWindow: next.contextWindow }
      : current.contextWindow !== undefined
        ? { contextWindow: current.contextWindow }
        : {}),
  };
}
