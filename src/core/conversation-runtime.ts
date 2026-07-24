import type { ChatMessage } from "../commands/chat.js";
import type {
  ChatUsageEvent,
  ConversationArtifact,
  ConversationArtifactDraft,
  ConversationContext,
  ConversationSummary,
  SessionIndexEntry,
} from "./conversation-types.js";
import type { ConversationCompactInput } from "./conversation-compact.js";
import {
  ConversationSessionStore,
  type ConversationSessionSnapshot,
  type SessionCleanupResult,
} from "./conversation-session.js";

interface ConversationTurnOptions {
  history: ChatMessage[];
  conversation: ConversationContext;
  onUsage: (usage: ChatUsageEvent) => void;
}

type ConversationTurnRunner = (
  text: string,
  options: ConversationTurnOptions,
) => Promise<string | undefined>;

type ConversationCompactRunner = (
  input: ConversationCompactInput,
  options: { onUsage: (usage: ChatUsageEvent) => void },
) => Promise<ConversationSummary>;

export class ConversationRuntime {
  private activeId: string | null = null;
  private activeHistory: ChatMessage[] = [];

  constructor(private readonly store: ConversationSessionStore) {}

  get activeSessionId(): string | null {
    return this.activeId;
  }

  initialize(retentionDays: number): SessionCleanupResult {
    return this.store.initialize(retentionDays);
  }

  ensureSession(): SessionIndexEntry {
    if (!this.activeId) return this.newSession();
    return this.snapshot().entry;
  }

  newSession(title?: string): SessionIndexEntry {
    const session = this.store.createSession(title);
    this.activeId = session.id;
    this.activeHistory = [];
    return session;
  }

  resume(reference: string): SessionIndexEntry {
    const session = this.store.resolveSession(reference);
    const snapshot = this.store.readSession(session.id);
    this.activeId = session.id;
    this.activeHistory = [...snapshot.contextMessages];
    return snapshot.entry;
  }

  listSessions(): SessionIndexEntry[] {
    return this.store.listSessions();
  }

  history(): ChatMessage[] {
    return this.activeHistory.map(message => ({ ...message }));
  }

  snapshot(): ConversationSessionSnapshot {
    if (!this.activeId) {
      const session = this.newSession();
      return this.store.readSession(session.id);
    }
    return this.store.readSession(this.activeId);
  }

  conversationContext(): ConversationContext {
    const snapshot = this.snapshot();
    return {
      sessionId: snapshot.entry.id,
      activeSymbols: [...snapshot.entry.activeSymbols],
      artifacts: snapshot.artifacts.map(artifact => ({
        id: artifact.id,
        type: artifact.type,
        digest: artifact.digest,
      })),
      ...(snapshot.lastSummary ? { summary: snapshot.lastSummary } : {}),
    };
  }

  trackSymbol(symbol: string): void {
    const session = this.ensureSession();
    this.store.addActiveSymbol(session.id, symbol);
  }

  beginToolCall(capability: string, args: unknown): string {
    const session = this.ensureSession();
    return this.store.appendToolCall(session.id, capability, args);
  }

  completeToolCall(
    callId: string,
    draft: ConversationArtifactDraft,
  ): ConversationArtifact {
    const session = this.ensureSession();
    const artifact = this.store.createArtifact(session.id, draft);
    this.store.appendToolResult(session.id, callId, artifact.digest, artifact.id);
    if (artifact.symbol) this.store.addActiveSymbol(session.id, artifact.symbol);
    return artifact;
  }

  async compact(
    focus: string | undefined,
    runner: ConversationCompactRunner,
  ): Promise<{ compactedMessages: number; summary: ConversationSummary }> {
    const session = this.ensureSession();
    const snapshot = this.store.readSession(session.id);
    const messages = this.history();
    if (!messages.length
      && !snapshot.lastSummary
      && !snapshot.artifacts.length
      && !snapshot.entry.activeSymbols.length) {
      throw new Error("当前会话没有可压缩内容");
    }
    const summary = await runner({
      ...(focus?.trim() ? { focus: focus.trim() } : {}),
      previousSummary: snapshot.lastSummary,
      messages,
      activeSymbols: [...snapshot.entry.activeSymbols],
      artifacts: snapshot.artifacts.map(artifact => ({
        id: artifact.id,
        type: artifact.type,
        digest: artifact.digest,
      })),
    }, {
      onUsage: usage => this.store.appendUsage(session.id, usage),
    });
    const mergedSummary: ConversationSummary = {
      ...summary,
      activeSymbols: [...new Set([
        ...summary.activeSymbols,
        ...snapshot.entry.activeSymbols,
      ])],
      artifactIds: [...new Set([
        ...summary.artifactIds,
        ...snapshot.artifacts.map(artifact => artifact.id),
      ])],
    };
    const throughEvent = this.store.readSession(session.id).events.length;
    this.store.appendSummary(session.id, mergedSummary, throughEvent);
    this.activeHistory = [];
    return {
      compactedMessages: messages.length,
      summary: mergedSummary,
    };
  }

  async runTurn(
    text: string,
    runner: ConversationTurnRunner,
  ): Promise<string | undefined> {
    const session = this.ensureSession();
    const previousHistory = this.history();

    const storedUserText = this.store.appendMessage(session.id, "user", text);
    this.activeHistory.push({ role: "user", content: storedUserText });

    const assistantText = await runner(text, {
      history: previousHistory,
      conversation: this.conversationContext(),
      onUsage: usage => this.store.appendUsage(session.id, usage),
    });

    if (assistantText) {
      const storedAssistantText = this.store.appendMessage(
        session.id,
        "assistant",
        assistantText,
      );
      this.activeHistory.push({ role: "assistant", content: storedAssistantText });
    }
    return assistantText;
  }
}
