import type { ChatMessage } from "../commands/chat.js";
import type {
  ChatUsageEvent,
  ConversationContext,
  SessionIndexEntry,
} from "./conversation-types.js";
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
    this.activeHistory = [...snapshot.messages];
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
    const entry = this.ensureSession();
    return {
      sessionId: entry.id,
      activeSymbols: [...entry.activeSymbols],
      artifacts: [],
    };
  }

  trackSymbol(symbol: string): void {
    const session = this.ensureSession();
    this.store.addActiveSymbol(session.id, symbol);
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
