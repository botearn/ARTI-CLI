/**
 * Session 状态管理 — 持久化 watchlist、最近查询等状态
 * 参考 CLI-Anything 的 session.py 设计
 * 文件位于 ~/.config/arti/session.json
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG_DIR = join(homedir(), ".config", "arti");
const SESSION_FILE = join(CONFIG_DIR, "session.json");

export interface SessionData {
  watchlist: string[];
  recentSymbols: string[];
  lastCommand: string | null;
  lastUpdated: string;
}

const DEFAULT_SESSION: SessionData = {
  watchlist: [],
  recentSymbols: [],
  lastCommand: null,
  lastUpdated: new Date().toISOString(),
};

const MAX_RECENT = 20;

let _session: SessionData | null = null;

function ensureDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

/** 加载 session，带内存缓存 */
export function loadSession(): SessionData {
  if (_session) return _session;
  if (!existsSync(SESSION_FILE)) {
    _session = { ...DEFAULT_SESSION };
    return _session;
  }
  try {
    const raw = JSON.parse(readFileSync(SESSION_FILE, "utf-8"));
    _session = {
      watchlist: Array.isArray(raw.watchlist) ? raw.watchlist : [],
      recentSymbols: Array.isArray(raw.recentSymbols) ? raw.recentSymbols : [],
      lastCommand: raw.lastCommand ?? null,
      lastUpdated: raw.lastUpdated ?? new Date().toISOString(),
    };
    return _session;
  } catch {
    _session = { ...DEFAULT_SESSION };
    return _session;
  }
}

/** 持久化 session 到磁盘 */
export function saveSession(): void {
  const session = loadSession();
  session.lastUpdated = new Date().toISOString();
  try {
    ensureDir();
    writeFileSync(SESSION_FILE, JSON.stringify(session, null, 2) + "\n", "utf-8");
  } catch {
    // 静默失败
  }
}

/** 添加 symbol 到 watchlist */
export function watchlistAdd(...symbols: string[]): string[] {
  const session = loadSession();
  const added: string[] = [];
  for (const raw of symbols) {
    const sym = raw.toUpperCase().trim();
    if (sym && !session.watchlist.includes(sym)) {
      session.watchlist.push(sym);
      added.push(sym);
    }
  }
  if (added.length) saveSession();
  return added;
}

/** 从 watchlist 移除 symbol */
export function watchlistRemove(...symbols: string[]): string[] {
  const session = loadSession();
  const removed: string[] = [];
  for (const raw of symbols) {
    const sym = raw.toUpperCase().trim();
    const idx = session.watchlist.indexOf(sym);
    if (idx !== -1) {
      session.watchlist.splice(idx, 1);
      removed.push(sym);
    }
  }
  if (removed.length) saveSession();
  return removed;
}

/** 获取 watchlist */
export function getWatchlist(): string[] {
  return loadSession().watchlist;
}

/** 记录最近使用的 symbol */
export function trackRecent(symbol: string): void {
  const session = loadSession();
  const sym = symbol.toUpperCase();
  // 移到最前
  session.recentSymbols = [sym, ...session.recentSymbols.filter(s => s !== sym)].slice(0, MAX_RECENT);
  saveSession();
}

/** 获取最近查询的 symbols */
export function getRecent(): string[] {
  return loadSession().recentSymbols;
}

/** 记录最后执行的命令（REPL 用） */
export function trackCommand(cmd: string): void {
  const session = loadSession();
  session.lastCommand = cmd;
  saveSession();
}
