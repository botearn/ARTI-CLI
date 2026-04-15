/**
 * OpenBB 桥接层
 * 优化架构：
 * 1. Python 常驻进程（daemon 模式） — 避免每次请求重新加载 OpenBB
 * 2. 内存缓存（30s TTL） — 短时间内重复请求直接返回
 * 3. 轻量快速报价（fast_quote） — 跳过 OpenBB 框架直接用 yfinance
 * 4. 向后兼容 — daemon 不可用时自动降级为单次进程模式
 */
import { spawn, execFile, type ChildProcess } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { createInterface, type Interface as RLInterface } from "node:readline";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");
const DAEMON_SCRIPT = resolve(PROJECT_ROOT, "scripts", "openbb_daemon.py");
const LEGACY_SCRIPT = resolve(PROJECT_ROOT, "scripts", "openbb_query.py");

/** 自动查找 .venv 中的 Python */
function findPython(): string {
  const venvPython = resolve(PROJECT_ROOT, ".venv", "bin", "python");
  if (existsSync(venvPython)) return venvPython;
  return "python3";
}

const PYTHON = findPython();

// ── 类型定义 ──

export interface QuoteData {
  symbol: string;
  name: string;
  last_price: number;
  open: number;
  high: number;
  low: number;
  prev_close: number;
  volume: number;
  change: number;
  change_percent: number;
  year_high: number;
  year_low: number;
  ma_50d: number;
  ma_200d: number;
  volume_average: number;
  currency: string | null;
}

export interface HistoricalBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface IndexData {
  symbol: string;
  name_zh?: string;
  date: string;
  close: number;
  open?: number;
  high?: number;
  low?: number;
  change: number;
  change_percent: number;
  volume: number;
  error?: boolean;
}

export interface MarketOverview {
  indices: IndexData[];
}

export interface TechnicalData {
  symbol: string;
  price: number;
  change: number;
  change_percent: number;
  ma: Record<string, number>;
  rsi: number | null;
  macd: { MACD: number; signal: number; histogram: number } | null;
  bbands: { upper: number; middle: number; lower: number } | null;
  atr: number | null;
  adx: number | null;
  obv: number | null;
  stochastic: { K: number; D: number } | null;
  recent: { date: string; close: number; volume: number }[];
  signals: string[];
  overall_signal: string;
  error?: string;
}

export interface DiscoveryItem {
  symbol?: string;
  name?: string;
  price?: number;
  change_percent?: number;
  volume?: number;
  [key: string]: unknown;
}

export interface NewsItem {
  date: string;
  title: string;
  url: string;
  source: string;
}

export interface SearchResult {
  symbol?: string;
  name?: string;
  cik?: string;
  [key: string]: unknown;
}

export interface FundamentalData {
  income?: Record<string, unknown>[];
  income_error?: string;
  balance?: Record<string, unknown>[];
  balance_error?: string;
  metrics?: Record<string, unknown>;
  metrics_error?: string;
  dividends?: Record<string, unknown>[];
  dividends_error?: string;
}

export interface OptionsItem {
  [key: string]: unknown;
}

export interface EconomyData {
  data?: Record<string, unknown>[];
}

// ── 缓存层（30s TTL）──

interface CacheEntry<T> {
  data: T;
  ts: number;
}

const CACHE_TTL = 30_000; // 30 秒
const cache = new Map<string, CacheEntry<unknown>>();

function cacheKey(command: string, params: Record<string, unknown>): string {
  return `${command}:${JSON.stringify(params)}`;
}

function getFromCache<T>(key: string): T | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.ts > CACHE_TTL) {
    cache.delete(key);
    return undefined;
  }
  return entry.data as T;
}

function setCache<T>(key: string, data: T): void {
  cache.set(key, { data, ts: Date.now() });
  // 清理过期条目（防止内存泄漏）
  if (cache.size > 200) {
    const now = Date.now();
    for (const [k, v] of cache) {
      if (now - v.ts > CACHE_TTL) cache.delete(k);
    }
  }
}

// ── Python 常驻进程管理 ──

interface DaemonResponse {
  id: string | null;
  ok: boolean;
  data?: unknown;
  error?: string;
  ready?: boolean;
}

let daemon: ChildProcess | null = null;
let daemonRL: RLInterface | null = null;
let daemonReady = false;
let daemonFailed = false;
let readyPromise: Promise<void> | null = null;
const pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
let reqCounter = 0;

