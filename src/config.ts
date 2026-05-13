/**
 * 配置管理 — 读写 ~/.config/arti/config.json
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG_DIR = join(homedir(), ".config", "arti");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");
const LEGACY_API_BASE_URL = "https://laoclhqedllwjuboyqib.supabase.co/functions/v1";
const DEFAULT_API_BASE_URL = "https://wklskhbrjnyppqfmxhxa.supabase.co/functions/v1";

export interface ArtiConfig {
  api: {
    baseUrl: string;
    timeout: number;
  };
  backend: {
    enabled: boolean;
    url: string;
    timeout: number;
  };
  auth: {
    token: string;
    userId: string;
    email: string;
  };
  data: {
    provider: "openbb" | "arti-data" | "hybrid";
    artiDataBaseUrl: string;
    artiDataTimeout: number;
    artiDataInternalKey: string;
  };
  display: {
    market: "US" | "HK" | "CN";
    lang: "zh" | "en";
  };
  watchlist: string[];
}

const DEFAULT_CONFIG: ArtiConfig = {
  api: {
    baseUrl: DEFAULT_API_BASE_URL,
    timeout: 30000,
  },
  backend: {
    enabled: true,
    url: "",
    timeout: 60000,
  },
  auth: {
    token: "",
    userId: "",
    email: "",
  },
  data: {
    provider: "hybrid",
    artiDataBaseUrl: "",
    artiDataTimeout: 15000,
    artiDataInternalKey: "",
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
  let shouldPersistMigration = false;
  if (!existsSync(CONFIG_FILE)) {
    config = { ...DEFAULT_CONFIG };
  } else {
    try {
      const raw = readFileSync(CONFIG_FILE, "utf-8");
      const saved = JSON.parse(raw);
      config = {
        api: { ...DEFAULT_CONFIG.api, ...saved.api },
        backend: { ...DEFAULT_CONFIG.backend, ...saved.backend },
        auth: { ...DEFAULT_CONFIG.auth, ...saved.auth },
        data: { ...DEFAULT_CONFIG.data, ...saved.data },
        display: { ...DEFAULT_CONFIG.display, ...saved.display },
        watchlist: saved.watchlist ?? DEFAULT_CONFIG.watchlist,
      };

      // 将历史默认 Supabase Edge 地址迁移到当前统一项目，避免 CLI 与 backend 分属不同项目。
      if (!process.env.ARTI_API_URL && config.api.baseUrl === LEGACY_API_BASE_URL) {
        config.api.baseUrl = DEFAULT_API_BASE_URL;
        shouldPersistMigration = true;
      }
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
  if (process.env.ARTI_BACKEND_URL) config.backend.url = process.env.ARTI_BACKEND_URL;
  if (process.env.ARTI_BACKEND_ENABLED !== undefined) {
    config.backend.enabled = process.env.ARTI_BACKEND_ENABLED !== "false";
  }
  if (process.env.ARTI_BACKEND_TIMEOUT) {
    const t = Number(process.env.ARTI_BACKEND_TIMEOUT);
    if (!isNaN(t) && t > 0) config.backend.timeout = t;
  }
  if (process.env.ARTI_AUTH_TOKEN) config.auth.token = process.env.ARTI_AUTH_TOKEN;
  if (process.env.ARTI_USER_ID) config.auth.userId = process.env.ARTI_USER_ID;
  if (process.env.ARTI_USER_EMAIL) config.auth.email = process.env.ARTI_USER_EMAIL;
  if (process.env.ARTI_DATA_PROVIDER) {
    const provider = process.env.ARTI_DATA_PROVIDER;
    if (provider === "openbb" || provider === "arti-data" || provider === "hybrid") {
      config.data.provider = provider;
    }
  }
  if (process.env.ARTI_DATA_API_URL) config.data.artiDataBaseUrl = process.env.ARTI_DATA_API_URL;
  if (process.env.ARTI_DATA_INTERNAL_KEY) config.data.artiDataInternalKey = process.env.ARTI_DATA_INTERNAL_KEY;
  if (process.env.ARTI_DATA_TIMEOUT) {
    const t = Number(process.env.ARTI_DATA_TIMEOUT);
    if (!isNaN(t) && t > 0) config.data.artiDataTimeout = t;
  }

  if (shouldPersistMigration) {
    saveConfig(config);
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
  "backend.enabled", "backend.url", "backend.timeout",
  "auth.token", "auth.userId", "auth.email",
  "data.provider", "data.artiDataBaseUrl", "data.artiDataTimeout", "data.artiDataInternalKey",
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
