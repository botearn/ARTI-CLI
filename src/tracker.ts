/**
 * 活动追踪 — 记录用户投研行为到 ~/.config/arti/activity.json
 * 静默运行，不影响主流程
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG_DIR = join(homedir(), ".config", "arti");
const ACTIVITY_FILE = join(CONFIG_DIR, "activity.json");
const MAX_RECORDS = 1000;

export interface ActivityRecord {
  timestamp: string;
  command: string;
  symbols: string[];
}

function ensureDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

export function loadActivity(): ActivityRecord[] {
  if (!existsSync(ACTIVITY_FILE)) return [];
  try {
    return JSON.parse(readFileSync(ACTIVITY_FILE, "utf-8"));
  } catch {
    return [];
  }
}

/** 记录一次用户操作，静默失败不影响主流程 */
export function track(command: string, symbols: string[]): void {
  try {
    ensureDir();
    const records = loadActivity();
    records.push({
      timestamp: new Date().toISOString(),
      command,
      symbols: symbols.map(s => s.toUpperCase()),
    });
    // L12：裁剪到上限，避免文件无限增长；原子写避免损坏
    const trimmed = records.length > MAX_RECORDS ? records.slice(-MAX_RECORDS) : records;
    const tmp = `${ACTIVITY_FILE}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(trimmed, null, 2) + "\n", "utf-8");
    renameSync(tmp, ACTIVITY_FILE);
  } catch {
    // 静默失败
  }
}

export function getActivityPath(): string {
  return ACTIVITY_FILE;
}
