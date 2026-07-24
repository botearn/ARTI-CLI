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

export interface ConversationSummary {
  goal?: string;
  activeSymbols: string[];
  facts: Array<{
    text: string;
    asOf?: string;
    source?: string;
  }>;
  conclusions: string[];
  risks: string[];
  assumptions: string[];
  unresolvedQuestions: string[];
  artifactIds: string[];
}

export type ConversationArtifactType =
  | "quick_scan"
  | "full_report"
  | "deep_report"
  | "poly_result";

export interface ConversationArtifact {
  id: string;
  sessionId: string;
  type: ConversationArtifactType;
  symbol?: string;
  createdAt: string;
  dataAsOf?: string;
  digest: string;
  payload: unknown;
}

export interface ConversationArtifactDraft {
  type: ConversationArtifactType;
  symbol?: string;
  dataAsOf?: string;
  digest: string;
  payload: unknown;
}

export interface CapabilityExecutionResult {
  json: unknown;
  artifact?: ConversationArtifactDraft;
}

export interface ConversationArtifactReference {
  id: string;
  type: string;
  digest: string;
}

export interface ConversationContext {
  sessionId: string;
  activeSymbols: string[];
  artifacts: ConversationArtifactReference[];
  summary?: ConversationSummary;
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
      type: "tool_call";
      callId: string;
      capability: string;
      args: unknown;
      at: string;
    }
  | {
      type: "tool_result";
      callId: string;
      digest: string;
      artifactId?: string;
      at: string;
    }
  | {
      type: "usage";
      requestId: string;
      model?: string;
      usage: TokenUsage;
      at: string;
    }
  | {
      type: "summary";
      summary: ConversationSummary;
      throughEvent: number;
      at: string;
    };

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === "string");
}

export function isConversationSummary(value: unknown): value is ConversationSummary {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const summary = value as Record<string, unknown>;
  if (summary.goal !== undefined && typeof summary.goal !== "string") return false;
  if (!isStringArray(summary.activeSymbols)
    || !isStringArray(summary.conclusions)
    || !isStringArray(summary.risks)
    || !isStringArray(summary.assumptions)
    || !isStringArray(summary.unresolvedQuestions)
    || !isStringArray(summary.artifactIds)
    || !Array.isArray(summary.facts)) {
    return false;
  }
  return summary.facts.every((fact) => {
    if (!fact || typeof fact !== "object" || Array.isArray(fact)) return false;
    const item = fact as Record<string, unknown>;
    return typeof item.text === "string"
      && (item.asOf === undefined || typeof item.asOf === "string")
      && (item.source === undefined || typeof item.source === "string");
  });
}

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
