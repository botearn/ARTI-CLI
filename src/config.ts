/**
 * 配置管理 — 读写 ~/.config/arti/config.json
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG_DIR = join(homedir(), ".config", "arti");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

export interface ArtiConfig {
  api: {
    baseUrl: string;
    timeout: number;
  };
  display: {
    market: "US" | "HK" | "CN";
    lang: "zh" | "en";
  };
  watchlist: string[];
}

const DEFAULT_CONFIG: ArtiConfig = {
  api: {
    baseUrl: "https://xzxcpastkeinorggtjaa.supabase.co/functions/v1",
    timeout: 30000,
  },
  display: {
    market: "US",
    lang: "zh",
  },
  watchlist: [],
};

function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

export function loadConfig(): ArtiConfig {
  if (!existsSync(CONFIG_FILE)) return { ...DEFAULT_CONFIG };
  try {
    const raw = readFileSync(CONFIG_FILE, "utf-8");
    const saved = JSON.parse(raw);
    // 深度合并，保证新增字段有默认值
    return {
      api: { ...DEFAULT_CONFIG.api, ...saved.api },
      display: { ...DEFAULT_CONFIG.display, ...saved.display },
      watchlist: saved.watchlist ?? DEFAULT_CONFIG.watchlist,
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(config: ArtiConfig): void {
  ensureConfigDir();
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

/** 通过点号路径获取配置值，如 "api.timeout" */
export function getConfigValue(key: string): unknown {
  const config = loadConfig();
  const parts = key.split(".");
  let current: unknown = config;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/** 通过点号路径设置配置值，如 "api.timeout" "60000" */
export function setConfigValue(key: string, value: string): void {
  const config = loadConfig();
  const parts = key.split(".");
  let current: Record<string, unknown> = config as unknown as Record<string, unknown>;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (typeof current[part] !== "object" || current[part] === null) {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }

  const lastKey = parts[parts.length - 1];
  // 尝试智能类型转换
  current[lastKey] = parseValue(value);
  saveConfig(config);
}

function parseValue(value: string): unknown {
  if (value === "true") return true;
  if (value === "false") return false;
  const num = Number(value);
  if (!isNaN(num) && value.trim() !== "") return num;
  // 尝试 JSON 数组
  if (value.startsWith("[")) {
    try { return JSON.parse(value); } catch { /* 当字符串处理 */ }
  }
  return value;
}

export function resetConfig(): void {
  saveConfig({ ...DEFAULT_CONFIG });
}

export function getConfigPath(): string {
  return CONFIG_FILE;
}
