/**
 * Supabase Edge Function 调用封装
 * 直接 HTTP 调用，无需认证（verify_jwt = false）
 * 支持超时控制和自动重试
 */
import { loadConfig } from "./config.js";
import { ensureValidAccessToken } from "./auth.js";

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

function extractSseEvents(
  buffer: string,
): { events: OrchestratorSSEEvent[]; remainder: string } {
  const chunks = buffer.split(/\r?\n\r?\n/);
  const remainder = chunks.pop() || "";
  const events: OrchestratorSSEEvent[] = [];

  for (const chunk of chunks) {
    const trimmed = chunk.trim();
    if (!trimmed || trimmed.startsWith(":")) continue;

    const dataLines = trimmed
      .split(/\r?\n/)
      .filter(line => line.startsWith("data: "))
      .map(line => line.slice(6));

    if (!dataLines.length) continue;

    const payload = dataLines.join("\n").trim();
    if (!payload || payload === "[DONE]") continue;

    try {
      events.push(JSON.parse(payload) as OrchestratorSSEEvent);
    } catch {
      // 非 JSON 行，跳过
    }
  }

  return { events, remainder };
}

export async function callEdge<T>(
  functionName: string,
  body: Record<string, unknown>,
): Promise<T> {
  const config = loadConfig();
  const baseUrl = config.api.baseUrl;
  const timeout = config.api.timeout;

  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      // 尝试获取 token，失败时继续（某些端点可能不需要认证）
      let authToken = "";
      try {
        authToken = await ensureValidAccessToken();
      } catch (err) {
        // 开发模式或 BILLING_BYPASS 时忽略认证错误
        if (process.env.ARTI_BILLING_BYPASS || process.env.NODE_ENV === "development") {
          console.warn("[API] 认证失败，继续无认证请求:", (err as Error).message);
        } else {
          throw err;
        }
      }

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

      if (res.status === 401 && config.auth.refreshToken) {
        if (attempt < MAX_RETRIES) {
          await ensureValidAccessToken({ forceRefresh: true });
          continue;
        }
      }

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
  keyPoints: string[] | string | null | undefined;  // 容错：支持多种格式
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

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 600_000); // 10 分钟超时
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;

  try {
    let authToken = await ensureValidAccessToken();
    let res = await fetch(`${baseUrl}/orchestrator`, {
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

    if (res.status === 401 && config.auth.refreshToken) {
      authToken = await ensureValidAccessToken({ forceRefresh: true });
      res = await fetch(`${baseUrl}/orchestrator`, {
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
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "unknown");
      throw new ApiError("orchestrator", res.status, text);
    }

    if (!res.body) throw new Error("SSE 响应无 body");

    reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const parsed = extractSseEvents(buffer);
      buffer = parsed.remainder;

      for (const event of parsed.events) {
        yield event;
      }
    }

    if (buffer.trim()) {
      const parsed = extractSseEvents(`${buffer}\n\n`);
      for (const event of parsed.events) {
        yield event;
      }
    }
  } finally {
    if (reader) {
      try {
        await reader.cancel();
      } catch {
        // 连接已结束或已取消，忽略
      }
    }
    controller.abort();
    clearTimeout(timer);
  }
}

// ── 技术扫描 ──

export async function scanStock(symbol: string): Promise<Record<string, unknown>> {
  return callEdge("scan-stock", { symbol });
}

// ────────────────────────────────────────────────────────────────────
// Railway Backend API 客户端
// ────────────────────────────────────────────────────────────────────

/**
 * 调用 Railway Backend API (Python FastAPI)
 * 支持超时控制、自动重试、JWT 鉴权
 */
export async function callBackend<T>(
  endpoint: string,
  body: Record<string, unknown>,
  options: { timeout?: number; maxRetries?: number } = {},
): Promise<T> {
  const config = loadConfig();
  const baseUrl = config.backend.url;
  const timeout = options.timeout ?? config.backend.timeout;
  const maxRetries = options.maxRetries ?? MAX_RETRIES;

  if (!baseUrl) {
    throw new Error(
      "Backend URL 未配置，请设置 ARTI_BACKEND_URL 环境变量或运行: arti config set backend.url <URL>"
    );
  }

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const authToken = await ensureValidAccessToken();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      const res = await fetch(`${baseUrl}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (res.status === 401 && config.auth.refreshToken) {
        if (attempt < maxRetries) {
          await ensureValidAccessToken({ forceRefresh: true });
          continue;
        }
      }

      if (!res.ok) {
        const text = await res.text().catch(() => "unknown error");
        let msg = text;
        try {
          const json = JSON.parse(text);
          if (json.error) msg = json.error;
          if (json.detail) msg = json.detail; // FastAPI 格式
        } catch { /* 非 JSON，用原始文本 */ }
        throw new ApiError(endpoint, res.status, msg);
      }

      return await res.json() as T;
    } catch (err) {
      lastError = err;
      // AbortController 超时转为友好错误
      if (err instanceof DOMException && err.name === "AbortError") {
        lastError = new Error(`Backend 请求超时（${timeout / 1000}s）: ${endpoint}`);
      }
      if (attempt < maxRetries && isRetryable(err)) {
        await sleep(RETRY_DELAY_MS * (attempt + 1));
        continue;
      }
      break;
    }
  }

  throw lastError;
}

// ── Edge: scan-stock ──

export interface BackendStockData {
  code: string;
  name: string | null;
  price: number;
  pct: number;
  ma5?: number | null;
  ma10?: number | null;
  ma20?: number | null;
  ma60?: number | null;
  rsi?: number | null;
  macd?: number | null;
  atr?: number | null;
  atr_stop?: number | null;
  atr_pct?: number | null;
  bb_pos?: number | null;
  bb_up?: number | null;
  bb_dn?: number | null;
  vol_ratio: number;
  curr_vol: number | string;
  turnover: number | null;
  support?: number | null;
  resist?: number | null;
  overall_signal?: string | null;
  trend_signal?: string | null;
  tech: {
    trend: string;
    ma5: number | null;
    ma10: number | null;
    ma20: number | null;
    ma60: number | null;
    rsi: number | null;
    macd: number | null;
    bb_pos: number | null;
    bb_up: number | null;
    bb_dn: number | null;
    atr: number | null;
    atr_stop: number | null;
    atr_pct: number | null;
    support: number | null;
    resist: number | null;
  };
  recent_5d: Array<{
    date: string;
    close: number;
    pct: number;
    vol: number;
  }>;
  fundamentals: Record<string, unknown> | null;
  profile: Record<string, unknown> | null;
  data_as_of: string | null;
  market_status: string | null;
}

export interface BackendScanResponse {
  scan: BackendStockData;
}

interface V1SuccessEnvelope<T> {
  data: T;
  meta: {
    requestId: string;
    apiVersion: "v1";
    billing?: Record<string, unknown>;
  };
}

export async function scanStockBackend(symbol: string): Promise<BackendScanResponse> {
  const envelope = await callEdge<V1SuccessEnvelope<BackendScanResponse>>("v1-scan-stock", { symbol });
  return envelope.data;
}

// ── Backend: orchestrator (SSE 流式) ──

export async function* streamOrchestratorBackend(
  symbol: string,
  opts?: { stockData?: string; mode?: string; layer1Agents?: string[]; layer2Masters?: string[] },
): AsyncGenerator<OrchestratorSSEEvent> {
  const config = loadConfig();
  const baseUrl = config.backend.url;

  if (!baseUrl) {
    throw new Error("Backend URL 未配置");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 600_000); // 10 分钟超时
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;

  // M-S5：用 ensureValidAccessToken 取 token（过期自动刷新），并在 401 时强制刷新后重试
  const body = JSON.stringify({
    symbol,
    stockData: opts?.stockData || "",
    mode: opts?.mode || "layer1-only",  // 修复：默认全景报告而非深度报告
    layer1Agents: opts?.layer1Agents,
    layer2Masters: opts?.layer2Masters,
  });
  const doFetch = (token: string) => fetch(`${baseUrl}/v1/orchestrator`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body,
    signal: controller.signal,
  });

  try {
    let authToken = await ensureValidAccessToken();
    let res = await doFetch(authToken);

    if (res.status === 401 && config.auth.refreshToken) {
      authToken = await ensureValidAccessToken({ forceRefresh: true });
      res = await doFetch(authToken);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "unknown");
      throw new ApiError("/v1/orchestrator", res.status, text);
    }

    if (!res.body) throw new Error("SSE 响应无 body");

    reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const parsed = extractSseEvents(buffer);
      buffer = parsed.remainder;

      for (const event of parsed.events) {
        yield event;
      }
    }

    if (buffer.trim()) {
      const parsed = extractSseEvents(`${buffer}\n\n`);
      for (const event of parsed.events) {
        yield event;
      }
    }
  } finally {
    if (reader) {
      try {
        await reader.cancel();
      } catch {
        // 连接已结束或已取消，忽略
      }
    }
    controller.abort();
    clearTimeout(timer);
  }
}

// ── Edge: chat（SSE 流式）──

type ChatSseEvent =
  | { type: "message.delta"; data: { content?: string } }
  | { type: "message.done"; data: { requestId?: string; model?: string } }
  | { type: "billing"; data: Record<string, unknown> }
  | { type: "error"; data: { code?: string; message?: string; status?: number } }
  | { type: string; data: Record<string, unknown> };

function parseChatSseEvent(frame: string): ChatSseEvent | null {
  let type = "";
  const dataLines: string[] = [];

  for (const line of frame.trim().split(/\r?\n/)) {
    if (line.startsWith("event:")) type = line.slice(6).trim();
    if (line.startsWith("data:")) dataLines.push(line.slice(5).replace(/^ /, ""));
  }
  if (!type || !dataLines.length) return null;

  try {
    const data = JSON.parse(dataLines.join("\n"));
    if (!data || typeof data !== "object" || Array.isArray(data)) return null;
    return { type, data } as ChatSseEvent;
  } catch {
    return null;
  }
}

/** 调用产品 v1-chat 函数，流式返回文本增量 */
export async function* streamChat(
  messages: Array<{ role: string; content: string }>,
): AsyncGenerator<string> {
  const config = loadConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 300_000); // 5 分钟超时
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;

  const request = async (forceRefresh = false): Promise<Response> => {
    const authToken = await ensureValidAccessToken(forceRefresh ? { forceRefresh: true } : undefined);
    return fetch(`${config.api.baseUrl}/v1-chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: JSON.stringify({ messages }),
      signal: controller.signal,
    });
  };

  try {
    let res = await request();
    if (res.status === 401 && config.auth.refreshToken) res = await request(true);

    if (!res.ok) {
      const text = await res.text().catch(() => "unknown");
      throw new ApiError("v1-chat", res.status, text);
    }
    if (!res.body) throw new Error("SSE 响应无 body");

    reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let done = false;

    while (!done) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() || "";

      for (const frame of frames) {
        const event = parseChatSseEvent(frame);
        if (event?.type === "message.delta" && typeof event.data.content === "string") {
          yield event.data.content;
        } else if (event?.type === "message.done") {
          done = true;
        } else if (event?.type === "error") {
          const error = event.data as { code?: string; message?: string; status?: number };
          throw new ApiError("v1-chat", error.status ?? 500, error.message ?? error.code ?? "聊天失败");
        }
        // billing 与未知事件不产出正文；消费完成即确认计费。
      }
    }
  } finally {
    if (reader) {
      try { await reader.cancel(); } catch { /* 已结束，忽略 */ }
    }
    controller.abort();
    clearTimeout(timer);
  }
}

