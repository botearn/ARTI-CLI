import {
  appendFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConversationSessionStore } from "../src/core/conversation-session.js";

describe("ConversationSessionStore", () => {
  let testDir: string | null = null;

  afterEach(() => {
    if (testDir && existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    testDir = null;
  });

  function createStore(options?: {
    now?: () => Date;
    onWarning?: (message: string) => void;
  }): ConversationSessionStore {
    testDir = mkdtempSync(join(tmpdir(), "arti-conversation-"));
    return new ConversationSessionStore(testDir, options);
  }

  function mode(path: string): number {
    return statSync(path).mode & 0o777;
  }

  it("以 0700/0600 创建索引和 append-only transcript", () => {
    const store = createStore();
    store.initialize(30);
    const session = store.createSession();

    store.appendMessage(session.id, "user", "分析 NVDA");
    store.appendMessage(session.id, "assistant", "先看基本面");

    const snapshot = store.readSession(session.id);
    expect(snapshot.entry.title).toBe("分析 NVDA");
    expect(snapshot.messages).toEqual([
      { role: "user", content: "分析 NVDA" },
      { role: "assistant", content: "先看基本面" },
    ]);
    expect(mode(testDir as string)).toBe(0o700);
    expect(mode(join(testDir as string, "index.json"))).toBe(0o600);
    expect(mode(join(testDir as string, `${session.id}.jsonl`))).toBe(0o600);
  });

  it("累加服务端 usage，并保留最近模型和上下文窗口", () => {
    const store = createStore();
    store.initialize(30);
    const session = store.createSession("NVDA 跟踪");

    store.appendUsage(session.id, {
      requestId: "req-1",
      model: "claude-sonnet",
      inputTokens: 1_200,
      outputTokens: 320,
      cachedInputTokens: 400,
      reasoningTokens: 20,
      totalTokens: 1_520,
      contextWindow: 128_000,
    });
    store.appendUsage(session.id, {
      requestId: "req-2",
      model: "claude-sonnet",
      inputTokens: 1_800,
      outputTokens: 500,
      cachedInputTokens: 600,
      totalTokens: 2_300,
      contextWindow: 128_000,
    });

    const snapshot = store.readSession(session.id);
    expect(snapshot.entry.lastModel).toBe("claude-sonnet");
    expect(snapshot.entry.totalUsage).toEqual({
      inputTokens: 3_000,
      outputTokens: 820,
      cachedInputTokens: 1_000,
      reasoningTokens: 20,
      totalTokens: 3_820,
      contextWindow: 128_000,
    });
    expect(snapshot.lastUsage?.requestId).toBe("req-2");
  });

  it("重启后可用唯一 ID 前缀恢复，损坏单行被跳过并告警", () => {
    const warning = vi.fn();
    const store = createStore({ onWarning: warning });
    store.initialize(30);
    const session = store.createSession("恢复测试");
    store.appendMessage(session.id, "user", "上一轮问题");
    appendFileSync(join(testDir as string, `${session.id}.jsonl`), "{broken-json\n");
    store.appendMessage(session.id, "assistant", "上一轮回答");

    const restarted = new ConversationSessionStore(testDir as string, { onWarning: warning });
    restarted.initialize(30);
    const resolved = restarted.resolveSession(session.id.slice(0, 12));
    const snapshot = restarted.readSession(resolved.id);

    expect(snapshot.messages).toHaveLength(2);
    expect(warning).toHaveBeenCalledWith(expect.stringContaining("损坏"));
  });

  it("默认保留策略可删除超过 30 天的会话但保留新会话", () => {
    let now = new Date("2026-01-01T00:00:00.000Z");
    const store = createStore({ now: () => now });
    store.initialize(30);
    const expired = store.createSession("旧会话");

    now = new Date("2026-02-15T00:00:00.000Z");
    const active = store.createSession("新会话");
    const result = store.cleanupExpired(30);

    expect(result.removedSessionIds).toEqual([expired.id]);
    expect(store.listSessions().map(session => session.id)).toEqual([active.id]);
    expect(existsSync(join(testDir as string, `${expired.id}.jsonl`))).toBe(false);
  });

  it("无参数场景可按更新时间列出会话", () => {
    let now = new Date("2026-01-01T00:00:00.000Z");
    const store = createStore({ now: () => now });
    store.initialize(30);
    const first = store.createSession("第一");
    now = new Date("2026-01-02T00:00:00.000Z");
    const second = store.createSession("第二");

    expect(store.listSessions().map(session => session.id)).toEqual([second.id, first.id]);
  });

  it("认证 token、密码和 Authorization header 不写入 transcript", () => {
    const store = createStore();
    store.initialize(30);
    const session = store.createSession();
    const secret = "eyJhbGciOiJIUzI1NiJ9.payload.signature";

    store.appendMessage(
      session.id,
      "user",
      `login --token ${secret} --password super-secret Authorization: Bearer ${secret}`,
    );

    const rawTranscript = readFileSync(
      join(testDir as string, `${session.id}.jsonl`),
      "utf-8",
    );
    expect(rawTranscript).not.toContain(secret);
    expect(rawTranscript).not.toContain("super-secret");
    expect(store.readSession(session.id).messages[0].content).toContain("[REDACTED]");
  });
});
