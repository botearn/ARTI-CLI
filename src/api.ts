/**
 * Supabase Edge Function 调用封装
 * 直接 HTTP 调用，无需认证（verify_jwt = false）
 * 支持超时控制和自动重试
 */
import { loadConfig } from "./config.js";

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

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;

function isRetryable(err: unknown): boolean {
  // 网络层错误：可重试
  if (err instanceof TypeError) return true;
  // 5xx 服务端错误：可重试
  if (err instanceof ApiError && err.status >= 500) return true;
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function callEdge<T>(
  functionName: string,
  body: Record<string, unknown>,
): Promise<T> {
  const config = loadConfig();
  const baseUrl = config.api.baseUrl;
  const timeout = config.api.timeout;
  const authToken = config.auth.token;

  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      const res = await fetch(`${baseUrl}/${functionName}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!res.ok) {
        const text = await res.text().catch(() => "unknown error");
        let msg = text;
        try {
          const json = JSON.parse(text);
          if (json.error) msg = json.error;
        } catch { /* 非 JSON，用原始文本 */ }
        throw new ApiError(functionName, res.status, msg);
      }

      return await res.json() as T;
    } catch (err) {
      lastError = err;
      // AbortController 超时转为友好错误
      if (err instanceof DOMException && err.name === "AbortError") {
        lastError = new Error(`请求超时（${timeout / 1000}s）: ${functionName}`);
      }
      if (attempt < MAX_RETRIES && isRetryable(err)) {
        await sleep(RETRY_DELAY_MS * (attempt + 1));
        continue;
      }
      break;
    }
  }

  throw lastError;
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

export interface MasterOpinion {
  role: string;
  stance: string;
  content: string;
}

export interface SynthesisResult {
  bull_coalition?: string;
  bear_challenge?: string;
  key_divergence?: string;
  roundtable_verdict?: string;
  failure_signals?: string[];
  raw_synthesis?: string;
}

export interface OrchestratorSSEEvent {
  type: string;
  // layer1_agent_done
  agent?: string;
  label?: string;
  report?: ResearchReport;
  error?: string;
  // router_done
  rule?: string;
  selectedMasters?: string[];
  reasoning?: string;
  // layer2_master_done
  master?: string;
  opinion?: MasterOpinion;
  // synthesis
  // layer1_complete
  summary?: string;
  // route_info
  layer1Agents?: string[];
  theme?: string | null;
}

export const AGENT_TYPES = ["natasha", "steve", "tony", "thor", "clint", "sam", "vision", "wanda"] as const;

export const AGENT_LABELS: Record<string, string> = {
  natasha: "情报·宏观",
  steve: "板块轮动",
  tony: "技术面",
  thor: "风控",
  clint: "基本面",
  sam: "收益分析",
  vision: "量化验证",
  wanda: "组合策略",
};

export const MASTER_LABELS: Record<string, string> = {
  buffett: "巴菲特·价值派",
  lynch: "林奇·成长派",
  marks: "马克斯·周期派",
  soros: "索罗斯·反身性派",
  dalio: "达里奥·全天候派",
  druckenmiller: "德鲁肯米勒·动量派",
  duan: "段永平·生意模式派",
};

export async function fetchResearch(
  symbol: string,
  agentType: string,
  stockData?: string,
): Promise<ResearchReport> {
  return callEdge("stock-research", { symbol, agentType, stockData });
}

/**
 * 调用 orchestrator SSE 端点，返回异步事件迭代器
 * 三层结构：Layer 1 分析师 → Router + Layer 2 大师辩论 → Synthesis 合成
 */
export async function* streamOrchestrator(
  symbol: string,
  opts?: { stockData?: string; mode?: string },
): AsyncGenerator<OrchestratorSSEEvent> {
  const config = loadConfig();
  const baseUrl = config.api.baseUrl;
  const authToken = config.auth.token;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 600_000); // 10 分钟超时

  try {
    const res = await fetch(`${baseUrl}/orchestrator`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: JSON.stringify({
        symbol,
        stockData: opts?.stockData || "",
        mode: opts?.mode || "full",
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "unknown");
      throw new ApiError("orchestrator", res.status, text);
    }

    if (!res.body) throw new Error("SSE 响应无 body");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // 解析 SSE：以 \n\n 分割事件
      const parts = buffer.split("\n\n");
      buffer = parts.pop() || "";

      for (const part of parts) {
        const trimmed = part.trim();
        if (!trimmed || trimmed.startsWith(":")) continue; // 心跳或注释
        const dataLine = trimmed.split("\n").find(l => l.startsWith("data: "));
        if (!dataLine) continue;
        try {
          const event = JSON.parse(dataLine.slice(6)) as OrchestratorSSEEvent;
          yield event;
        } catch {
          // 非 JSON 行，跳过
        }
      }
    }
  } finally {
    clearTimeout(timer);
  }
}

// ── 技术扫描 ──

export async function scanStock(symbol: string): Promise<Record<string, unknown>> {
  return callEdge("scan-stock", { symbol });
}