// ── Edge: classify-intent（意图识别，复用产品分类器）──

export interface IntentResult {
  intent: string;
  symbol: string | null;
  needs_symbol: boolean;
}

/** 复用产品 classify-intent 边缘函数，把自由文本分类为意图 */
export async function classifyIntent(text: string, lastSymbol?: string | null): Promise<IntentResult> {
  return callEdge<IntentResult>("classify-intent", { text, last_symbol: lastSymbol ?? null });
}

// ── Backend: route ──

export interface RouteDecision {
  rule: string;
  condition: string;
  selectedMasters: string[];
  reasoning: string;
}

export async function routeIntent(
  input: string,
  chatHistory?: Array<{ role: string; content: string }>,
  watchlistSymbols?: string[],
): Promise<RouteDecision> {
  return callBackend("/v1/route", { input, chatHistory, watchlistSymbols });
}

// ── Backend: stock-quotes (可选，可保留 yfinance 作为 fallback) ──

export async function fetchQuotesBackend(symbols: string): Promise<{ quotes: StockQuote[]; indices: MarketIndex[] }> {
  return callBackend("/v1/stock-quotes", { symbols });
}

// ── Backend: resolve-stock ──

export async function resolveStockBackend(text: string, watchlistSymbols?: string[]): Promise<string | null> {
  const res = await callBackend<{ symbol: string | null }>("/v1/resolve-stock", { text, watchlistSymbols });
  return res.symbol;
}
