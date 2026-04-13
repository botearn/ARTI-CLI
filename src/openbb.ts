/**
 * OpenBB 桥接层
 * 通过 child_process 调用 Python 脚本，封装为类型安全的异步函数
 */
import { execFile } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");
const SCRIPT_PATH = resolve(PROJECT_ROOT, "scripts", "openbb_query.py");

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

// ── 核心调用 ──

interface OpenBBResponse<T> {
  ok: boolean;
  data: T;
  error?: string;
}

function callOpenBB<T>(command: string, params: Record<string, unknown> = {}): Promise<T> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      PYTHON,
      [SCRIPT_PATH],
      { timeout: 120_000, maxBuffer: 10 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
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

    // 通过 stdin 传入命令
    child.stdin?.write(JSON.stringify({ command, params }));
    child.stdin?.end();
  });
}

// ── 公开 API ──

/** 股票实时报价 */
export function getQuote(symbol: string): Promise<QuoteData> {
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
