/**
 * Supabase Edge Function 调用封装
 * 直接 HTTP 调用，无需认证（verify_jwt = false）
 */

const BASE_URL = "https://xzxcpastkeinorggtjaa.supabase.co/functions/v1";

export class ApiError extends Error {
  constructor(
    public functionName: string,
    public status: number,
    message: string,
  ) {
    super(`[${functionName}] ${message}`);
    this.name = "ApiError";
  }
}

export async function callEdge<T>(
  functionName: string,
  body: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`${BASE_URL}/${functionName}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "unknown error");
    let msg = text;
    try {
      const json = JSON.parse(text);
      if (json.error) msg = json.error;
    } catch { /* 非 JSON，用原始文本 */ }
    throw new ApiError(functionName, res.status, msg);
  }

  return res.json() as Promise<T>;
}

// ── 行情接口 ──

export interface StockQuote {
  symbol: string;
  name: string;
  nameZh: string;
  price: number;
  change: number;
  changePercent: number;
  volume: string;
  market: "US" | "HK" | "CN";
  sparkline: number[];
}

export interface MarketIndex {
  name: string;
  nameZh: string;
  value: number;
  change: number;
  changePercent: number;
}

export async function fetchQuotes(symbols: string): Promise<{ quotes: StockQuote[]; indices: MarketIndex[] }> {
  return callEdge("stock-quotes", { symbols });
}

// ── 股票代码解析 ──

export async function resolveStock(text: string): Promise<string | null> {
  const res = await callEdge<{ symbol: string | null }>("resolve-stock", { text });
  return res.symbol;
}

// ── 研报接口 ──

export interface ResearchReport {
  title: string;
  summary: string;
  keyPoints: string[];
  sentiment: string;
  confidence: number;
  fullReport: string;
}

export const AGENT_TYPES = ["natasha", "steve", "tony", "thor", "clint", "sam", "vision"] as const;

export const AGENT_LABELS: Record<string, string> = {
  natasha: "情报·宏观",
  steve: "板块轮动",
  tony: "技术面",
  thor: "风控",
  clint: "基本面",
  sam: "收益分析",
  vision: "量化验证",
};

export async function fetchResearch(
  symbol: string,
  agentType: string,
  stockData?: string,
): Promise<ResearchReport> {
  return callEdge("stock-research", { symbol, agentType, stockData });
}

// ── 技术扫描 ──

export async function scanStock(symbol: string): Promise<Record<string, unknown>> {
  return callEdge("scan-stock", { symbol });
}