function startDaemon(): Promise<void> {
  if (readyPromise) return readyPromise;
  if (daemonFailed) return Promise.reject(new Error("daemon 启动失败"));

  readyPromise = new Promise<void>((resolveReady, rejectReady) => {
    const proc = spawn(PYTHON, [DAEMON_SCRIPT], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    daemon = proc;

    proc.on("error", (err) => {
      daemonFailed = true;
      daemonReady = false;
      daemon = null;
      readyPromise = null;
      rejectReady(err);
    });

    proc.on("exit", () => {
      daemonReady = false;
      daemon = null;
      readyPromise = null;
      // reject 所有 pending 请求
      for (const [id, p] of pending) {
        clearTimeout(p.timer);
        p.reject(new Error("Python daemon 进程异常退出"));
        pending.delete(id);
      }
    });

    const rl = createInterface({ input: proc.stdout! });
    daemonRL = rl;

    rl.on("line", (line) => {
      let resp: DaemonResponse;
      try {
        resp = JSON.parse(line);
      } catch {
        return;
      }

      // ready 信号
      if (resp.ready) {
        daemonReady = true;
        resolveReady();
        return;
      }

      // 匹配 pending 请求
      const id = resp.id as string;
      const p = pending.get(id);
      if (!p) return;
      pending.delete(id);
      clearTimeout(p.timer);

      if (resp.ok) {
        p.resolve(resp.data);
      } else {
        p.reject(new Error(resp.error || "OpenBB 返回错误"));
      }
    });

    // 5 秒内未 ready 则认为启动失败
    setTimeout(() => {
      if (!daemonReady) {
        daemonFailed = true;
        proc.kill();
        rejectReady(new Error("daemon 启动超时"));
      }
    }, 5000);
  });

  return readyPromise;
}

function callDaemon<T>(command: string, params: Record<string, unknown>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (!daemon || !daemon.stdin || !daemonReady) {
      reject(new Error("daemon 未就绪"));
      return;
    }

    const id = String(++reqCounter);
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error("OpenBB 请求超时（>120s），请检查网络或重试"));
    }, 120_000);

    pending.set(id, {
      resolve: resolve as (v: unknown) => void,
      reject,
      timer,
    });

    const msg = JSON.stringify({ id, command, params }) + "\n";
    daemon.stdin.write(msg, (err) => {
      if (err) {
        pending.delete(id);
        clearTimeout(timer);
        reject(new Error(`写入 daemon 失败: ${err.message}`));
      }
    });
  });
}

// ── 降级模式：单次进程调用（原有逻辑）──

interface OpenBBResponse<T> {
  ok: boolean;
  data: T;
  error?: string;
}

function callLegacy<T>(command: string, params: Record<string, unknown> = {}): Promise<T> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      PYTHON,
      [LEGACY_SCRIPT],
      { timeout: 120_000, maxBuffer: 10 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          if (err.killed || (err as NodeJS.ErrnoException).code === "ETIMEDOUT") {
            reject(new Error("OpenBB 请求超时（>120s），请检查网络或重试"));
            return;
          }
          if ((err as NodeJS.ErrnoException).code === "ENOENT") {
            reject(new Error(`找不到 Python 解释器: ${PYTHON}，请确认 .venv 已创建`));
            return;
          }
          const msg = stderr?.trim() || err.message;
          reject(new Error(`OpenBB 调用失败: ${msg}`));
          return;
        }
        try {
          const result: OpenBBResponse<T> = JSON.parse(stdout);
          if (!result.ok) {
            reject(new Error(result.error || "OpenBB 返回错误"));
            return;
          }
          resolve(result.data);
        } catch {
          reject(new Error(`JSON 解析失败: ${stdout.slice(0, 200)}`));
        }
      },
    );

    if (child.stdin) {
      child.stdin.on("error", () => {});
      child.stdin.write(JSON.stringify({ command, params }));
      child.stdin.end();
    }
  });
}

// ── 核心调用（daemon 优先，降级单次进程，带缓存）──

async function callOpenBB<T>(command: string, params: Record<string, unknown> = {}): Promise<T> {
  // 查缓存
  const key = cacheKey(command, params);
  const cached = getFromCache<T>(key);
  if (cached !== undefined) return cached;

  let result: T;

  // 尝试 daemon 模式
  if (!daemonFailed) {
    try {
      if (!daemonReady) await startDaemon();
      result = await callDaemon<T>(command, params);
      setCache(key, result);
      return result;
    } catch {
      // daemon 失败，标记并降级
      daemonFailed = true;
    }
  }

  // 降级：单次进程
  result = await callLegacy<T>(command, params);
  setCache(key, result);
  return result;
}

