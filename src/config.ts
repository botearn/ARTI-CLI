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
    baseUrl: "https://laoclhqedllwjuboyqib.supabase.co/functions/v1",
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
  let config: ArtiConfig;
  if (!existsSync(CONFIG_FILE)) {
    config = { ...DEFAULT_CONFIG };
  } else {
    try {
      const raw = readFileSync(CONFIG_FILE, "utf-8");
      const saved = JSON.parse(raw);
      config = {
        api: { ...DEFAULT_CONFIG.api, ...saved.api },
        display: { ...DEFAULT_CONFIG.display, ...saved.display },
        watchlist: saved.watchlist ?? DEFAULT_CONFIG.watchlist,
      };
    } catch {
      config = { ...DEFAULT_CONFIG };
    }
  }

  // 环境变量覆盖（优先级高于配置文件）
  if (process.env.ARTI_API_URL) config.api.baseUrl = process.env.ARTI_API_URL;
  if (process.env.ARTI_TIMEOUT) {
    const t = Number(process.env.ARTI_TIMEOUT);
    if (!isNaN(t) && t > 0) config.api.timeout = t;
  }

  return config;
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

const ALLOWED_CONFIG_KEYS = new Set([
  "api.baseUrl", "api.timeout",
  "display.market", "display.lang",
  "watchlist",
]);

const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/** 通过点号路径设置配置值，如 "api.timeout" "60000" */
export function setConfigValue(key: string, value: string): void {
  if (!ALLOWED_CONFIG_KEYS.has(key)) {
    throw new Error(`不支持的配置项: ${key}，可用: ${[...ALLOWED_CONFIG_KEYS].join(", ")}`);
  }
  const parts = key.split(".");
  if (parts.some(p => DANGEROUS_KEYS.has(p))) {
    throw new Error("非法配置键");
  }

  const config = loadConfig();
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
