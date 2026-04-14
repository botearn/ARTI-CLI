/**
 * 活动追踪 — 记录用户投研行为到 ~/.config/arti/activity.json
 * 静默运行，不影响主流程
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG_DIR = join(homedir(), ".config", "arti");
const ACTIVITY_FILE = join(CONFIG_DIR, "activity.json");

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
    writeFileSync(ACTIVITY_FILE, JSON.stringify(records, null, 2) + "\n", "utf-8");
  } catch {
    // 静默失败
  }
}

export function getActivityPath(): string {
  return ACTIVITY_FILE;
}