/** 关闭常驻进程（CLI 退出时调用） */
export function shutdownDaemon(): void {
  if (daemon && daemon.stdin && daemonReady) {
    daemon.stdin.write(JSON.stringify({ id: "exit", command: "__exit__" }) + "\n");
  }
  if (daemonRL) daemonRL.close();
  if (daemon) daemon.kill();
  daemon = null;
  daemonReady = false;
  readyPromise = null;
}

// 进程退出时清理
process.on("exit", shutdownDaemon);

// ── 信号分类 ──

const BULL_KEYWORDS = ["超卖", "多头", "突破"] as const;
const BEAR_KEYWORDS = ["超买", "空头", "跌破"] as const;

export function classifySignal(sig: string): "bull" | "bear" | "neutral" {
  if (BULL_KEYWORDS.some(k => sig.includes(k))) return "bull";
  if (BEAR_KEYWORDS.some(k => sig.includes(k))) return "bear";
  return "neutral";
}

// ── 公开 API ──

/** 股票实时报价（轻量模式：fast_quote） */
export function getQuote(symbol: string): Promise<QuoteData> {
  return callOpenBB<QuoteData>("fast_quote", { symbol });
}

/** 股票实时报价（完整 OpenBB 模式） */
export function getQuoteFull(symbol: string): Promise<QuoteData> {
  return callOpenBB<QuoteData>("quote", { symbol });
}

/** 股票历史价格 */
export function getHistorical(symbol: string, days = 60): Promise<HistoricalBar[]> {
  return callOpenBB<HistoricalBar[]>("historical", { symbol, days });
}

/** 加密货币价格 */
export function getCryptoHistory(symbol: string, days = 30): Promise<HistoricalBar[]> {
  return callOpenBB<HistoricalBar[]>("crypto", { symbol, days });
}

/** 指数报价 */
export function getIndex(symbol: string): Promise<IndexData> {
  return callOpenBB<IndexData>("index", { symbol });
}

/** 全球市场概览 */
export function getMarketOverview(): Promise<MarketOverview> {
  return callOpenBB<MarketOverview>("market", {});
}

/** 涨幅榜 */
export function getGainers(limit = 10): Promise<DiscoveryItem[]> {
  return callOpenBB<DiscoveryItem[]>("gainers", { limit });
}

/** 跌幅榜 */
export function getLosers(limit = 10): Promise<DiscoveryItem[]> {
  return callOpenBB<DiscoveryItem[]>("losers", { limit });
}

/** 活跃榜 */
export function getActive(limit = 10): Promise<DiscoveryItem[]> {
  return callOpenBB<DiscoveryItem[]>("active", { limit });
}

/** 技术分析 */
export function getTechnical(symbol: string): Promise<TechnicalData> {
  return callOpenBB<TechnicalData>("technical", { symbol });
}

/** 搜索股票 */
export function searchEquity(query: string, limit = 10): Promise<SearchResult[]> {
  return callOpenBB<SearchResult[]>("search", { query, limit });
}

/** 公司新闻 */
export function getCompanyNews(symbol: string, limit = 10): Promise<NewsItem[]> {
  return callOpenBB<NewsItem[]>("news_company", { symbol, limit });
}

/** 全球新闻 */
export function getWorldNews(limit = 10): Promise<NewsItem[]> {
  return callOpenBB<NewsItem[]>("news_world", { limit });
}

/** 基本面数据（财报 + 估值指标） */
export function getFundamental(symbol: string, fields?: string[]): Promise<FundamentalData> {
  return callOpenBB<FundamentalData>("fundamental", { symbol, fields });
}

/** 期权链 */
export function getOptionsChain(symbol: string, limit = 20): Promise<OptionsItem[]> {
  return callOpenBB<OptionsItem[]>("options", { symbol, limit });
}

/** 宏观经济 — FRED 数据系列 */
export function getFredSeries(seriesId: string, limit = 20): Promise<EconomyData> {
  return callOpenBB<EconomyData>("economy", { indicator: "fred_series", series_id: seriesId, limit });
}

/** 宏观经济 — FRED 搜索 */
export function getFredSearch(query: string, limit = 10): Promise<EconomyData> {
  return callOpenBB<EconomyData>("economy", { indicator: "fred_search", query, limit });
}

/** 宏观经济 — 美国国债利率 */
export function getTreasuryRates(limit = 5): Promise<EconomyData> {
  return callOpenBB<EconomyData>("economy", { indicator: "treasury_rates", limit });
}
