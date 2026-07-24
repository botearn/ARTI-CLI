import {
  appendFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { ChatMessage } from "../commands/chat.js";
import {
  addTokenUsage,
  emptyTokenUsage,
  type ChatUsageEvent,
  type ConversationSessionEvent,
  type SessionIndexEntry,
} from "./conversation-types.js";

interface SessionIndexFile {
  version: 1;
  sessions: SessionIndexEntry[];
}

interface ConversationSessionStoreOptions {
  now?: () => Date;
  onWarning?: (message: string) => void;
}

export interface ConversationSessionSnapshot {
  entry: SessionIndexEntry;
  events: ConversationSessionEvent[];
  messages: ChatMessage[];
  lastUsage?: ChatUsageEvent;
}

export interface SessionCleanupResult {
  removedSessionIds: string[];
}

const DEFAULT_SESSION_TITLE = "新会话";
const SESSION_ID_PATTERN = /^session_[a-z0-9-]+$/;

function cloneEntry(entry: SessionIndexEntry): SessionIndexEntry {
  return {
    ...entry,
    activeSymbols: [...entry.activeSymbols],
    totalUsage: { ...entry.totalUsage },
  };
}

function normalizeTitle(title?: string): string {
  const normalized = title?.trim().replace(/\s+/g, " ").slice(0, 80);
  return normalized || DEFAULT_SESSION_TITLE;
}

export function sanitizeConversationContent(content: string): string {
  return content
    .replace(
      /(Authorization\s*:\s*Bearer\s+)([a-z0-9._-]+)/gi,
      "$1[REDACTED]",
    )
    .replace(
      /(--(?:token|refresh-token|password)(?:\s+|=))(?:"[^"]*"|'[^']*'|\S+)/gi,
      "$1[REDACTED]",
    )
    .replace(
      /(ARTI_AUTH_(?:REFRESH_)?TOKEN\s*=\s*)(?:"[^"]*"|'[^']*'|\S+)/gi,
      "$1[REDACTED]",
    )
    .replace(/\beyJ[a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+\b/gi, "[REDACTED]");
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isTokenUsage(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const usage = value as Record<string, unknown>;
  return isNonNegativeNumber(usage.inputTokens)
    && isNonNegativeNumber(usage.outputTokens)
    && isNonNegativeNumber(usage.totalTokens);
}

function isSessionEvent(value: unknown): value is ConversationSessionEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const event = value as Record<string, unknown>;
  if (event.type === "message") {
    return (event.role === "user" || event.role === "assistant")
      && typeof event.content === "string"
      && typeof event.at === "string";
  }
  if (event.type === "usage") {
    return typeof event.requestId === "string"
      && (event.model === undefined || typeof event.model === "string")
      && isTokenUsage(event.usage)
      && typeof event.at === "string";
  }
  return false;
}

export class ConversationSessionStore {
  private readonly indexPath: string;
  private readonly now: () => Date;
  private readonly onWarning: (message: string) => void;

  constructor(
    private readonly sessionsDir = join(homedir(), ".config", "arti", "sessions"),
    options: ConversationSessionStoreOptions = {},
  ) {
    this.indexPath = join(sessionsDir, "index.json");
    this.now = options.now ?? (() => new Date());
    this.onWarning = options.onWarning ?? (() => undefined);
  }

  initialize(retentionDays: number): SessionCleanupResult {
    this.ensureSessionsDir();
    if (!existsSync(this.indexPath)) {
      this.saveIndex({ version: 1, sessions: [] });
    } else {
      this.tightenFilePermissions(this.indexPath);
    }
    return this.cleanupExpired(retentionDays);
  }

  createSession(title?: string): SessionIndexEntry {
    this.ensureSessionsDir();
    const index = this.loadIndex();
    let id = "";
    do {
      id = `session_${randomUUID().slice(0, 12)}`;
    } while (index.sessions.some(session => session.id === id));

    const timestamp = this.now().toISOString();
    const entry: SessionIndexEntry = {
      id,
      title: normalizeTitle(title),
      createdAt: timestamp,
      updatedAt: timestamp,
      activeSymbols: [],
      totalUsage: emptyTokenUsage(),
    };

    writeFileSync(this.transcriptPath(id), "", { encoding: "utf-8", mode: 0o600, flag: "wx" });
    this.tightenFilePermissions(this.transcriptPath(id));
    index.sessions.push(entry);
    this.saveIndex(index);
    return cloneEntry(entry);
  }

  listSessions(): SessionIndexEntry[] {
    return this.loadIndex().sessions
      .map(cloneEntry)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  resolveSession(reference: string): SessionIndexEntry {
    const trimmed = reference.trim().toLowerCase();
    if (!trimmed) throw new Error("请输入 Session ID 或前缀");

    const sessions = this.listSessions();
    const exact = sessions.find(session => session.id.toLowerCase() === trimmed);
    if (exact) return exact;

    const normalized = trimmed.startsWith("session_") ? trimmed : `session_${trimmed}`;
    const matches = sessions.filter(session => session.id.toLowerCase().startsWith(normalized));
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) throw new Error(`Session 前缀匹配到 ${matches.length} 个会话，请输入更多字符`);
    throw new Error(`找不到 Session: ${reference}`);
  }

  appendMessage(
    sessionId: string,
    role: "user" | "assistant",
    content: string,
  ): string {
    const sanitizedContent = sanitizeConversationContent(content);
    const event: ConversationSessionEvent = {
      type: "message",
      role,
      content: sanitizedContent,
      at: this.now().toISOString(),
    };
    this.appendEvent(sessionId, event, (entry) => {
      if (role === "user" && entry.title === DEFAULT_SESSION_TITLE) {
        entry.title = normalizeTitle(sanitizedContent);
      }
    });
    return sanitizedContent;
  }

  appendUsage(sessionId: string, usageEvent: ChatUsageEvent): void {
    const {
      requestId,
      model,
      inputTokens,
      outputTokens,
      cachedInputTokens,
      reasoningTokens,
      totalTokens,
      contextWindow,
    } = usageEvent;
    const usage = {
      inputTokens,
      outputTokens,
      ...(cachedInputTokens !== undefined ? { cachedInputTokens } : {}),
      ...(reasoningTokens !== undefined ? { reasoningTokens } : {}),
      totalTokens,
      ...(contextWindow !== undefined ? { contextWindow } : {}),
    };
    const event: ConversationSessionEvent = {
      type: "usage",
      requestId,
      ...(model ? { model } : {}),
      usage,
      at: this.now().toISOString(),
    };
    this.appendEvent(sessionId, event, (entry) => {
      entry.totalUsage = addTokenUsage(entry.totalUsage, usage);
      if (model) entry.lastModel = model;
    });
  }

  addActiveSymbol(sessionId: string, symbol: string): void {
    const normalized = symbol.trim().toUpperCase();
    if (!normalized) return;
    this.updateEntry(sessionId, (entry) => {
      entry.activeSymbols = [
        normalized,
        ...entry.activeSymbols.filter(existing => existing !== normalized),
      ].slice(0, 20);
    });
  }

  readSession(sessionId: string): ConversationSessionSnapshot {
    const entry = this.getEntry(sessionId);
    const events = this.readEvents(sessionId);
    const messages = events
      .filter((event): event is Extract<ConversationSessionEvent, { type: "message" }> =>
        event.type === "message"
      )
      .map(event => ({ role: event.role, content: event.content }));
    const lastUsageEvent = [...events]
      .reverse()
      .find((event): event is Extract<ConversationSessionEvent, { type: "usage" }> =>
        event.type === "usage"
      );
    const lastUsage = lastUsageEvent
      ? {
          requestId: lastUsageEvent.requestId,
          ...(lastUsageEvent.model ? { model: lastUsageEvent.model } : {}),
          ...lastUsageEvent.usage,
        }
      : undefined;

    return {
      entry,
      events,
      messages,
      ...(lastUsage ? { lastUsage } : {}),
    };
  }

  cleanupExpired(retentionDays: number): SessionCleanupResult {
    if (!Number.isInteger(retentionDays) || retentionDays <= 0) {
      throw new Error("Session 保留天数必须是正整数");
    }

    const index = this.loadIndex();
    const cutoff = this.now().getTime() - retentionDays * 24 * 60 * 60 * 1000;
    const expired = index.sessions.filter(session => {
      const updatedAt = Date.parse(session.updatedAt);
      return Number.isFinite(updatedAt) && updatedAt < cutoff;
    });

    for (const session of expired) {
      const path = this.transcriptPath(session.id);
      if (existsSync(path)) unlinkSync(path);
    }

    if (expired.length) {
      const expiredIds = new Set(expired.map(session => session.id));
      index.sessions = index.sessions.filter(session => !expiredIds.has(session.id));
      this.saveIndex(index);
    }

    return { removedSessionIds: expired.map(session => session.id) };
  }

  private appendEvent(
    sessionId: string,
    event: ConversationSessionEvent,
    update: (entry: SessionIndexEntry) => void,
  ): void {
    const path = this.transcriptPath(sessionId);
    const index = this.loadIndex();
    const entry = index.sessions.find(session => session.id === sessionId);
    if (!entry) throw new Error(`找不到 Session: ${sessionId}`);
    if (!existsSync(path)) throw new Error(`Session transcript 不存在: ${sessionId}`);

    appendFileSync(path, `${JSON.stringify(event)}\n`, { encoding: "utf-8", mode: 0o600 });
    this.tightenFilePermissions(path);
    update(entry);
    entry.updatedAt = event.at;
    this.saveIndex(index);
  }

  private updateEntry(sessionId: string, update: (entry: SessionIndexEntry) => void): void {
    const index = this.loadIndex();
    const entry = index.sessions.find(session => session.id === sessionId);
    if (!entry) throw new Error(`找不到 Session: ${sessionId}`);
    update(entry);
    entry.updatedAt = this.now().toISOString();
    this.saveIndex(index);
  }

  private readEvents(sessionId: string): ConversationSessionEvent[] {
    const path = this.transcriptPath(sessionId);
    if (!existsSync(path)) throw new Error(`Session transcript 不存在: ${sessionId}`);

    const events: ConversationSessionEvent[] = [];
    const lines = readFileSync(path, "utf-8").split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index].trim();
      if (!line) continue;
      try {
        const event = JSON.parse(line);
        if (!isSessionEvent(event)) throw new Error("事件格式无效");
        events.push(event);
      } catch {
        this.onWarning(`Session ${sessionId} 第 ${index + 1} 行损坏，已跳过`);
      }
    }
    return events;
  }

  private getEntry(sessionId: string): SessionIndexEntry {
    const entry = this.loadIndex().sessions.find(session => session.id === sessionId);
    if (!entry) throw new Error(`找不到 Session: ${sessionId}`);
    return cloneEntry(entry);
  }

  private transcriptPath(sessionId: string): string {
    if (!SESSION_ID_PATTERN.test(sessionId)) {
      throw new Error(`非法 Session ID: ${sessionId}`);
    }
    return join(this.sessionsDir, `${sessionId}.jsonl`);
  }

  private ensureSessionsDir(): void {
    if (!existsSync(this.sessionsDir)) {
      mkdirSync(this.sessionsDir, { recursive: true, mode: 0o700 });
    }
    try { chmodSync(this.sessionsDir, 0o700); } catch { /* 部分平台不支持 chmod */ }
  }

  private tightenFilePermissions(path: string): void {
    try { chmodSync(path, 0o600); } catch { /* 文件不存在或平台不支持 chmod */ }
  }

  private loadIndex(): SessionIndexFile {
    this.ensureSessionsDir();
    if (!existsSync(this.indexPath)) return { version: 1, sessions: [] };

    try {
      const parsed = JSON.parse(readFileSync(this.indexPath, "utf-8")) as Partial<SessionIndexFile>;
      if (parsed.version !== 1 || !Array.isArray(parsed.sessions)) {
        throw new Error("索引格式无效");
      }
      return {
        version: 1,
        sessions: parsed.sessions.map(entry => ({
          ...entry,
          activeSymbols: Array.isArray(entry.activeSymbols) ? [...entry.activeSymbols] : [],
          totalUsage: isTokenUsage(entry.totalUsage) ? { ...entry.totalUsage } : emptyTokenUsage(),
        })),
      };
    } catch {
      this.onWarning("Session 索引损坏，已使用空索引");
      return { version: 1, sessions: [] };
    }
  }

  private saveIndex(index: SessionIndexFile): void {
    this.ensureSessionsDir();
    const tempPath = `${this.indexPath}.${process.pid}.${randomUUID()}.tmp`;
    writeFileSync(tempPath, `${JSON.stringify(index, null, 2)}\n`, {
      encoding: "utf-8",
      mode: 0o600,
    });
    this.tightenFilePermissions(tempPath);
    renameSync(tempPath, this.indexPath);
    this.tightenFilePermissions(this.indexPath);
  }
}
