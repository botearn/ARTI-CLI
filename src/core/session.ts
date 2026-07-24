/**
 * Session 状态 — 持久化 REPL 最近命令到 ~/.config/arti/session.json
 * （watchlist / recentSymbols 能力已随 v1 收敛移除，仅保留 lastCommand）
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG_DIR = join(homedir(), ".config", "arti");
const SESSION_FILE = join(CONFIG_DIR, "session.json");

export interface SessionData {
  lastCommand: string | null;
  lastUpdated: string;
}

const DEFAULT_SESSION: SessionData = {
  lastCommand: null,
  lastUpdated: new Date().toISOString(),
};

let _session: SessionData | null = null;

function loadSession(): SessionData {
  if (_session) return _session;
  if (!existsSync(SESSION_FILE)) {
    _session = { ...DEFAULT_SESSION };
    return _session;
  }
  try {
    const raw = JSON.parse(readFileSync(SESSION_FILE, "utf-8"));
    _session = {
      lastCommand: raw.lastCommand ?? null,
      lastUpdated: raw.lastUpdated ?? new Date().toISOString(),
    };
    return _session;
  } catch {
    _session = { ...DEFAULT_SESSION };
    return _session;
  }
}

function saveSession(): void {
  const session = loadSession();
  session.lastUpdated = new Date().toISOString();
  try {
    if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
    // 原子写（临时文件 + rename），避免写入中断/并发损坏文件
    const tmp = `${SESSION_FILE}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(session, null, 2) + "\n", "utf-8");
    renameSync(tmp, SESSION_FILE);
  } catch {
    // 静默失败
  }
}

/** 记录最后执行的命令（REPL 用） */
export function trackCommand(cmd: string): void {
  const session = loadSession();
  session.lastCommand = cmd;
  saveSession();
}
